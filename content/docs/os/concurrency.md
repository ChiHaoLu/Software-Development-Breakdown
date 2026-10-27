---
title: "Concurrency"
---

**多個 thread 同時讀寫同一份資料時，結果會取決於執行順序，這叫 race condition。** 同步機制的目的，就是讓這段存取共用資料的程式碼（critical section）一次只有一個人在執行，或至少讓執行順序可以預期。

> Concurrency（並行）是「同時處理很多事」，可以只有一顆 CPU 輪流做；Parallelism（平行）是「同時執行很多事」，需要多顆 CPU。

## Race Condition

`count++` 看起來是一行，實際上是三步：

```text
1. 從記憶體讀 count 到暫存器
2. 暫存器 + 1
3. 寫回記憶體
```

兩個 thread 同時執行時：

| 時間 | Thread A | Thread B | count |
| --- | --- | --- | --- |
| 1 | 讀到 0 | | 0 |
| 2 | | 讀到 0 | 0 |
| 3 | 寫回 1 | | 1 |
| 4 | | 寫回 1 | 1 |

加了兩次，結果是 1。這和資料庫的 [Lost Update](/backend/database/transaction#常見異常) 是同一個問題。

Go 可以用 `go test -race`、`go run -race` 偵測；Rust 的 ownership 規則讓 safe code 在編譯期就不會有 data race。

## 同步機制

| 機制 | 做法 | 適合 |
| --- | --- | --- |
| Mutex | 一次只有一個 thread 能持有，其他人睡著等 | 一般的 critical section |
| RWLock | 多個讀者可以同時持有，寫者獨佔 | 讀多寫少 |
| Spinlock | 拿不到鎖就一直空轉檢查，不睡覺 | 鎖持有時間極短（kernel 內部、中斷處理） |
| Semaphore | 計數器，允許最多 N 個人同時進入 | 限制同時使用資源的數量（connection pool） |
| Condition variable | 讓 thread 睡著等某個條件成立，搭配 mutex 使用 | 生產者 / 消費者 |
| Atomic | CPU 提供的不可分割操作 | 計數器、旗標、lock-free 資料結構 |

### Mutex vs. Spinlock

- Mutex 拿不到鎖時，thread 會被 kernel 換下去睡覺，要等 context switch。
- Spinlock 不睡覺，持續佔用 CPU 檢查鎖。如果鎖很快就釋放，省下 context switch 比較划算；如果要等很久，就是在浪費 CPU。
- 實務上的 mutex（Linux 的 futex、Go 的 `sync.Mutex`）多半是混合的：先 spin 一小段時間，拿不到才睡。

### Atomic 與 CAS

**CAS（Compare-And-Swap）**：「如果目前的值是 A，就改成 B，否則什麼都不做」，整個動作由 CPU 保證不可分割（x86 是 `lock cmpxchg`）。

```go
var count int64
atomic.AddInt64(&count, 1)                     // 原子遞增

for {                                          // 用 CAS 自己實作
    old := atomic.LoadInt64(&count)
    if atomic.CompareAndSwapInt64(&count, old, old+1) {
        break
    }
}
```

這和資料庫的[樂觀鎖](/backend/database/transaction#處理-lost-update-與-write-skew)是同一個想法：不先鎖，寫入時檢查值沒被改過，被改過就重試。

- **ABA 問題**：值從 A 變 B 又變回 A，CAS 會以為沒變過。常見解法是加版本號。

### Memory Ordering

為了效能，compiler 和 CPU 都可能**重排指令**，另一顆 CPU 看到寫入的順序不一定和程式碼一樣。Mutex 和 atomic 操作除了保證不可分割，也提供 **memory barrier**，確保鎖之前的寫入在解鎖後對其他 thread 可見。

所以「只是讀一個 bool 旗標，不用加鎖」通常是錯的，至少要用 atomic。Go 的規則寫在 [The Go Memory Model](https://go.dev/ref/mem)，Rust 則在 atomic 操作上明確指定 `Ordering`（`Relaxed`、`Acquire`、`Release`、`SeqCst`）。

## Deadlock

兩個以上的 thread 互相等對方手上的資源，誰都動不了。

```text
Thread A：持有 lock1，等 lock2
Thread B：持有 lock2，等 lock1
```

### 四個必要條件

四個條件**同時成立**才會 deadlock，破壞任何一個就能避免：

| 條件 | 意思 | 怎麼破壞 |
| --- | --- | --- |
| Mutual Exclusion | 資源一次只能給一個人 | 很難避免，鎖本來就是這樣 |
| Hold and Wait | 拿著一個資源，同時等另一個 | 一次拿齊所有需要的鎖 |
| No Preemption | 資源不能被強制搶走 | 用 `tryLock` 加 timeout，拿不到就放掉手上的 |
| Circular Wait | 等待關係形成一個環 | **所有人都照固定順序拿鎖**（最常用） |

### 處理方式

| 策略 | 做法 | 例子 |
| --- | --- | --- |
| 預防（Prevention） | 從設計上破壞四個條件之一 | 固定加鎖順序、timeout |
| 避免（Avoidance） | 每次分配前先檢查，不安全就不給 | Banker's algorithm |
| 偵測與復原（Detection & Recovery） | 允許發生，發現後挑一個犧牲 | 資料庫的 deadlock detector |

### 預防：固定順序與 Timeout

- **Resource ordering**：替所有資源定一個順序，大家都只能照順序由小到大拿，等待關係就不可能形成環。例如轉帳時永遠先鎖 ID 小的帳戶。
- **Timeout**：等太久就放棄，放掉手上的資源再重試。程式裡用 `tryLock` 加 timeout；資料庫則有 lock wait timeout：

| 資料庫 | 設定 | 預設 | 超過時 |
| --- | --- | --- | --- |
| PostgreSQL | `lock_timeout` | 0（不限制） | 該條 SQL 失敗，transaction 進入錯誤狀態，只能 rollback |
| MySQL InnoDB | `innodb_lock_wait_timeout` | 50 秒 | 錯誤 1205，**預設只 rollback 當下那條 SQL**，transaction 還開著 |

Timeout 也能打破 deadlock，但分不出「真的 deadlock」和「只是等比較久」，設太短會誤殺正常的 transaction。

### 避免：Banker's Algorithm

每個 process 事先宣告**最多**會用多少資源。每次有人要資源時，先假裝給它，再模擬：剩下的資源能不能讓所有人依某個順序都跑完？能的話叫 **safe state**，才真的給；不能就讓它先等。

例子：共有 10 個資源，目前剩 3 個。

| Process | 最多需要 | 已持有 | 還需要 |
| --- | --- | --- | --- |
| A | 9 | 3 | 6 |
| B | 4 | 2 | 2 |
| C | 7 | 2 | 5 |

- 目前是 safe：先讓 B 跑完（需要 2 ≤ 剩 3），釋放後剩 5；再讓 C 跑完（需要 5 ≤ 5），剩 7；最後 A（需要 6 ≤ 7）。
- 如果 A 現在再要 1 個：假裝給它後剩 2。B 還是能跑完，釋放後剩 4，但 A 還需要 5、C 還需要 5，都不夠，**unsafe**，所以先不給 A。

Unsafe 不代表一定會 deadlock，只是無法保證不會。實務上很少用，因為要事先知道每個 process 的最大需求，而且每次分配都要模擬一次。

### 偵測與復原

允許 deadlock 發生，系統維護一張等待圖（wait-for graph），裡面出現環就代表 deadlock，再挑一個 **victim** 犧牲掉。資料庫就是這樣做，見 [Transaction](/backend/database/transaction#lock悲觀)。

**怎麼挑 victim**：常見的依據有 rollback 成本（已經改了多少資料）、transaction 的優先權、已經執行了多久。

| 資料庫 | 何時偵測 | 挑誰 | 結果 |
| --- | --- | --- | --- |
| PostgreSQL | 等鎖超過 `deadlock_timeout`（預設 1 秒）才檢查 | 通常是做檢查的那個 transaction，無法事先預測 | 整個 transaction 失敗（`40P01 deadlock detected`） |
| MySQL InnoDB | 每次要等鎖時立刻檢查（`innodb_deadlock_detect`） | 修改資料最少、rollback 成本最低的 | **整個 transaction rollback**（錯誤 1213） |

**Rollback 的範圍**：理論上可以只 rollback 到足以打破 deadlock 的地方，但 PostgreSQL 和 InnoDB 遇到 deadlock 都是 rollback 整個 transaction。容易搞混的是 InnoDB 的 lock **timeout**（1205）預設只退回一條 SQL，transaction 還開著，程式要自己決定 commit 還是 rollback；可以開 `innodb_rollback_on_timeout` 讓它也整個 rollback。

**重試要自己寫**：PostgreSQL 和 MySQL 都**不會**自動重新執行被犧牲的 transaction，而是回傳錯誤給應用程式。程式要接住這類錯誤，從 `BEGIN` 開始重跑整個 transaction，最好加上隨機的 backoff。

> 高併發時 InnoDB 的即時偵測本身會變成瓶頸，有些系統會關掉 `innodb_deadlock_detect`，改靠較短的 `innodb_lock_wait_timeout`。

### 程式語言的偵測

Go runtime 在**所有** goroutine 都卡住時會直接報 `fatal error: all goroutines are asleep - deadlock!`，但只有部分 goroutine 卡住時不會發現。一般程式語言的 mutex 不會自動偵測 deadlock，要靠固定加鎖順序、timeout，或用 `pprof` 的 goroutine profile 找出卡在哪。

### 相關問題

- **Livelock**：大家都沒卡住，但一直互相禮讓、重試，事情沒有進展。重試加上隨機的 backoff 可以解決。
- **Starvation**：某個 thread 一直拿不到資源。
- **Priority Inversion**：低優先權的 task 拿著鎖，高優先權的 task 只能等，中優先權的 task 又一直搶走 CPU。解法是 priority inheritance：持有鎖的 task 暫時繼承等待者的優先權。

## 經典問題

- **Producer-Consumer**：生產者放、消費者拿，buffer 滿了生產者要等、空了消費者要等。Go 的 buffered channel 就是這個模型。
- **Readers-Writers**：讀者可以同時讀，寫者要獨佔。對應 RWLock，要注意寫者 starvation。
- **Dining Philosophers**：五個哲學家、五支筷子，每人要兩支才能吃。用來說明 deadlock 和固定加鎖順序。

## 不共用記憶體

> Do not communicate by sharing memory; instead, share memory by communicating. — Go Proverbs

另一條路是不讓多個 thread 碰同一份資料：

- **Message passing**：資料透過 channel 傳給另一個 goroutine，同一時間只有一個人擁有它。
- **Actor model**：每個 actor 有自己的狀態，只能透過訊息互動（Erlang、Akka）。
- **Immutable data**：資料建立後不能改，自然沒有 race。

## 一句話總結

> 共用資料要保護：一般用 mutex，讀多寫少用 RWLock，限制數量用 semaphore，簡單的計數用 atomic。Deadlock 要四個條件同時成立，最實用的預防方法是固定加鎖順序。能不共用就不共用。

## Reference

- [OSTEP: Locks](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-locks.pdf)
- [OSTEP: Common Concurrency Problems](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-bugs.pdf)
- [The Go Memory Model](https://go.dev/ref/mem)
- [Rust Atomics and Locks](https://marabos.nl/atomics/)
