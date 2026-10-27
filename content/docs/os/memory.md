---
title: "Memory"
---

**每個 process 看到的都是自己的一整片虛擬位址空間，OS 和 CPU 負責把虛擬位址翻譯成實體記憶體位址。** 這讓 process 之間互相隔離，也讓程式可以用比實體 RAM 更多的記憶體。

## 記憶體階層

| 層級 | 大小 | 延遲（約） |
| --- | --- | --- |
| 暫存器 | 數百 bytes | < 1 ns |
| L1 cache | 數十 KB / 核心 | ~1 ns |
| L2 cache | 數百 KB ~ 數 MB / 核心 | ~4 ns |
| L3 cache | 數十 MB，多核共用 | ~10-40 ns |
| RAM | GB 等級 | ~100 ns |
| SSD | TB 等級 | ~10-100 µs |
| HDD | TB 等級 | ~10 ms |

越上層越快、越小、越貴。程式效能常常取決於資料有沒有留在 cache 裡：**連續存取陣列比跳來跳去存取 linked list 快很多**，因為 CPU 一次會把一整條 cache line（通常 64 bytes）載進來。

## Virtual Memory 與 Paging

虛擬位址空間和實體記憶體都切成固定大小的 **page**（通常 4 KB），**page table** 記錄每個虛擬 page 對應到哪個實體 page（frame）。

```text
Process A 虛擬位址       Page Table A        實體記憶體
  page 0  ─────────────→  frame 7  ─────→  ┌─────────┐
  page 1  ─────────────→  frame 2  ─────→  │ frame 2 │
  page 2  ─────────────→  （不在記憶體）     │   ...   │
                                           │ frame 7 │
Process B 虛擬位址       Page Table B        │   ...   │
  page 0  ─────────────→  frame 2  ←共用─   └─────────┘
```

好處：

- **隔離**：A 的 page table 裡沒有 B 的 frame，A 就碰不到 B 的記憶體。
- **共用**：多個 process 的 page 可以指到同一個 frame，例如 shared library、`fork` 之後的 Copy-on-Write。
- **不連續也沒關係**：虛擬上連續的記憶體，實體上可以分散在各處。
- **按需載入**：page 可以等真的用到時才配置。

### 位址怎麼翻譯

虛擬位址被拆成兩半：

```text
虛擬位址 = [ page 編號 | page 內的 offset ]
```

以 4 KB（4096 bytes）的 page 為例，虛擬位址 `8200`：

```text
1. 拆開：8200 ÷ 4096 = 2 餘 8 → page 2、offset 8
2. 查 page table：page 2 → frame 5
3. 組回去：5 × 4096 + 8 = 20488 → 實體位址
```

Offset 不用翻譯，只有 page 編號要查表。

### TLB

Page table 本身也放在 RAM 裡，而且分好幾層（x86-64 通常是 4 層）。如果每次存取記憶體都要先查它，讀一次資料就變成讀五次 RAM：

```text
查第 1 層 → 查第 2 層 → 查第 3 層 → 查第 4 層 → 讀到真正的資料
```

所以 CPU 內建一個專門的 cache：**TLB（Translation Lookaside Buffer）**，記住最近查過的翻譯結果。

- **TLB hit**：最近查過，直接拿到答案。
- **TLB miss**：沒查過，去 RAM 查 page table，再把結果記進 TLB。

> 比方：page table 是檔案室裡的厚對照表，TLB 是貼在螢幕旁的便利貼。要查的那筆在便利貼上就直接看，沒有才去檔案室翻，翻到後順手抄上便利貼。

程式通常反覆存取附近的記憶體，所以 TLB 雖然只有數十到數千筆，命中率還是很高。

