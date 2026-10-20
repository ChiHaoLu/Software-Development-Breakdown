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

## Reference

- [Top 5 API Performance Tips](https://www.youtube.com/watch?v=b4TpO9pYpqk)
- [How we design our APIs at Slack](https://slack.engineering/how-we-design-our-apis-at-slack/)
