---
title: "Distributed System"
---

- [分散式系統 - 在分散的世界中保持一致](https://ithelp.ithome.com.tw/users/20121042/ironman/2792)
- [15-440/640 Distributed Systems](https://www.andrew.cmu.edu/course/15-440/)
- [6.824 Distributed Systems](https://learncs.me/mit/6.824)

### Intro

* 分佈式數據庫：
    * 理解分佈式數據庫的基本概念，包括水平分區和垂直分區。
    * 學習分佈式數據庫系統，例如 Cassandra、MongoDB、Redis等。
* 一致性和分區容錯性：
    * 了解CAP定理（Consistency, Availability, Partition Tolerance）。
    * 學習如何在分散式系統中實現一致性和分區容錯性。
* 分佈式存儲系統：
    * 學習使用分佈式存儲系統，如Amazon S3、Google Cloud Storage等。
    * 了解對象存儲、塊存儲和文件存儲的區別。
* 分佈式計算框架：
    * 學習使用分佈式計算框架，如 Apache Hadoop 和 Apache Spark。
    * 了解 MapReduce 和 Spark 等計算模型。

相關主題：

- **CAP 與 PACELC**：分區時要選一致還是可用，見 [CAP 定理](/backend/database#cap-定理)。
- **跨服務的交易**：2PC 與 Saga，見 [Transaction](/backend/database/transaction#跨節點的-transaction)。
- **服務之間非同步溝通**：見 [Message Queue & Pub/Sub](/system/message-queue)。
- **部分失敗與連鎖故障**：見 [Resilience](/system/resilience)。

## Consistent Hashing

### 問題：`hash(key) % N`

資料或快取要分散到 N 台機器時，最直覺的做法是 `hash(key) % N`。問題在 **N 一改變，幾乎所有 key 的位置都會變**：

```text
N = 3：hash("user:42") = 10  →  10 % 3 = 1  → 放在 server 1
N = 4：hash("user:42") = 10  →  10 % 4 = 2  → 變成 server 2
```

從 3 台加到 4 台，大約 75% 的 key 會換位置。如果這是快取，等於一瞬間快取幾乎全部失效，流量全部打到資料庫（cache stampede）；如果是資料庫分片，就要搬動大部分的資料。

### 做法：把 hash 空間圍成一個環

把 hash 的值域（例如 0 ～ 2³²−1）頭尾相接成一個環。**server 和 key 都用同一個 hash function 放到環上**，每個 key 順時針走，遇到的第一台 server 就是負責它的人。

```text
              0 / S1
          ╭─────●─────╮
       K1 ●     ↻     ● K2         順時針方向：S1 → K2 → S2 → K3 → K4 → S3 → K1 → S1
          │           │
       S3 ●           ● S2         K2 → 順時針遇到 S2
          │           │            K3 → 順時針遇到 S3
       K4 ●           ● K3         K4 → 順時針遇到 S3
          ╰───────────╯            K1 → 繞過 0，遇到 S1
```

- **新增一台 S4**（放在 S2 和 S3 之間）：只有原本落在 S2 ～ S4 之間、歸 S3 管的 key 要搬到 S4，其他都不動。
- **移除 S2**：只有 S2 負責的 key 會往順時針交給下一台。

平均只有 `K / N` 個 key 需要搬（K 是 key 總數），而不是幾乎全部。

### Virtual Nodes

只有少數幾台 server 時，它們在環上的位置可能很不平均，某台分到一大段、某台只分到一小段。而且一台掛掉時，它的負載會全部丟給**順時針的下一台**，那台很可能跟著被壓垮。

解法是讓每台實體 server 在環上放很多個**虛擬節點**（例如 `S1#0`、`S1#1` … `S1#199`）：

- 虛擬節點多了，每台分到的範圍會趨近平均。
- 一台掛掉時，它的負載會分散給很多台，而不是全部推給同一個鄰居。
- 機器規格不同時，可以讓大台的機器放比較多虛擬節點，負責比較多的資料。

### 用在哪裡

- **分散式資料庫的分片**：DynamoDB（源自 Amazon 2007 年的 Dynamo 論文）、Cassandra、Riak。通常再搭配「往順時針多存幾份」做 replication。
- **分散式快取**：Memcached 的 client 端 library 用它決定 key 要放哪台。
- **Load balancer / proxy**：Nginx 的 `hash $request_uri consistent`、Envoy 的 ring hash，讓同一個 key 盡量打到同一台 server，提高快取命中率。
- **CDN**：決定哪個內容放在哪台快取節點。

> 不是所有分片都用 consistent hashing。Redis Cluster 是把 key 對應到固定的 16384 個 **hash slot**，再把 slot 分配給節點；擴容時搬的是 slot。概念類似：都是加一層間接對應，讓「節點數量改變」不會影響所有 key。

## Leader Election

### 為什麼需要 leader

有些工作在同一時間**只能由一個節點來做**：

- 排程器：同一個 cron job 不能被三台機器各跑一次。
- 資料庫的 primary：只有一台負責接受寫入，再複製給其他副本，才不會有寫入衝突。
- 分散式系統的協調者：決定分片怎麼分配、誰負責哪個 partition。

指定一台固定的機器會變成單點故障，所以要讓節點**自己選出 leader**，leader 掛掉時再自動選出新的。

### 常見做法

**1. 共識演算法（Raft / Paxos）**

節點之間透過投票選出 leader，要拿到**多數（quorum）**的票才能當選。以 Raft 為例：

```text
                 timeout 沒收到 leader 心跳
   ┌──────────┐ ─────────────────────────▶ ┌───────────┐
   │ Follower │                            │ Candidate │ ── 發起投票，任期（term）+1
   └──────────┘ ◀──── 發現更高任期的 leader ─ └───────────┘
        ▲                                        │ 拿到多數票
        │ 發現更高任期                            ▼
        │                                  ┌──────────┐
        └───────────────────────────────── │  Leader  │ ── 定期送心跳，負責所有寫入
                                           └──────────┘
```

- 每個 follower 的 timeout 是隨機的，避免大家同時跳出來搶、票分散選不出來。
- 5 個節點的叢集需要 3 票，所以最多容忍 2 台故障。這也是叢集通常是**奇數台**的原因：4 台需要 3 票、只能容忍 1 台故障，跟 3 台一樣，卻多花一台的錢。
- 用 Raft 的系統：etcd、Consul、CockroachDB、TiKV；Kafka 新版的 KRaft 也是。ZooKeeper 用的是類似的 ZAB。

**2. 用分散式鎖 / Lease 搶 leader**

不想自己實作共識演算法時，可以把「選 leader」交給已經有共識保證的系統（etcd、ZooKeeper、Consul），自己只是去搶一把**有期限的鎖（lease）**：

1. 每個節點都試著建立同一把 lease（例如 etcd 的一個 key，TTL 15 秒）。
2. 搶到的就是 leader，之後要**定期續約**。
3. Leader 當機或網路斷掉，無法續約，lease 到期後其他節點就能搶到。

**Kubernetes 就是這樣做的**：kube-scheduler、kube-controller-manager 在高可用部署時會跑好幾份，但透過 etcd 裡的 `Lease` 物件選出一個 leader，只有 leader 真的在工作，其他在旁邊待命。自己寫的 controller / operator 也可以用 client-go 的 `leaderelection` 套件做到同樣的事。

```bash
kubectl get lease -n kube-system   # 看目前誰是 scheduler / controller-manager 的 leader
```

ZooKeeper 的經典做法則是每個節點建立一個 **ephemeral sequential node**，序號最小的就是 leader；節點斷線時它建立的 ephemeral node 會自動消失，下一個序號接手。

### 最大的風險：Split-brain

**Split-brain（腦裂）**：同時有兩個節點都認為自己是 leader，各自接受寫入，資料就會分岔。

常見的成因：

- **網路分區**：舊 leader 跟其他節點斷線，其他人選出了新 leader，但舊 leader 自己不知道。
- **長時間停頓**：舊 leader 遇到 GC 停頓或 VM 被暫停 20 秒，醒來時 lease 早就過期、新 leader 已經上任，但它還以為自己是 leader，繼續寫入。

防範方式：

- **Quorum**：需要多數同意才能當選，所以網路分區時，最多只有一邊（多數那一邊）能選出 leader。少數那一邊的舊 leader 寫入時也拿不到多數確認，寫不成功。
- **Fencing token**：每次選出新 leader 時發一個**單調遞增**的號碼（Raft 的 term、etcd 的 revision）。Leader 寫入資料時帶上這個號碼，儲存端只接受比之前看過的更大的號碼。

```text
Leader A 拿到 token 33 ──▶ GC 停頓 20 秒 ...
                           lease 過期，Leader B 拿到 token 34 ──▶ 寫入（token 34）✓
Leader A 醒來 ──▶ 寫入（token 33）✗ 儲存端已經看過 34，拒絕
```

> 單靠 lease 到期時間不夠安全，因為各台機器的時鐘不一定準，停頓也可能發生在「檢查完 lease 還有效」和「真的寫入」之間。需要正確性的場景，一定要讓儲存端也檢查 fencing token。

## Reference

- [Consistent Hashing Explained | ByteByteGo](https://bytebytego.com/guides/consistent-hashing/)
- [Dynamo: Amazon's Highly Available Key-value Store](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)
- [The Raft Consensus Algorithm](https://raft.github.io/)（有互動式的視覺化）
- [Kubernetes: Leases](https://kubernetes.io/docs/concepts/architecture/leases/)
- [Martin Kleppmann: How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)
