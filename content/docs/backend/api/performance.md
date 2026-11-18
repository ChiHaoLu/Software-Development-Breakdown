---
title: "API Performance"
---

## 分頁（Pagination）

回傳集合的 API 一律分頁，而且**在資料長大之前就先設好上限**。等到資料量真的大到出問題才補分頁，就變成 breaking change 了。

方式 | 寫法 | 優點 | 缺點
--- | --- | --- | ---
Offset | `?limit=20&offset=40` | 簡單，可以直接跳到第 N 頁 | 資料量大時很慢（DB 要先掃過前面的資料）；翻頁途中有新增或刪除時，資料會重複或漏掉
Cursor | `?limit=20&cursor=abc123` | 很快，資料變動也不會亂 | 不能跳頁，只能一頁一頁往下翻

大型 API（Slack、Stripe、GitHub GraphQL）大多用 cursor：response 裡附上 `next_cursor`，client 拿它去要下一頁，拿到空值就代表沒有下一頁了。

## 不要在大集合裡巢狀放另一個大集合

這跟 [API Design](./design.md#資源之間有關聯的時候uri-要怎麼設計) 講 URI 巢狀的那段不一樣，這裡講的是 **response 內容的巢狀**。

> Slack 的 `channels.list` 會回傳每個頻道，以及每個頻道的**所有成員**。團隊從幾百人長到幾萬人之後，一次回應就大到撐不住，而且兩層都要分頁時根本沒辦法設計。最後拆成 `conversations.list`（列出頻道）和 `conversations.members`（某個頻道的成員），效能和使用體驗都變好了。

## 限流（Rate limiting）

限制每個 client 在一段時間內最多能打幾次 API，避免一個寫壞的 client 或無窮迴圈把整個服務拖垮。超過上限時：

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30                  ← 30 秒後再試
```

另外也可以在每個回應裡附上剩餘額度（例如 GitHub 的 `X-RateLimit-Remaining`），讓 client 自己調整呼叫速度。

> 不要以為「自己用起來夠快」就代表大家都夠快。開發者一定會用你沒想到的方式呼叫你的 API。

### 常見演算法

演算法 | 做法 | 特性
--- | --- | ---
Fixed window | 每個固定時間窗（例如每分鐘）各自計數，超過就擋 | 最簡單；但在窗口交界處可能放進 2 倍流量（59 秒打 100 次、61 秒再打 100 次）
Sliding window log | 記下每個請求的時間戳，數「過去 60 秒內」有幾個 | 精準，但每個請求都要存，記憶體成本高
Sliding window counter | 用「目前窗口計數 + 前一個窗口計數 × 重疊比例」估算 | 接近精準、成本低，實務上很常用
Token bucket | 桶子以固定速率補 token，每個請求拿走一個，沒 token 就擋 | **允許短暫突發**（桶子滿時可以一次用掉），AWS、Stripe 都用這種
Leaky bucket | 請求先進佇列，以固定速率流出處理 | 輸出最平滑，但突發流量會排隊、延遲變高

```text
Token bucket（容量 10，每秒補 2 個）

  補 token ──▶ ┌──────────┐
   2 個/秒     │ ● ● ● ●  │ ← 目前 4 個
               └────┬─────┘
                    │ 每個請求拿 1 個
                    ▼
            有 token → 放行
            沒 token → 429
```

### 實作上要注意

- **用什麼當 key**：API key、user ID 比 IP 準。用 IP 限流時，NAT 後面的整間公司、整個電信業者（CGNAT）會共用一個額度，容易誤傷（見 [NAT](/network/ip)）。
- **多台 server 要共用計數**：每台各自計數的話，3 台 server 就等於上限變 3 倍。通常把計數放在 Redis，用 `INCR` + `EXPIRE`，或用 Lua script 讓「讀取、判斷、遞增」變成原子操作，避免 race condition。
- **放在哪一層**：越外層越省資源。CDN / WAF（例如 Cloudflare）擋 DDoS 和爬蟲，API Gateway 或 [reverse proxy](/backend/proxy)（Nginx 的 `limit_req`）擋一般超量，應用程式內再依商業規則限制（例如「每個使用者每天最多寄 5 封驗證信」）。
- **分級限制**：登入、寄信、付款這類敏感 endpoint 要比一般讀取 API 嚴格得多，也能擋暴力破解。
- **Redis 掛掉怎麼辦**：要先決定是 fail-open（放行，保住可用性）還是 fail-closed（全擋，保住後端）。

限流是保護自己不被打爆；呼叫別人時怎麼避免把對方打爆、對方掛掉時怎麼不被拖垮，見 [Resilience](/system/resilience)。

## Reference

- [Top 5 API Performance Tips](https://www.youtube.com/watch?v=b4TpO9pYpqk)
- [How we design our APIs at Slack](https://slack.engineering/how-we-design-our-apis-at-slack/)
- [Cloudflare: How we built rate limiting capable of scaling to millions of domains](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)
- [Stripe: Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters)
