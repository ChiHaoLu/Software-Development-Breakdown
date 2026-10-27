---
title: "File System & I/O"
---

**在 Unix 裡「一切皆檔案」：一般檔案、目錄、socket、pipe、裝置，都用同一組 `open` / `read` / `write` / `close` 操作。** Process 打開任何東西都會拿到一個整數 **file descriptor（fd）**，之後就用這個數字操作它。

## File Descriptor

```text
Process 的 fd table         kernel 的 open file table      inode
  0 stdin   ─────────────→  （終端機）
  1 stdout  ─────────────→  （終端機）
  2 stderr  ─────────────→  （終端機）
  3         ─────────────→  offset=120, mode=r  ───────→  /var/log/app.log
  4         ─────────────→  TCP socket 10.0.0.5:5432
```

- 0、1、2 固定是 stdin、stdout、stderr，shell 的 `2>&1` 就是「把 fd 2 指到 fd 1 指的地方」。
- 每個 process 能開的 fd 數量有上限（`ulimit -n`，常見預設 1024）。高併發的服務每條連線都佔一個 fd，常會遇到 **`too many open files`**，要調高上限（systemd 的 `LimitNOFILE`）。
- 忘記 `close` 會造成 fd leak。用 `ls -l /proc/<pid>/fd` 或 `lsof -p <pid>` 查看 process 開了什麼。

## 檔案系統

### Inode

檔案的 metadata（權限、擁有者、大小、時間、資料在磁碟上的位置）存在 **inode** 裡，**檔名不在 inode 裡**，而是存在目錄中：目錄本身就是一張「檔名 → inode 編號」的表。

| | Hard Link | Symbolic Link |
| --- | --- | --- |
| 本質 | 目錄裡另一筆指到同一個 inode 的檔名 | 一個特殊檔案，內容是另一個路徑 |
| 刪除原檔 | 還能用（inode 的 link count 歸零才真的刪除） | 變成斷掉的連結 |
| 跨檔案系統 | 不行 | 可以 |
| 指向目錄 | 不行 | 可以 |

- `df -h` 有空間但還是寫不進去：可能是 **inode 用完了**（大量小檔案），用 `df -i` 檢查。
- 刪了大檔案空間卻沒釋放：還有 process 開著它，inode 沒被回收，用 `lsof +L1` 找出來，重啟該 process。

### 常見檔案系統

| 檔案系統 | 特色 |
| --- | --- |
| ext4 | Linux 預設，穩定 |
| XFS | 大檔案、高併發表現好，RHEL 預設 |
| Btrfs / ZFS | Copy-on-Write、snapshot、checksum |
| tmpfs | 放在記憶體裡，重開機就消失（`/tmp`、`/dev/shm`） |
| overlayfs | 多層疊在一起，container image 的基礎 |

### Journaling

