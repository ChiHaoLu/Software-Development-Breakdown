---
title: "Process & Thread"
---

一個 Program 代表著一個可執行檔，裡面會有很多指令（instructions）和 disk 儲存操作，一個 program 可能會有多個 processes。

執行一個 program 代表著在這 program 之中的 process 被 loaded 進 memory 並且被啟動，這個 process 要啟動會需要一些必要的資源，包含 registers, program counter 和 stack。

而 Thread 是 process 在執行的最小單位。

可理解 **Process 是「執行中的程式」，是 OS 分配資源的單位；thread 是 process 裡的執行流程，是 CPU 排程的單位。** 同一個 process 的 thread 共用記憶體，不同 process 之間預設互相隔離。

## Process vs. Thread

| | Process | Thread |
| --- | --- | --- |
| 記憶體 | 各自獨立的位址空間 | 共用所屬 process 的位址空間 |
| 各自擁有 | page table、file descriptor table、PID | stack、暫存器、thread ID |
| 建立成本 | 高（要複製 page table 等） | 低 |
| 切換成本 | 高（要換 page table，TLB 失效） | 較低 |
| 溝通方式 | IPC（pipe、socket、shared memory） | 直接讀寫共用變數（要加鎖） |
| 一個掛掉 | 不影響其他 process | 通常整個 process 一起掛 |

在 Linux 裡兩者其實都是 **task**，差別只在建立時（`clone()`）共用多少資源。

一個 process 在記憶體中大致長這樣（見 [Memory](/os/memory)）：

```text
高位址  ┌──────────────┐
        │ Stack        │ ← 每個 thread 各一個，往下長
        │      ↓       │
        │      ↑       │
        │ Heap         │ ← malloc / new，往上長
        ├──────────────┤
        │ BSS / Data   │ ← 全域變數
        ├──────────────┤
低位址  │ Text         │ ← 程式碼（唯讀）
        └──────────────┘
```

## Process 的狀態

```text
         排到 CPU
  Ready ─────────→ Running ──→ Terminated
    ↑   ←─────────    │
    │    時間片用完     │ 等 I/O、等鎖、sleep
    └──── Blocked ←───┘
         事件發生
```

`ps` / `top` 的 `STAT` 欄位：`R` running / runnable、`S` 可中斷的睡眠（等事件）、`D` 不可中斷的睡眠（通常在等磁碟 I/O）、`Z` zombie、`T` stopped。大量 `D` 狀態通常代表 I/O 卡住。

## 建立 Process：fork 與 exec

Unix 把「建立 process」拆成兩步：

```c
pid_t pid = fork();          // 複製一份目前的 process
if (pid == 0) {
    execvp("ls", args);      // 子 process：把自己換成另一個程式
} else {
    waitpid(pid, &status, 0); // 父 process：等子 process 結束
}
```

- **`fork()`**：複製出一個子 process，兩者從同一行繼續執行，靠回傳值區分（子 process 拿到 0）。現代 kernel 用 **Copy-on-Write**：一開始共用同一份實體記憶體，等其中一方要寫時才真的複製那一頁，所以 fork 很快。
- **`exec()`**：把目前 process 的程式換成另一個執行檔，PID 不變。
- **`wait()`**：父 process 回收子 process 的結束狀態。

Shell 執行每個指令都是 fork + exec。

### Zombie 與 Orphan

- **Zombie**：子 process 結束了，但父 process 還沒 `wait()`，kernel 只好留著它的 PID 與結束狀態。少量無害，大量會用光 PID。
- **Orphan**：父 process 先結束，子 process 會被 PID 1（`init` / `systemd`）收養，由它負責回收。

這也是 container 要注意 PID 1 的原因：container 裡的 PID 1 通常是你的應用程式，它不一定會回收 zombie，也不一定會處理 `SIGTERM`。可以用 `docker run --init` 或 `tini` 當 PID 1，見 [systemd 與 Signal](/os/linux/systemd)。

## Context Switch

**CPU 從做 A 換到做 B 時，要先收拾 A、再擺開 B，這段時間 CPU 沒有在做正事。**

把 CPU 想成一位只有一張書桌的工程師，輪流做好幾個專案：