- **切換 process 時 TLB 要清掉**：每個 process 的 page table 不同，便利貼上記的對 B 來說都是錯的，這是 [context switch](/os/process#context-switch) 成本的來源之一。同一個 process 的 thread 共用 page table，不用清。現代 CPU 有 PCID，可以把每筆標記屬於哪個 process，減少清除。
- **Huge page**：一頁從 4 KB 變成 2 MB / 1 GB，同樣筆數的 TLB 能涵蓋更多記憶體，資料庫和 JVM 有時會用它減少 TLB miss。

### Page Fault

存取的 page 不在記憶體中時，CPU 觸發 page fault，交給 kernel 處理：

| 類型 | 情況 | 成本 |
| --- | --- | --- |
| Minor | page 已經在記憶體（例如在 page cache 裡），只是還沒對應到這個 process | 低 |
| Major | 要從磁碟讀進來（swap 或 mmap 的檔案） | 高，要等 I/O |
| Invalid | 存取了不該存取的位址 | process 收到 `SIGSEGV`（segmentation fault） |

### Paging vs. Segmentation

Segmentation 是另一種翻譯位址的方法：不切成固定大小，而是依程式的**邏輯用途**切成大小不一的區段（segment），例如程式碼、資料、stack 各一段。

> 比方：paging 像**標準尺寸的置物箱**，東西拆開裝，箱子散在倉庫各處也沒關係，只要有清單記著哪箱在哪；segmentation 像**依用途劃分區域**，每區要多大就劃多大，但每區都必須是一整塊連續的空間。

Segment table 記錄每段的**起點（base）**和**長度（limit）**：

| Segment | 用途 | Base | Limit |
| --- | --- | --- | --- |
| 0 | 程式碼 | 1000 | 500 |
| 1 | 資料 | 6000 | 300 |
| 2 | Stack | 9000 | 200 |

翻譯 `(segment 1, offset 50)`：

```text
1. 查 segment table：segment 1 的 base = 6000、limit = 300
2. 檢查 offset 50 < limit 300，合法（超過就是 segmentation fault）
3. 相加：6000 + 50 → 實體位址 6050
```

| | Paging | Segmentation |
| --- | --- | --- |
| 怎麼切 | 固定大小（page / frame） | 依邏輯用途，大小不一 |
| 位址組成 | page 編號 + offset | segment 編號 + offset |
| 查哪張表 | page table → frame 編號 | segment table → base 和 limit |
| 實體記憶體 | 不必連續 | 每段必須連續 |
| 碎片問題 | **內部碎片**：只用 1 KB 也佔一整頁，最後一頁用不滿 | **外部碎片**：分配釋放幾次後空間零碎，總量夠卻湊不出一整塊 |
| 優點 | 配置簡單、方便 swap 與虛擬記憶體 | 符合程式結構，方便整段保護（唯讀）與共用 |
| 程式看得到嗎 | 看不到，完全透明 | 看得到，程式知道自己分成哪幾段 |

**現代 OS 幾乎只用 paging。** 早期 x86（16 / 32-bit）以 segmentation 為主；到了 x86-64，segment 的 base 幾乎都設成 0，整片記憶體等於同一段，翻譯和保護全靠 paging，只剩 FS / GS 暫存器還拿來放 thread-local storage 的位置。Segmentation 的優點改由 paging 做到：位址空間仍分成程式碼、heap、stack 幾區，但每區都由 page 組成，每頁可以各自設成唯讀或不可執行。

所以現在的 `Segmentation fault` 其實是存取了沒有合法對應的位址，由 page fault 處理後送出的 `SIGSEGV`（見 [Page Fault](#page-fault)），名稱只是歷史遺留。

## Stack vs. Heap

| | Stack | Heap |
| --- | --- | --- |
| 存什麼 | 函式的區域變數、參數、回傳位址 | 動態配置、生命週期不固定的資料 |
| 配置方式 | 移動 stack pointer，極快 | `malloc` / `new`，要找空間 |
| 釋放 | 函式返回時自動釋放 | 手動 `free`、GC、或 Rust 的 ownership |
| 大小 | 小（Linux thread 預設 8 MB） | 大，受限於可用記憶體 |
| 常見錯誤 | 遞迴太深 → stack overflow | memory leak、use-after-free、double free |

- **Go**：compiler 做 **escape analysis**，變數不會逃出函式就放 stack，否則放 heap 交給 GC。可用 `go build -gcflags=-m` 查看。Goroutine 的 stack 很小，不夠時 runtime 會自動擴大。
- **Rust**：預設放 stack，`Box`、`Vec`、`String` 的內容放 heap，離開 scope 時自動釋放，不需要 GC。

## 記憶體配置

- **`brk` / `sbrk`**：調整 heap 的頂端，傳統 `malloc` 用它配置小塊記憶體。
- **`mmap`**：直接向 kernel 要一段虛擬記憶體，可以是匿名的（配置大塊記憶體），也可以對應到檔案。
- **Allocator**：`malloc` 不是每次都呼叫 system call，而是先要一大塊再自己切。常見的有 glibc malloc、jemalloc、tcmalloc、mimalloc，在多 thread、碎片化的表現上各有差異。

### mmap 檔案

把檔案對應到記憶體，讀寫記憶體就等於讀寫檔案，由 kernel 負責在 page fault 時載入、在背景寫回。

- 優點：少一次從 kernel buffer 複製到 user buffer；多個 process 可以共用。
- 缺點：I/O 錯誤變成 `SIGBUS`；何時寫回磁碟不好控制。
- 例子：LMDB、BoltDB（etcd 的 bbolt）、早期 MongoDB 的 MMAPv1 引擎。

## 記憶體不夠時

### Swap

把不常用的 page 搬到磁碟上的 swap 空間，騰出 RAM。被搬走的 page 再被存取時就是 major page fault。

- Swap 太多會 **thrashing**：時間都花在搬 page，系統幾乎沒反應。
- Kubernetes 過去要求關閉 swap，讓記憶體用量可以預測；新版本才逐步支援。
- `vm.swappiness` 控制 kernel 多積極使用 swap。

### Overcommit 與 OOM Killer

Linux 預設允許 **overcommit**：配置記憶體時只配虛擬位址，真的寫入才分配實體 page，所以總配置量可以超過實體記憶體。

真的不夠用時，**OOM killer** 會挑一個 process 殺掉（`SIGKILL`，無法攔截），依據每個 process 的 `oom_score`（主要看用了多少記憶體），可以用 `oom_score_adj` 調整。

```bash
dmesg -T | grep -i "killed process"     # 看誰被 OOM killer 殺了
```

在 container 裡，超過 cgroup 的 memory limit 也會觸發 OOM，Kubernetes 會顯示 `OOMKilled`（exit code 137 = 128 + 9）。見 [Namespace & cgroup](/os/linux/namespace-cgroup)。

## 看記憶體用量

```bash
free -h
#               total   used   free  shared  buff/cache  available
# Mem:           15Gi  4.2Gi  1.1Gi   312Mi        10Gi       10Gi
```

- **`free` 很少不代表記憶體不夠**：Linux 會把閒置的 RAM 拿來當 page cache（`buff/cache`），需要時隨時可以釋放。要看的是 **`available`**。
- **RSS**（Resident Set Size）：process 實際佔用的實體記憶體，包含共用的 library，所以把每個 process 的 RSS 加起來會超過實際用量。
- **VSZ**（Virtual Size）：配置的虛擬記憶體，通常遠大於 RSS，參考價值不高。

## 一句話總結

> 每個 process 都有自己的虛擬位址空間，靠 page table 翻譯、TLB 加速。Page 不在記憶體時觸發 page fault。區域變數放 stack，動態資料放 heap。記憶體不夠時先 swap，再不夠就被 OOM killer 殺掉。看記憶體用量要看 `available`，不是 `free`。

## Reference

- [OSTEP: Paging: Introduction](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-paging.pdf)
- [OSTEP: Segmentation](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-segmentation.pdf)
- [Paging vs Segmentation (ByteByteGo)](https://bytebytego.com/guides/what-are-the-differences-between-paging-and-segmentation/)
- [Latency Numbers Every Programmer Should Know](https://gist.github.com/jboner/2841832)
- [What Every Programmer Should Know About Memory](https://people.freebsd.org/~lstewart/articles/cpumemory.pdf)
