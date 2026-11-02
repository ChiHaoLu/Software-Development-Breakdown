---
title: "HTTP"
---

HTTP 是 L7 的請求-回應協定：client 送 request（method、path、header、body），server 回 response（status code、header、body）。**HTTP 本身是 stateless 的**，每個請求互不相關，要記住使用者得靠 cookie、token 等機制。

```http
GET /books/42 HTTP/1.1
Host: api.example.com
Accept: application/json

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: max-age=60

{"id": 42, "title": "Clean Code"}
```

Method、status code、header 在 API 設計上怎麼用，見 [HTTP Request](/backend/api/HTTP)；HTTPS 的加密見 [HTTPS / SSL / TLS](/network/security)。

## 版本演進

| 版本 | 傳輸層 | 主要改進 | 留下的問題 |
| --- | --- | --- | --- |
| HTTP/1.0 | TCP | | 每個請求都要開一條新的 TCP 連線 |
| HTTP/1.1 | TCP | **Keep-alive** 重用連線、`Host` header（一台機器掛多個網站）、chunked 傳輸 | 一條連線同時只能處理一個請求，瀏覽器只好開 6 條平行連線 |
| HTTP/2 | TCP | **Multiplexing**：一條連線同時跑多個 stream；binary framing；header 壓縮（HPACK） | TCP 層的 [head-of-line blocking](/network/protocol#head-of-line-blocking)：掉一個封包，所有 stream 一起等 |
| HTTP/3 | **QUIC（UDP）** | 每個 stream 各自重傳，互不卡住；TLS 1.3 內建，連線建立更快（0-RTT / 1-RTT）；換網路（Wi-Fi → 4G）時連線不斷 | 有些企業防火牆會擋 UDP，要能退回 HTTP/2 |

```text
HTTP/1.1  連線1: [req A]──[res A] [req B]──[res B]   一次一個
HTTP/2    連線1: [A1][B1][A2][C1][B2]...             多個 stream 交錯在同一條 TCP
HTTP/3    QUIC : stream A ── stream B ── stream C    各自獨立，A 掉封包不影響 B
```

> gRPC 跑在 HTTP/2 上，就是為了用它的 multiplexing 和雙向串流。

## 一次 HTTPS 請求要等幾個來回（RTT）

| | DNS | TCP 握手 | TLS 握手 | HTTP 請求 | 合計（首次連線，不算 DNS） |
| --- | --- | --- | --- | --- | --- |
| HTTP/1.1 / 2 + TLS 1.2 | 1 | 1 | 2 | 1 | 4 RTT |
| HTTP/1.1 / 2 + TLS 1.3 | 1 | 1 | 1 | 1 | 3 RTT |
| HTTP/3（QUIC） | 1 | 合併成 1 | | 1 | 2 RTT（重連可以 0-RTT） |

這也是為什麼要**重用連線**、用 CDN 把 server 搬到離使用者近的地方：RTT 是光速和距離決定的，程式寫再快也省不掉。

## 延伸閱讀

- [MDN: An overview of HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview)
