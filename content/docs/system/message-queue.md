---
title: "Message Queue & Pub/Sub"
---

**服務之間不一定要直接呼叫對方。** 把訊息丟進一個中介（broker），由對方自己來拿，就能把「誰送出」和「誰處理、什麼時候處理」拆開。這是 [System Design](/system) 裡常說的 Async Processing。

## 為什麼需要

以「使用者下單」為例，下單後要寄信、扣點數、通知倉庫、更新推薦模型：

```text
同步呼叫：
  Order ──▶ Email ──▶ Points ──▶ Warehouse ──▶ Recommendation ──▶ 回應使用者
  任何一個慢，下單就慢；任何一個掛，下單就失敗；多一個需求，就要改 Order 的程式

透過 broker：
  Order ──▶ 發布 OrderCreated ──▶ 立刻回應使用者
                    │
          ┌─────────┼──────────┬──────────────┐
          ▼         ▼          ▼              ▼
        Email     Points    Warehouse   Recommendation   各自按自己的速度處理
```

- **解耦**：Order 不需要知道有誰在乎「訂單建立」，新增一個訂閱者也不用改 Order。
- **削峰填谷**：搶票、雙 11 時流量瞬間暴增，先全部放進 queue，後面的 worker 照自己能負荷的速度慢慢消化。
- **容錯**：Email 服務掛了一小時，訊息會在 broker 裡等著，恢復後再處理，不會遺失。
- **非同步**：耗時的工作（轉檔、產生報表）不用讓使用者等，搭配 [`202 Accepted`](/backend/api/HTTP#202-accepted-vs-201-created) 回應。

## Message Queue vs. Pub/Sub

| | Message Queue（點對點） | Pub/Sub（發布／訂閱） |
| --- | --- | --- |
| 一則訊息給誰 | **一個** consumer 處理就好 | **每個**訂閱者都會收到一份 |
| 用途 | 分派工作：多個 worker 一起消化同一堆任務 | 廣播事件：同一件事有很多方要知道 |
| 例子 | 轉檔任務、寄信任務 | `OrderCreated` 要給寄信、點數、倉庫 |
| 產品 | RabbitMQ、Amazon SQS | Google Pub/Sub、Amazon SNS、Redis Pub/Sub |

```text
Queue：                              Pub/Sub：
             ┌─▶ Worker 1  (msg 1)                 ┌─▶ Email     (msg 1, 2, 3)
 P ─▶ [Queue]┼─▶ Worker 2  (msg 2)    P ─▶ [Topic] ┼─▶ Points    (msg 1, 2, 3)
             └─▶ Worker 3  (msg 3)                 └─▶ Warehouse (msg 1, 2, 3)
```

Kafka 用 **consumer group** 同時做到兩種：同一個 group 裡的 consumer 分攤訊息（像 queue），不同的 group 各自拿到完整的一份（像 pub/sub）。

> Redis Pub/Sub 不會保存訊息，訂閱者當下沒連上就收不到，只適合「掉了也沒關係」的即時通知（例如[跨機器轉發 WebSocket 訊息](/backend/api/realtime#擴展-websocket)）。需要可靠投遞時用 Redis Streams、Kafka 或 RabbitMQ。

## Kafka 的核心概念

Kafka 本質上是一個**分散式、只能往後寫的 log**。訊息讀完不會刪除，而是依保留時間（例如 7 天）過期。

```text
Topic: orders
┌ Partition 0 ┐  [0][1][2][3][4][5]   ← 新訊息只能往後加
├ Partition 1 ┤  [0][1][2][3]
└ Partition 2 ┘  [0][1][2][3][4]
                            ▲
                  consumer 自己記錄讀到第幾個（offset）
```

- **Topic**：一類訊息，例如 `orders`。
- **Partition**：一個 topic 切成多個 partition，分散到不同的 broker 上，是**平行處理的單位**。同一個 consumer group 裡，一個 partition 同時只會給一個 consumer，所以 consumer 數量超過 partition 數量也沒用。
- **順序只在同一個 partition 內保證**：訊息依 key（例如 `order_id`）hash 到 partition，同一張訂單的事件就會照順序處理；不同訂單之間不保證順序。
- **Offset**：consumer 自己記錄讀到哪裡。因為訊息不會被刪，可以把 offset 往回調、**重播**過去的事件，例如修好 bug 後重新處理昨天的資料。
- **Replication**：每個 partition 有多個副本，其中一個是 leader 負責讀寫（[leader election](/system/distributed#leader-election)），leader 掛了由其他副本接手。

Kafka 的吞吐量很高，原因之一是它大量依賴循序寫入磁碟和 [`sendfile()` zero-copy](/os/io)。

### Kafka vs. RabbitMQ

| | Kafka | RabbitMQ |
| --- | --- | --- |
| 模型 | 持久化的 log，consumer 自己拉（pull） | 傳統 broker，把訊息推（push）給 consumer |
| 讀完之後 | 保留，可以重播 | 確認（ack）後刪除 |
| 強項 | 極高吞吐量、事件串流、事件溯源、資料管線 | 彈性的路由規則、優先權佇列、延遲訊息、單筆訊息確認 |
| 適合 | 「發生了什麼事」的事件流，很多系統要讀 | 「去做這件事」的工作分派 |

## 投遞語意

| 語意 | 意思 | 怎麼發生 |
| --- | --- | --- |
| **At-most-once** | 最多一次，可能遺失 | 先 commit offset 再處理，處理到一半當機，這則就沒了 |
| **At-least-once** | 至少一次，**可能重複** | 先處理再 commit offset，處理完、commit 前當機，重啟後會再處理一次 |
| **Exactly-once** | 剛好一次 | 需要 broker 和 consumer 一起配合，成本高、範圍有限 |

實務上最常見的是 **at-least-once + 冪等的 consumer**：接受訊息可能重複，但讓重複處理不會造成問題。例如每則訊息帶唯一的 `event_id`，consumer 處理前先檢查這個 ID 有沒有處理過（用 `UNIQUE` 約束記錄），做法和 [Idempotency Key](/backend/api/design#冪等-idempotency) 一樣。

> Kafka 的 exactly-once 指的是「Kafka 讀、Kafka 寫」這段流程裡不會重複。只要 consumer 會去呼叫外部 API 或寫其他資料庫，還是得自己做冪等。

## 常見的坑

- **Dead Letter Queue（DLQ）**：有一則訊息格式壞了，consumer 每次處理都失敗、一直重試，後面的訊息全部卡住（poison message）。重試幾次後把它移到 DLQ，讓後面的訊息繼續，再另外人工處理。
- **Consumer lag**：consumer 處理速度跟不上，未處理的訊息越積越多。要監控 lag（見 [Monitoring](/devops/monitoring)），並準備好擴展 consumer 的方式。
- **「寫 DB」和「發訊息」不是原子的**：DB 寫成功、訊息發送失敗，下游就永遠不知道。用 **Transactional Outbox**：把要發的事件寫進同一個 transaction 裡的 outbox 表，再由另一個程序讀出來發送（見 [Saga](/backend/database/transaction#saga)）。
- **訊息格式要能演進**：訊息就是服務之間的 API，一樣不能有 [breaking change](/backend/api/design#避免-breaking-change)。可以用 Avro / Protobuf 搭配 schema registry 管理版本。
- **不要什麼都非同步**：使用者需要馬上知道結果的（例如付款是否成功），非同步只會讓流程和除錯變複雜。

## Reference

- [Apache Kafka: Introduction](https://kafka.apache.org/intro)
- [Kafka Streams 實作了一個售票系統](https://www.facebook.com/groups/backendtw/permalink/3745495902250925/)
- [Confluent: Message Delivery Guarantees](https://docs.confluent.io/kafka/design/delivery-semantics.html)
- [microservices.io: Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [Jay Kreps: The Log: What every software engineer should know about real-time data's unifying abstraction](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)
