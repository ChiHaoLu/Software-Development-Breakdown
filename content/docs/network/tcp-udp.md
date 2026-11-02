---
title: "TCP vs UDP"
---

兩個都在 [L4（傳輸層）](/network/protocol#tcpip-model)，差別是 **TCP 幫你保證可靠，UDP 只管丟出去**。

| | TCP | UDP |
| --- | --- | --- |
| 連線 | 要先握手建立連線 | 不用，直接送 |
| 可靠性 | 保證送達、不重複、照順序 | 可能遺失、重複、亂序 |
| 資料型態 | Byte stream（沒有訊息邊界） | Datagram（一次送一個完整訊息） |
| 流量控制 / 壅塞控制 | 有 | 沒有 |
| Header | 20–60 bytes | 8 bytes |
| 速度 / 延遲 | 較慢，遺失要重傳 | 較快 |
| 用在 | HTTP/1.1、HTTP/2、SSH、資料庫連線、email | DNS 查詢、影音串流、視訊通話、線上遊戲、QUIC（HTTP/3） |

**怎麼選：** 資料**一個 byte 都不能錯**就用 TCP；**晚到的資料等於沒用**（視訊畫面、遊戲座標）就用 UDP，掉了直接用下一筆。

## 三次握手（建立連線）

```text
Client                          Server
  │ ── SYN (seq=x) ──────────────▶ │   我想連線
  │ ◀── SYN-ACK (seq=y, ack=x+1) ─ │   好，我也想
  │ ── ACK (ack=y+1) ────────────▶ │   收到，開始傳
  │ ═══════════ 傳資料 ═══════════ │
```

為什麼是三次不是兩次？雙方都要確認**自己送得出去、也收得到對方的**，並交換各自的起始序號（seq）。只有兩次的話，server 無法確認 client 收到了它的 SYN；網路上殘留的舊 SYN 也可能讓 server 白白開一條連線。

## 四次揮手（關閉連線）

```text
Client                          Server
  │ ── FIN ──────────────────────▶ │   我沒有要送的了
  │ ◀── ACK ────────────────────── │   知道了（但我可能還有資料要送）
  │ ◀── FIN ────────────────────── │   我也送完了
  │ ── ACK ──────────────────────▶ │
  │  TIME_WAIT（等 2×MSL 才真正關閉）
```

比握手多一次，是因為 TCP 是**雙向**的，兩個方向要各自關閉；server 收到 FIN 時可能還有資料沒送完，所以 ACK 和 FIN 分開送。

> 實務上常見的問題：大量短連線會讓主動關閉的一方堆積 `TIME_WAIT`，把 port 用光。解法通常是**重用連線**（HTTP keep-alive、connection pool），而不是去調 kernel 參數。用 `ss -tan` 可以看各狀態的連線數（見 [Commands](/os/linux/commands)）。

## TCP 怎麼保證可靠

- **序號（seq）與 ACK**：每個 byte 都有編號，收到的一方回 ACK 告訴對方「下一個我要第幾號」，所以能重組順序、丟掉重複。
- **重傳**：等不到 ACK（timeout）或連續收到 3 個重複的 ACK，就重送。
- **Flow control（流量控制）**：接收端用 window size 告訴對方「我的 buffer 還剩多少」，避免把接收端塞爆。
- **Congestion control（壅塞控制）**：發送端從小量開始送（slow start），沒掉封包就加速，掉了就減速，避免把整個網路塞爆。

## Head-of-line blocking

TCP 保證順序，代價是**前面一個封包掉了，後面已經到的也得等它重傳**。這就是 HTTP/2 在差的網路下反而可能比較慢、HTTP/3 改用 UDP（QUIC）的原因，見 [HTTP 版本演進](/network/http#版本演進)。

## 常見網路協定一覽

TCP 和 UDP 是傳輸層的兩條路，日常用到的應用層協定大多就蓋在它們上面：

![8 種常見網路協定的運作方式與使用情境](0292-explaining-8-popular-network-protocols-in-1-diagram.png)

> 圖片來源：[ByteByteGo](https://blog.bytebytego.com)

1. **HTTP**：client-server 的請求-回應協定，用來抓 HTML、圖片、API 資料等資源，是 Web 資料交換的基礎。跑在 TCP 上（見 [HTTP](/network/http)）。
2. **HTTP/3**：HTTP 的下一個主要版本，改跑在 **QUIC（UDP）** 上，一個 stream 掉封包不會卡住其他 stream，連線建立也更快。很適合常換網路的行動裝置，以及 VR 這類需要大量頻寬、對延遲敏感的應用（見 [HTTP 版本演進](/network/http#版本演進)）。
3. **HTTPS**：HTTP 加上 TLS 加密，先用公鑰交換出 session key，之後的資料都用它加密（見 [HTTPS / SSL / TLS](/network/security)）。
4. **WebSocket**：在一條 TCP 連線上做**全雙工**通訊。先用 HTTP 的 `Upgrade` header 握手，server 回 `101 Switching Protocols` 後，這條連線就改講 WebSocket。REST 只能由 client 主動「拉」資料，WebSocket 讓 server 也能主動「推」，適合聊天、股價、線上遊戲這類即時更新。
5. **TCP**：先三次握手建立連線，保證資料送達且照順序，許多應用層協定都蓋在它上面（見上面的 [三次握手](#三次握手建立連線)）。
6. **UDP**：不建立連線，直接把封包丟給對方。適合「偶爾掉一個封包比等它重傳好」的場景，例如語音、視訊通話。
7. **SMTP**：在 mail server 之間**寄送** email（port 25；client 送信給自己的 mail server 用 587）。收信則是另外的 IMAP / POP3。
8. **FTP**：在 client 和 server 之間傳檔案，特別的是它把**控制通道**（port 21，送指令）和**資料通道**（送檔案內容）分成兩條連線。FTP 是明文傳輸，現在多改用 SFTP（走 SSH）或 FTPS。
