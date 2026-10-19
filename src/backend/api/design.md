# API Design

## 用 HTTP 的語意，不要自己發明 & 回 JSON 時要帶 `Content-Type: application/json`

見 [HTTP applied to RESTful Design](./HTTP.md#http-applied-to-restful-design) 與 [HTTP Header 和回傳格式的重要性](./HTTP.md#http-header-和回傳格式的重要性)。

## URI 裡不要放動詞

HTTP method 本身就是動詞，URI 裡再放一個就重複了。

```
❌ GET  /books/:slug/generateBookCover     ✅ GET  /books/:slug/book-cover
❌ POST /books/createNewBook               ✅ POST /books
❌ GET  /books/42/delete                   ✅ DELETE /books/42
```

這樣 URI 才會一致、好猜，快取、重試、權限這些看 method 運作的機制也才不會誤判。GET 不能有副作用：如果「產生」很耗資源，或是每次呼叫都會建立新東西，就改用 POST。

如果動作沒辦法用 CRUD 表達，可以把它改成修改狀態（`PATCH /orders/42 {"status":"cancelled"}`），或是把結果當成一種資源（`POST /sessions` = 登入）。真的很難轉換的話，才用 `POST /orders/42/cancel` 這種寫法。URI 慣例用小寫加 `-`（kebab-case）。

## 資源之間有關聯的時候，URI 要怎麼設計

在「找出作者 Cagan 的所有書」，有兩種寫法：

```
寫法 A：巢狀（nested）
GET /authors/Cagan/books

寫法 B：平的（flat）+ query string 過濾
GET /books?author=Cagan
```

推薦 **寫法 B**，理由有兩個：

1. **回傳的是哪種資源很明確。** `/books?...` 一看就知道拿回來的是 books，`author=Cagan` 只是篩選條件。`/authors/Cagan/books` 開頭是 authors，結尾是 books，讀的人得想一下才知道主角是誰。
2. **Flat is better than nested。** 這句出自 Python 的 [The Zen of Python（PEP 20）](https://peps.python.org/pep-0020/)，意思是結構越平越好懂。

為什麼 query string 比較好擴展？因為篩選條件變多的時候，巢狀寫法會越來越難處理：

```
# 想要「Cagan 寫的、2020 年後出版的、中文的書」

巢狀：/authors/Cagan/years/2020/languages/zh/books   ← 越疊越深，順序還得固定
平的：/books?author=Cagan&published_after=2020&lang=zh  ← 條件可以隨意組合
```

此外，`/books` 只要一個 endpoint 就能處理各種條件，不需要為每一種關聯另外開一條路由。

然而在業界其實兩種都很常見，例如 GitHub 就大量使用巢狀：

```
GET /repos/{owner}/{repo}/issues
GET /repos/{owner}/{repo}/pulls/{number}/comments
```

比較實際的判斷方式是：

情況 | 建議寫法 | 原因
--- | --- | ---
子資源**不能脫離**父資源存在 | 巢狀，**最多一層** | 例如訂單裡的明細 `/orders/42/items`，明細離開訂單就沒有意義
子資源可以獨立存在，或是多對多的關係 | 平的 + query | 一本書可能有多個作者，不適合硬掛在某一個作者底下
要用多個條件篩選、搜尋、排序 | query string | `/books?author=x&sort=-published_at`
拿單一一筆資料 | 直接用自己的 ID | 用 `/books/123`，不要寫 `/authors/5/books/123`

## 一個 API 只做一件事

一個 API 只服務一種用途。越簡單的 API 越好懂，也越容易擴展、優化和保護。**加功能很容易，拿掉很難**：已經有人在用的欄位，就再也拿不掉了。

> Slack 的 `rtm.start` 會回傳 WebSocket 網址，加上整個團隊、頻道和成員的資料。團隊變大之後，大部分呼叫的人其實只需要連線網址，所以 Slack 另外做了 `rtm.connect`，只回傳網址。

## 一致性：命名要跟產品用語對齊

一致性有三個層次：

層次 | 意思
--- | ---
業界標準 | 遵守大家都認同的慣例（HTTP 語意、status code、JSON）
自己的產品 | 欄位名稱用使用者在產品上看到的概念。不要縮寫或用內部術語，名字寧可長一點：`is_archived` 比 `arch` 好
自己的其他 API | 同樣的概念要用同樣的名字和格式。不能這支 API 叫 `user_id`，另一支叫 `uid`

把這些決定**寫成 style guide**。遇到沒有明顯正解的選擇，選一種之後就堅持下去。就算以前的決定現在看起來不太好，維持一致通常還是比改掉更好。

## 回傳有意義的錯誤

Status code 怎麼選，見 [善用 HTTP code](./HTTP.md#善用-http-code)。除了 status code，錯誤的 body 也要讓人**看得懂、意思明確、知道怎麼修**：

```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "invalid_email",
    "message": "email 格式不正確，應為 name@example.com",
    "field": "email",
    "doc_url": "https://api.example.com/docs/errors#invalid_email"
  }
}
```

- `code`：給程式判斷用的，要固定不變。client 會拿它寫 `if`，所以不要比對 `message` 的文字
- `message`：給人看的，說明哪裡錯了，以及怎麼修
- 不要洩漏內部實作細節：stack trace、SQL 錯誤、內部服務名稱都不能出現。這些對 client 沒有幫助，還會變成資安漏洞
- 全部 API 的錯誤格式要統一。另外可以參考標準格式 [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457)（`Content-Type: application/problem+json`）
- 做 SDK 的時候不要把錯誤吞掉，要讓開發者拿得到原始的 status、header 和 body

## 為規模和效能設計

### 分頁（Pagination）

回傳集合的 API 一律分頁，而且**在資料長大之前就先設好上限**。等到資料量真的大到出問題才補分頁，就變成 breaking change 了。

方式 | 寫法 | 優點 | 缺點
--- | --- | --- | ---
Offset | `?limit=20&offset=40` | 簡單，可以直接跳到第 N 頁 | 資料量大時很慢（DB 要先掃過前面的資料）；翻頁途中有新增或刪除時，資料會重複或漏掉
Cursor | `?limit=20&cursor=abc123` | 很快，資料變動也不會亂 | 不能跳頁，只能一頁一頁往下翻

大型 API（Slack、Stripe、GitHub GraphQL）大多用 cursor：response 裡附上 `next_cursor`，client 拿它去要下一頁，拿到空值就代表沒有下一頁了。

### 不要在大集合裡巢狀放另一個大集合

這跟上面講 URI 巢狀的那段不一樣，這裡講的是 **response 內容的巢狀**。

> Slack 的 `channels.list` 會回傳每個頻道，以及每個頻道的**所有成員**。團隊從幾百人長到幾萬人之後，一次回應就大到撐不住，而且兩層都要分頁時根本沒辦法設計。最後拆成 `conversations.list`（列出頻道）和 `conversations.members`（某個頻道的成員），效能和使用體驗都變好了。

### 限流（Rate limiting）

限制每個 client 在一段時間內最多能打幾次 API，避免一個寫壞的 client 或無窮迴圈把整個服務拖垮。超過上限時：

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30                  ← 30 秒後再試
```

另外也可以在每個回應裡附上剩餘額度（例如 GitHub 的 `X-RateLimit-Remaining`），讓 client 自己調整呼叫速度。

> 不要以為「自己用起來夠快」就代表大家都夠快。開發者一定會用你沒想到的方式呼叫你的 API。

## 避免 breaking change

Breaking change 指的是**任何會讓既有程式不能照原本方式運作的改動**。原則是：**昨天能用的，明天也要能用。**

會 break 的改動 | 不會 break 的改動
--- | ---
刪除或改名欄位、endpoint | 新增 endpoint
改變欄位的型別或意思 | 在 response 裡新增欄位
把選填參數改成必填 | 新增選填參數
改變錯誤碼或錯誤格式 | 新增錯誤碼（前提是 client 能處理不認得的錯誤碼）

不得不改的時候：

- **做版本控制**：在 URL 上（`/v1/books` → `/v2/books`），或是用 header（Stripe 用 `Stripe-Version: 2024-06-20`），讓舊版繼續運作一段時間
- **提前通知，並提供遷移協助**：影響的人越多、改起來越麻煩，就要越早通知
- **不要讓開發者每幾個月就得改一次**
- 事先準備好**溝通計畫**，萬一發生沒預期到、又回不去的 break 時派得上用場

## 讓人快速上手：Time to First Hello World

用「**新的開發者要花多久，才能成功呼叫第一次 API**」來衡量 API 好不好上手。Slack 的目標是入門開發者在 15 分鐘內完成。

要縮短這段時間，可以提供：

- 入門教學和範例程式
- 互動式的 API 測試工具（例如 Swagger UI）
- 多種程式語言的 SDK 和程式碼片段

不只要讓人打通 Hello World，還要讓開發者能做出一個**真的有人在用、有互動**的東西。

## 設計流程

先設計，再寫程式：

1. **寫 API spec**：寫清楚 method 名稱、用途、request / response 範例和可能的錯誤。spec 是大家對齊的依據，可以用 [OpenAPI](./README.md#openapi) 或 AsyncAPI 格式來寫，在實作之前就能先做出 prototype（但發布之後要持續更新）
2. **內部審查**：讓不同角色一起看，包括工程、PM、開發者關係、客服、資安。檢查跟既有 API 和 style guide 是否一致，以及命名、好不好用、安全性和效能。需要深入討論的問題，就留到定期的 API office hours
3. **先給合作夥伴看 spec**：寫程式之前先確認，這個 API 真的解決了對方的問題
4. **Beta 測試**：正式上線前，讓少數合作夥伴先用，根據回饋修正
5. **保持彈性**：規則不可能涵蓋所有情況。遇到例外時，依照規則背後的精神去處理，不要讓規則卡住進度，事後再把新的情況補進規則

---

## Reference

- [How we design our APIs at Slack](https://slack.engineering/how-we-design-our-apis-at-slack/)
