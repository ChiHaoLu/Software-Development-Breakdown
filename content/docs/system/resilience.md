---
title: "Resilience"
---

**微服務架構裡，一定會有某個下游服務在某個時刻變慢或掛掉。** Resilience（韌性）設計的目標不是讓它不會壞，而是讓**一個服務壞掉時，不會拖垮整個系統**。

## 連鎖故障是怎麼發生的

```text
User ──▶ API Gateway ──▶ Order Service ──▶ Payment Service（變慢，每個請求卡 30 秒）
```

1. Payment Service 變慢，但沒有完全掛掉。
2. Order Service 的每個請求都在等它，thread、DB connection、記憶體一直被佔住不放。
3. Order Service 的 thread pool 滿了，連不需要付款的請求（查訂單）也處理不了。
4. API Gateway 等 Order Service 等到逾時，也開始堆積……
5. 使用者看到整個網站都掛了，**問題的源頭只是一個付款服務變慢**。

變慢往往比直接掛掉更危險：掛掉會馬上收到錯誤，變慢會讓呼叫端的資源一直被佔住。下面幾種手段通常要**一起用**。

## Timeout

**每一個對外呼叫都要設 timeout。** 很多 HTTP client 的預設值是「無限等待」，這是連鎖故障最常見的起點。

- 分開設 **connect timeout**（連不上，通常 1 秒內）和 **read timeout**（連上但遲遲沒回應）。
- 依下游的實際延遲設定，例如 p99 是 200ms，timeout 設 500ms ～ 1s，而不是隨手寫 30 秒。
- **Deadline 要往下傳**：使用者的請求總共只能等 2 秒，第一個服務已經用掉 1.5 秒，呼叫下一個服務時就只剩 0.5 秒。gRPC 的 deadline、Go 的 `context.WithTimeout` 都能做到。

## Retry

暫時性的錯誤（網路閃斷、`503`、`429`）重試一下常常就好了，但**重試寫不好，反而會把下游打得更死**。

