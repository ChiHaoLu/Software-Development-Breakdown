---
title: "Real-time API"
---

一般的 HTTP API 是**請求-回應**：client 問，server 才答。但聊天訊息、股價、通知、多人協作這類功能，需要 **server 有新資料時主動告訴 client**。有幾種做法：

## 四種做法比較

```text
Short polling：每隔幾秒問一次
  C ──▶ 有新的嗎？ ◀── 沒有
  C ──▶ 有新的嗎？ ◀── 沒有
  C ──▶ 有新的嗎？ ◀── 有，這是訊息

Long polling：問了之後，server 等到有資料才回
  C ──▶ 有新的嗎？ ............（server 掛著不回）...... ◀── 有，這是訊息
  C ──▶ 有新的嗎？ ......（立刻再問）

SSE：一條 HTTP 連線不關，server 一直往下寫
  C ──▶ GET /events
        ◀── data: 訊息 1
        ◀── data: 訊息 2  ...

WebSocket：升級成雙向的長連線
  C ◀──▶ S   任何一方都能隨時送
```

方式 | 方向 | 優點 | 缺點 | 適合
--- | --- | --- | --- | ---
Short polling | Client 拉 | 最簡單，任何環境都能用 | 大部分請求都是白問；更新有延遲 | 更新不頻繁、延遲幾十秒沒關係（例如報表進度）
Long polling | Client 拉 | 接近即時，仍是一般 HTTP | 每則訊息後都要重新建立請求；server 要掛住大量請求 | WebSocket 被擋時的備案
SSE（Server-Sent Events） | Server → Client 單向 | 一般 HTTP，瀏覽器原生 `EventSource`，**自動重連**並帶上 `Last-Event-ID` | 只能單向；只能傳文字 | 通知、動態牆、進度條、**LLM 逐字輸出**
WebSocket | 雙向 | 低延遲、雙向、每則訊息的額外開銷很小 | 有狀態的長連線，擴展、部署、負載平衡都比較麻煩 | 聊天、多人遊戲、協作編輯、即時報價

> 只需要 server 推給 client 的話，**先考慮 SSE**，它就是普通的 HTTP，能直接沿用既有的驗證、proxy 和 HTTP/2 multiplexing。真的需要 client 高頻率地送資料回來，再用 WebSocket。

## WebSocket 怎麼建立

WebSocket 一開始是一個 HTTP 請求，透過 `Upgrade` header 把連線「升級」成 WebSocket（握手細節見 [TCP vs UDP 的協定一覽](/network/tcp-udp#常見網路協定一覽)）：

```http
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

之後同一條 TCP 連線上就不再是 HTTP，而是以 frame 為單位雙向傳送資料。網址用 `ws://`，加密版是 `wss://`（走 TLS，port 443，正式環境一律用這個）。

```js
const ws = new WebSocket("wss://example.com/chat");
ws.onopen = () => ws.send(JSON.stringify({ type: "join", room: "general" }));
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.onclose = () => setTimeout(reconnect, backoff());   // 斷線一定會發生，要自己重連
```

## 擴展 WebSocket

HTTP API 是 [stateless](/backend/api#rest-principles) 的，任何一台 server 都能處理任何請求，加機器就能擴展。WebSocket 不一樣：**連線本身就是狀態**，使用者 A 連在 server 1、使用者 B 連在 server 2，A 傳給 B 的訊息要怎麼送到？

```text
               ┌────────── Pub/Sub（Redis、Kafka、NATS）──────────┐
               │   server 1 發布「給 B 的訊息」，所有 server 都收到   │
               └──────▲───────────────────────────────┬──────────┘
                      │                               ▼
  User A ◀══ws══▶ [Server 1]                     [Server 2] ◀══ws══▶ User B
                                                  B 連在我這裡 → 推給 B
```

常見做法：

- **用 [Pub/Sub](/system/message-queue) 在 server 之間轉發**：每台 server 訂閱它上面使用者所屬的頻道（例如聊天室 ID），收到訊息後推給自己手上的連線。
- **記錄「誰連在哪台」**：把 `user_id → server_id` 存在 Redis，要送訊息時直接轉給那台，不用廣播給全部。
- **Load balancer 要支援長連線**：要能處理 `Upgrade` header，idle timeout 要比心跳間隔長，否則 LB 會把安靜的連線切斷。Nginx 要設定 `proxy_http_version 1.1` 和轉發 `Upgrade` / `Connection` header（見 [Proxy](/backend/proxy)）。
- **把連線層和業務邏輯拆開**：一組 gateway 服務只負責維持大量連線，收到訊息就丟給後端處理。業務邏輯部署時不用斷開所有使用者的連線。

> **Discord** 就是這樣的架構：client 連到 Gateway（WebSocket），Gateway 用 Elixir 實作，單一節點可以維持數百萬條連線；每個 guild（伺服器）由一個獨立的 process 負責把訊息分發給所有成員的連線。

## 實務上要注意

- **心跳（ping / pong）**：TCP 連線可能已經斷了但兩端都不知道（手機切網路、NAT 表過期）。定期送心跳，太久沒收到就主動關閉並重連。
- **重連與補訊息**：斷線是常態不是例外。Client 重連時帶上「最後收到的訊息 ID」，server 補送漏掉的部分；重連間隔要有 exponential backoff 和 jitter，見 [Retry](/system/resilience#retry)。
- **Thundering herd**：部署或某台 server 重啟時，幾十萬條連線同時斷開又同時重連，會瞬間打爆驗證服務和資料庫。要分批關閉連線，並讓 client 的重連時間隨機分散。
- **驗證**：瀏覽器的 WebSocket API 不能自訂 header，常見做法是握手時用 cookie，或先用 HTTP API 換一個短期的 ticket，放在連線網址的 query string 或連上後的第一則訊息。也要檢查 `Origin` header，防止其他網站冒用使用者的 cookie 建立連線（Cross-Site WebSocket Hijacking）。
- **背壓（backpressure）**：Client 網路慢、收不完，server 要替它暫存的訊息會越積越多。要設上限，超過就丟棄舊訊息或斷開連線。
- **訊息格式**：WebSocket 只負責傳 frame，訊息格式要自己定（通常是帶 `type` 欄位的 JSON），也要考慮版本相容。

## Reference

- [MDN: The WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [Discord Blog: How Discord Scaled Elixir to 5,000,000 Concurrent Users](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users)
- [WebSocket 實現 1 對 1、1 對多即時通訊](https://www.youtube.com/watch?v=1JH3tLhyzl8&t=353s)