| 步驟 | 比方 | 實際上 |
| --- | --- | --- |
| 1. 保存目前 task 的狀態 | 記下寫到第幾行、草稿寫了什麼、待辦清單記到哪 | 存下 program counter（下一條指令）、暫存器（正在算的資料）、stack pointer（函式呼叫疊到哪層） |
| 2. 載入下一個 task 的狀態 | 攤開另一個專案的筆記，從上次停下的地方繼續 | 把 B 的 program counter、暫存器、stack pointer 載回 CPU |
| 3. 換到不同 process 時，換 page table | 新專案屬於另一家公司，資料櫃整個換掉，背熟的位置也全部作廢 | 換成 B 的 [page table](/os/memory#virtual-memory-與-paging)，TLB 跟著失效 |

同一個 process 裡的 thread 共用 page table，切換時只要做 1、2；換到另一個 process 還要多做 3，所以比較貴。

**TLB** 是 CPU 裡記住「虛擬位址 → 實體位址」翻譯結果的小 cache，像貼在螢幕旁的便利貼，記著最近查過的幾筆，不用每次都去翻 page table 這本厚對照表。但每個 process 的對照表不同，換 process 後便利貼上的內容都是錯的，必須清掉，新的 process 一開始只能一筆一筆重新查。詳見 [Memory](/os/memory#tlb)。

此外還有隱藏成本：CPU cache 裡放的是 A 的資料，換成 B 之後要的資料都不在 cache 裡，只能從較慢的 RAM 重新讀（cache miss）。

一次切換只要幾微秒，但切換一頻繁，CPU 就忙著切換而不是處理工作。例如一萬條連線各配一個 thread，大部分 thread 都在等網路資料，CPU 卻要在它們之間不停切換。所以 Nginx、Redis 改用少數 thread 搭配 [epoll](/os/io#io-模型)，Go 則讓 goroutine 在 user space 切換，不需要 kernel 介入（見 [Goroutine](/code/language/go/goroutine)）。

## 排程（Scheduling）

Ready 的 task 比 CPU 多時，scheduler 決定誰先跑。

| 演算法 | 做法 | 問題 |
| --- | --- | --- |
| FCFS | 先來先跑 | 一個長工作卡住後面所有短工作 |
| SJF | 最短的先跑 | 要預知執行時間；長工作可能永遠排不到（starvation） |
| Round Robin | 每人輪流跑一個時間片 | 時間片太短切換成本高，太長反應慢 |
| Priority | 優先權高的先跑 | 低優先權會 starvation，常用 aging 慢慢提高 |
| MLFQ | 多層 queue，用完時間片就降級 | 互動式（常 block）的 task 留在高優先權 |

Linux 的一般 task 原本用 **CFS（Completely Fair Scheduler）**：記錄每個 task 用了多少 CPU 時間（vruntime），每次挑用最少的來跑。6.6 版之後改成 **EEVDF**，同樣追求公平，但對延遲敏感的 task 反應更好。

- **`nice`**：-20（最優先）到 19（最不優先），調整 task 分到的 CPU 比例。
- **即時排程**（`SCHED_FIFO`、`SCHED_RR`）：優先於一般 task，用在需要固定延遲的場景。
- **CPU affinity**（`taskset`）：把 task 綁在特定 CPU 上，減少 cache 失效。

## Thread 模型與 Goroutine

| 模型 | 對應關係 | 例子 |
| --- | --- | --- |
| 1:1 | 每個 user thread 對應一個 kernel thread | Linux pthread、Java（傳統 thread）、Rust `std::thread` |
| N:1 | 多個 user thread 跑在一個 kernel thread 上 | 早期 green thread；一個 block 全部 block |
| M:N | M 個 user thread 分配到 N 個 kernel thread | Go goroutine、Java virtual thread、Tokio task |

Go 是 M:N 的代表：runtime 內建自己的 scheduler（**GMP** 模型），把大量 goroutine 分配到少數 OS thread 上，切換在 user space 完成，不需要 kernel 介入。詳見 [Goroutine](/code/language/go/goroutine)。

## IPC（Inter-Process Communication）

| 方式 | 特性 | 常見用途 |
| --- | --- | --- |
| Pipe | 單向、有親屬關係的 process 之間 | shell 的 `cmd1 \| cmd2` |
| Named pipe（FIFO） | 有檔名，任意 process 都能開 | 簡單的本機溝通 |
| Unix domain socket | 雙向、只限本機，比 TCP 快 | Docker daemon（`/var/run/docker.sock`）、PostgreSQL 本機連線 |
| TCP / UDP socket | 可以跨機器 | 一般網路服務 |
| Shared memory | 最快，但要自己處理同步 | 資料庫的 buffer pool（PostgreSQL shared buffers） |
| Signal | 只能傳一個數字 | 通知 process 結束、重新載入設定 |
| Message queue | kernel 管理的訊息佇列 | 較少直接使用 |

## 一句話總結

> Process 是資源的單位、thread 是排程的單位。`fork` 用 Copy-on-Write 複製 process，`exec` 換掉程式。Context switch 有成本，所以 Go 等 runtime 用 M:N 模型在 user space 切換 goroutine。Process 之間靠 IPC 溝通。

## Reference

- [OSTEP: Processes](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-intro.pdf)
- [OSTEP: Scheduling: The Multi-Level Feedback Queue](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-sched-mlfq.pdf)
- [Go: Scheduling In Go (Ardan Labs)](https://www.ardanlabs.com/blog/2018/08/scheduling-in-go-part2.html)