- **只重試會暫時失敗的錯誤**：`400`、`401`、`404` 重試幾次結果都一樣，不要重試。
- **只重試[冪等](/backend/api/design#冪等-idempotency)的操作**：否則 timeout 後重試扣款，可能扣兩次。
- **Exponential backoff**：每次等待時間加倍（100ms → 200ms → 400ms → 800ms），給下游恢復的時間。
- **加上 jitter（隨機抖動）**：1000 個 client 同時失敗，如果都剛好等 200ms 再重試，又會在同一瞬間一起打過去。等待時間要加上隨機值，把重試打散。
- **限制次數與總量**：最多重試 3 次。更進一步可以用 **retry budget**：重試的請求不能超過總請求的 10%。
- **只在一層重試**：A → B → C 每層都重試 3 次，C 會收到 3 × 3 × 3 = 27 倍的流量。

```text
sleep = min(cap, base * 2^attempt) * random(0.5, 1.0)
```

## Circuit Breaker

Timeout 和 retry 處理的是「單一請求」。但下游已經明顯掛了的時候，每個請求還是要等到 timeout 才失敗，而且還會一直重試。**Circuit breaker（斷路器）** 就像家裡的電源斷路器：偵測到異常就先「跳電」，直接讓請求失敗，不再打過去。

```text
                     失敗率超過門檻
                （例如 10 秒內 50% 失敗）
   ┌──────────┐ ──────────────────────▶ ┌──────────┐
   │  Closed  │                         │   Open   │
   │ 正常放行  │                         │ 直接失敗  │ ◀─┐
   └──────────┘                         └──────────┘   │
        ▲                                    │ 冷卻時間到   │
        │ 試探請求都成功                     ▼ （例如 30 秒）│ 試探請求失敗
        │                              ┌───────────┐    │
        └───────────────────────────── │ Half-Open │ ───┘
                                       │ 放少量請求 │
                                       └───────────┘
```

狀態 | 行為
--- | ---
**Closed** | 正常把請求送給下游，同時統計失敗率
**Open** | 不呼叫下游，**立刻**回錯誤或走 fallback。呼叫端的資源不會被卡住，下游也有喘息的空間
**Half-Open** | 冷卻時間到後，放少量請求過去試探。成功就回到 Closed，失敗就再回到 Open

好處有兩個方向：

- **保護自己**：不用每個請求都等 timeout，thread 和連線不會被耗盡。
- **保護下游**：下游已經快撐不住的時候，不會再被大量請求和重試補刀，比較有機會恢復。

設定上要注意：

- 失敗要算哪些：timeout、`5xx`、連線錯誤要算；`4xx` 是呼叫端自己的錯，不該讓斷路器跳開。
- 要有**最少請求數**：1 個請求失敗 1 次就是 100% 失敗率，不能因此跳開。
- **每個下游各自一個斷路器**：付款服務掛了，不應該影響呼叫庫存服務。

### Fallback

斷路器打開時，與其直接回錯誤，常常可以**降級（graceful degradation）**：

- 推薦服務掛了 → 顯示熱門商品清單（預先算好的靜態資料）
- 個人化設定拿不到 → 用預設值
- 讀取價格失敗 → 用快取裡稍舊的資料，標示「價格可能有變動」
- 付款這種不能隨便降級的 → 明確告訴使用者「暫時無法付款，請稍後再試」，而不是讓頁面轉圈圈 30 秒

> Netflix 是讓這個模式普及的公司。它早年開源的 **Hystrix** 把 timeout、circuit breaker、fallback、bulkhead 包在一起，推薦清單掛掉時首頁仍能顯示一般內容。Hystrix 已停止開發，Java 現在多用 **Resilience4j**；Go 有 `sony/gobreaker`；也可以交給 service mesh（Istio、Envoy 的 outlier detection）在網路層處理，不用改程式。

## Bulkhead

名字來自船艙的隔板：一個艙進水，隔板讓水不會淹到其他艙。

做法是**把資源依下游分開**：呼叫付款服務最多用 20 個 thread / 連線，呼叫庫存服務另外 20 個。付款服務卡住時，最多就是那 20 個被佔滿，查詢庫存的請求不受影響。回到開頭的例子，這就能避免第 3 步「連查訂單都不能用」。

Kubernetes 上把不同功能拆成不同的 Deployment、各自設 resource limit，也是同樣的概念。

## Load Shedding

自己快撐不住的時候，**主動丟掉一部分請求**，總比全部請求都變慢、最後一起逾時好。

- 佇列太長、CPU 太高時，直接回 `503`，讓 client（或 load balancer）去找別台。
- 依優先順序丟：先丟背景工作和爬蟲，保留結帳和登入。
- 已經等太久的請求（client 早就 timeout 了）直接丟掉，不要再做白工。

[Rate limiting](/backend/api/performance#限流rate-limiting) 是事先依「每個 client 的額度」擋；load shedding 是依「自己目前的負載」擋，兩者互補。

## 一句話總結

> 對外呼叫一律設 **timeout**；只對冪等操作做有 **backoff + jitter** 的 **retry**；下游明顯掛掉時用 **circuit breaker** 快速失敗並走 **fallback**；用 **bulkhead** 把資源隔開，讓故障只影響一個艙。

## Reference

- [Martin Fowler: CircuitBreaker](https://martinfowler.com/bliki/CircuitBreaker.html)
- [AWS Builders' Library: Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [AWS Builders' Library: Using load shedding to avoid overload](https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/)
- [Netflix Tech Blog: Making the Netflix API More Resilient](https://netflixtechblog.com/making-the-netflix-api-more-resilient-a8ec62159c2d)
- [Resilience4j](https://resilience4j.readme.io/)
- Michael Nygard, *Release It!*（Circuit Breaker、Bulkhead 等模式的出處）