寫檔通常要改好幾個地方（資料區、inode、空間配置表），中途斷電會不一致。**Journaling** 先把要做的修改寫進日誌再實際執行，和資料庫的 [WAL](/backend/database/transaction#atomicity-與-durabilitywal) 是同樣的想法。ext4 預設只 journal metadata，不保證檔案內容。

## Page Cache 與 fsync

`write()` 回傳時，資料**通常還沒到磁碟**，只是寫進了 kernel 的 **page cache**（記憶體），kernel 之後才在背景寫回（writeback）。

```text
write() ──→ page cache（dirty page） ──背景寫回──→ 磁碟
                     │
              fsync() 強制等它寫完
```

- 好處：寫入很快，重複讀同一個檔案也直接從記憶體拿。
- 風險：斷電時 page cache 裡還沒寫回的資料會遺失。
- **`fsync(fd)`**：等到這個檔案的資料和 metadata 真的落盤才回傳。資料庫的 commit 就是靠 fsync WAL 保證 durability，所以 fsync 的速度直接影響 commit 延遲。
- **`O_DIRECT`**：繞過 page cache 直接讀寫磁碟，自己管理 cache 的資料庫（如 InnoDB）會用。
- 新建檔案後，**目錄也要 fsync**，否則斷電後檔名可能不見。

## I/O 模型

一個服務要同時處理上萬條連線，大部分連線大部分時間都在等資料。問題是：怎麼等？

| 模型 | 做法 | 缺點 |
| --- | --- | --- |
| Blocking I/O | `read()` 沒資料就睡著，一條連線一個 thread | thread 太多，記憶體與 context switch 撐不住（C10K 問題） |
| Non-blocking I/O | `read()` 沒資料立刻回傳 `EAGAIN` | 要一直輪詢，浪費 CPU |
| I/O Multiplexing | 一次問 kernel「這些 fd 裡哪些可以讀了」 | 主流做法 |
| Async I/O | 送出請求後就不管，完成時 kernel 通知 | Linux 上以 `io_uring` 為代表 |

### select / poll / epoll

| | select | poll | epoll |
| --- | --- | --- | --- |
| fd 上限 | 1024（`FD_SETSIZE`） | 無 | 無 |
| 每次呼叫 | 把整組 fd 從 user space 複製到 kernel | 同左 | fd 只要註冊一次 |
| 找出就緒的 fd | 掃過所有 fd，O(n) | O(n) | 直接回傳就緒的，O(就緒數) |

epoll 的使用方式：

```c
int ep = epoll_create1(0);
epoll_ctl(ep, EPOLL_CTL_ADD, client_fd, &ev);    // 註冊要監聽的 fd
while (1) {
    int n = epoll_wait(ep, events, MAX, -1);     // 睡到有 fd 就緒
    for (int i = 0; i < n; i++) handle(events[i].data.fd);
}
```

- **Level-triggered**（預設）：只要 fd 還有資料可讀，每次 `epoll_wait` 都會回報。
- **Edge-triggered**：只在狀態改變時回報一次，要一次把資料讀完，效率較高但容易寫錯。
- macOS / BSD 的對應機制是 **kqueue**。

這就是 **event loop** 的底層：Nginx、Redis、Node.js（libuv）、Tokio 都是一個（或少數幾個）thread 跑 epoll 迴圈。Go 的 netpoller 也用 epoll，只是包裝成看起來像 blocking 的 API，見 [Goroutine](/code/language/go/goroutine#scheduler-做了哪些事)。

### io_uring

Linux 5.1 加入。User space 和 kernel 共用兩個 ring buffer：程式把請求放進 submission queue，kernel 完成後把結果放進 completion queue。

- 可以一次送出大量請求，大幅減少 system call 次數。
- 支援一般檔案的非同步 I/O（epoll 對一般檔案沒有用，一般檔案永遠是「可讀」）。
- 曾出現多個安全漏洞，部分環境（如 Docker 預設的 seccomp profile、Android）會停用它。

## Zero-Copy

傳統把檔案送到網路要複製四次：

```text
磁碟 → page cache → user buffer → socket buffer → 網卡
       （DMA）       （CPU）        （CPU）         （DMA）
```

**`sendfile()`** 讓資料直接從 page cache 送到 socket，不經過 user space，省掉兩次 CPU 複製和多次 context switch。Kafka 把 log 送給 consumer、Nginx 送靜態檔案都用這招。`splice()`、`mmap` + `write` 也是類似的手法。

## 一句話總結

> 一切皆檔案，打開就拿到 fd，要注意 fd 上限。`write` 只寫進 page cache，要保證落盤得 `fsync`。高併發服務靠 epoll（或 io_uring）讓少數 thread 管理大量連線。`sendfile` 省掉 user space 的複製。

## Reference

- [OSTEP: File System Implementation](https://pages.cs.wisc.edu/~remzi/OSTEP/file-implementation.pdf)
- [The C10K problem](http://www.kegel.com/c10k.html)
- [epoll(7) — Linux manual page](https://man7.org/linux/man-pages/man7/epoll.7.html)
- [Efficient IO with io_uring](https://kernel.dk/io_uring.pdf)
