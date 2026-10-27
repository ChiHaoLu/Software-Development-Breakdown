---
title: "Goroutine"
---

**Goroutine 是 Go runtime 管理的輕量執行單元。Go 的特別之處在於 runtime 內建了自己的 scheduler，自己決定哪個 goroutine 在哪個 OS thread 上跑，不全交給 kernel。**

M:N 排程不是 Go 發明的（Erlang 更早），但 Go 把它內建在語言裡、而且是預設寫法：你寫最直覺的同步程式碼，runtime 在底下自動把它變成 event loop 加多核心排程。

> OS 層面的 process、thread、context switch 見 [Process & Thread](/os/process)。

## 和 OS Thread 比較

大部分語言（Java 傳統 thread、Rust `std::thread`、C pthread）是 1:1，一個 thread 就是一個 OS thread，全部交給 kernel 排程：

```text
  thread 1   thread 2   thread 3 ... thread 10000
     ↓          ↓          ↓              ↓
  OS thread  OS thread  OS thread ... OS thread
```

一萬個工作就要一萬個 OS thread，每個 stack 預設約 8 MB（虛擬記憶體），切換要進 kernel，數量一多就撐不住。

| | OS thread | Goroutine |
| --- | --- | --- |
| 初始 stack | 約 8 MB（Linux 預設） | 2 KB，不夠時 runtime 自動擴大 |
| 建立 | system call，微秒等級 | runtime 內部配置，更快 |
| 切換 | 進 kernel，保存完整暫存器 | 在 user space 完成，只保存少數暫存器 |
| 誰來排程 | kernel | Go runtime |
| 能開幾個 | 數千 | 上百萬 |

## GMP 模型

```text
  G  G  G  G  G  G  G  G ... （上萬到上百萬個 goroutine）
   \  |  /     \  |  /
  ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐
  │  P0   │  │  P1   │  │  P2   │  │  P3   │   ← P 的數量 = GOMAXPROCS（預設 = CPU 核心數）
  │ queue │  │ queue │  │ queue │  │ queue │     每個 P 有自己的 goroutine 佇列
  └───┬───┘  └───┬───┘  └───┬───┘  └───┬───┘
      M          M          M          M        ← 真正的 OS thread
      ↓          ↓          ↓          ↓
    CPU 0      CPU 1      CPU 2      CPU 3
```

- **G**（goroutine）：要執行的工作，帶著自己的 stack。
- **M**（machine）：真正的 OS thread，kernel 只看得到它。
- **P**（processor）：執行 G 的「許可證」，M 要拿到 P 才能跑 G。P 的數量就是同時能跑 Go 程式碼的上限。

Runtime 的 scheduler 決定哪個 G 放到哪個 P 上，kernel 只負責排那幾個 M。

## Scheduler 做了哪些事

| 機制 | 做什麼 | 好處 |
| --- | --- | --- |
| User space 切換 | G 等 channel、等鎖時，runtime 直接換下一個 G，不進 kernel | 切換便宜很多 |
| Work stealing | 某個 P 的佇列空了，就去別的 P 偷一半的 G 來跑 | 所有 CPU 都保持忙碌 |
| Netpoller | 網路 I/O 沒資料時，G 先停下，socket 交給 [epoll](/os/io#io-模型) 監聽，資料到了再把 G 叫醒 | 寫起來像 blocking，實際上是 event loop |
| Syscall handoff | G 呼叫真的會卡住的 system call（例如讀檔）時，P 會被交給另一個 M | 一個卡住不會拖住其他 goroutine |
| 搶佔 | 一個 G 跑太久（約 10ms），runtime 用 signal 打斷它（Go 1.14 起） | 無窮迴圈不會霸佔整個 P |

## 不用寫 async/await

以「同時處理一萬條連線」為例，Go 照「一條連線一個 goroutine」的直覺寫就好：

```go
for {
    conn, _ := ln.Accept()
    go handle(conn)          // 開一個 goroutine
}

func handle(conn net.Conn) {
    buf := make([]byte, 1024)
    n, _ := conn.Read(buf)   // 看起來會卡住，其實只停下這個 goroutine
    conn.Write(buf[:n])
}
```

Rust 要用 async runtime（Tokio），整條呼叫鏈都要標 `async`、`.await`：

```rust
loop {
    let (mut sock, _) = listener.accept().await?;
    tokio::spawn(async move {
        let n = sock.read(&mut buf).await?;
        sock.write_all(&buf[..n]).await?;
    });
}
```

| 語言 | 怎麼做到高併發 | 代價 |
| --- | --- | --- |
| Go | runtime 內建 M:N scheduler | 有 runtime 和 GC，難以精細控制 |
| Rust | async/await + Tokio 等 runtime | 要區分 async 與非 async 函式（function coloring），但效能和控制力最好 |
| Node.js | 單 thread event loop | 只用一顆 CPU，CPU 密集的工作會卡住所有請求 |
| Java | 21 版起的 virtual thread | 和 goroutine 很像，但較晚才加入 |
| Erlang / Elixir | BEAM VM 的 process | goroutine 的前輩 |

## 不是萬能的

- **CPU 密集的工作**：同時在跑的只有 `GOMAXPROCS` 個，開一萬個 goroutine 做運算不會比較快。
- **Goroutine leak**：goroutine 便宜，所以很容易忘記讓它結束，例如永遠等不到的 channel。用 `context` 控制生命週期，用 `pprof` 的 goroutine profile 檢查。
- **共用資料還是要加鎖**：goroutine 跑在多個 OS thread 上，會真的同時執行，一樣有 [race condition](/os/concurrency)，用 `go test -race` 檢查。
- **Container 裡的 `GOMAXPROCS`**：舊版 Go 會讀到主機的核心數，而不是 cgroup 的 CPU limit，造成過度排程與 throttling。Go 1.25 起 runtime 會自動參考 cgroup 的 CPU limit；更早的版本可以用 `uber-go/automaxprocs`。見 [Namespace & cgroup](/os/linux/namespace-cgroup#對應到-kubernetes)。

## 觀察 Scheduler

```bash
GODEBUG=schedtrace=1000 ./myapp   # 每秒印出各 P 的佇列長度、thread 數量
go tool trace trace.out           # 視覺化每個 P 上跑了哪些 goroutine（用 runtime/trace 產生）
```

## 一句話總結

> Goroutine 很便宜（2 KB stack、user space 切換），由 Go runtime 用 GMP 模型分配到少數 OS thread 上，搭配 work stealing、netpoller 與搶佔。你寫的是同步的程式碼，runtime 幫你變成高併發。

## Reference

- [Scheduling In Go (Ardan Labs)](https://www.ardanlabs.com/blog/2018/08/scheduling-in-go-part2.html)
- [Go runtime: proc.go](https://go.dev/src/runtime/proc.go)：scheduler 的原始碼，開頭的註解就是設計說明
- [Kavya Joshi: The Scheduler Saga (GopherCon 2018)](https://www.youtube.com/watch?v=YHRO5WQGh0k)
