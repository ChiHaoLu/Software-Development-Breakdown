---
title: "Operating System"
---

**作業系統（OS）是管理硬體資源、並提供程式一致介面的軟體。** 程式不需要知道 CPU 有幾顆、記憶體實際在哪、硬碟是哪個牌子，只要透過 OS 提供的介面（system call）要資源就好。

寫後端時會一直碰到 OS 的概念：goroutine 跑在哪些 thread 上、container 為什麼能隔離、資料庫為什麼要 `fsync`、服務為什麼被 OOM killer 殺掉，背後都是 OS。

## OS 負責什麼

| 職責 | 管理的資源 | 對應頁面 |
| --- | --- | --- |
| Process 管理 | CPU 時間：誰先跑、跑多久 | [Process & Thread](/os/process) |
| 同步 | 多個執行單元共用的資料 | [Concurrency](/os/concurrency) |
| 記憶體管理 | RAM：分配、隔離、不夠時怎麼辦 | [Memory](/os/memory) |
| 檔案系統與 I/O | 硬碟、網路、各種裝置 | [File System & I/O](/os/io) |
| 保護與隔離 | 程式之間、使用者之間互不干擾 | [Namespace & cgroup](/os/linux/namespace-cgroup) |

## Kernel Space 與 User Space

CPU 有不同的權限等級（見 [x86](/os/x86)），OS 利用它把執行環境分成兩塊：

- **Kernel space**：OS 核心（kernel）執行的地方，可以直接操作硬體、存取所有記憶體。
- **User space**：一般程式執行的地方，不能直接碰硬體，也看不到別的程式的記憶體。

User space 的程式要讀檔、開 socket、配記憶體，都要透過 **system call** 請 kernel 代勞：

```text
程式呼叫 read()
  → libc 把參數放進暫存器，執行 syscall 指令
  → CPU 切換到 kernel mode，跳到 kernel 的處理函式
  → kernel 檢查權限、執行、把結果放回暫存器
  → 切回 user mode，read() 回傳
```

System call 比一般函式呼叫貴很多（要切換權限、保存暫存器、可能讓 cache 失效），所以高效能程式會想辦法**減少 system call 的次數**，例如 buffered I/O、batch 寫入、`epoll`、`io_uring`。

可以用 `strace` 看程式呼叫了哪些 system call，見 [常用指令](/os/linux/commands)。

## Kernel 架構

| 架構 | 做法 | 例子 | 取捨 |
| --- | --- | --- | --- |
| Monolithic | 檔案系統、driver、網路都在 kernel 裡 | Linux、早期 Unix | 快，但一個 driver 出錯可能讓整個系統掛掉 |
| Microkernel | kernel 只留最基本的（排程、IPC），其他放 user space | Minix、seL4、QNX | 穩定、好驗證，但元件之間要靠 IPC，較慢 |
| Hybrid | 介於兩者之間 | Windows NT、macOS（XNU） | 折衷 |

Linux 雖然是 monolithic，但支援 **kernel module**，driver 可以在執行時載入、卸載（`lsmod`、`modprobe`）。

## Unix 家族

```text
Unix (1969, Bell Labs)
├── BSD → FreeBSD、OpenBSD、macOS（Darwin）
└── System V → Solaris、AIX
Linux (1991, Linus Torvalds)：重新實作、相容 POSIX，不是 Unix 的後代
```

**POSIX** 是一套標準，規定 Unix-like 系統應提供的 API 與指令（`fork`、`open`、`pthread`、shell 行為等）。程式只要照 POSIX 寫，就能在 Linux、macOS、BSD 之間移植。

## Reference

- [Chang-Chia-Chi/作業系統筆記](https://hackmd.io/@Chang-Chia-Chi/OS/https%3A%2F%2Fhackmd.io%2F%40Chang-Chia-Chi%2FOS-CH3)
- [看漫畫學 Linux](https://hackmd.io/@sysprog/linux-comic)
- [Operating Systems: Three Easy Pieces](https://pages.cs.wisc.edu/~remzi/OSTEP/)
