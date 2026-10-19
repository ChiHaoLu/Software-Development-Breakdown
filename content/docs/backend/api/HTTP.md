---
title: "HTTP Request"
---

## HTTP applied to RESTful Design

REST 怎麼借用 HTTP 本來就有的語意來設計 API：

| 概念 | 意思 | 例子 |
|---|---|---|
| **Verb（方法）** | 你要「做什麼」 | GET、POST、PUT、PATCH、DELETE |
| **Resource / URI** | 你要「對誰做」，用名詞表示 | `/books/`、`/books/42` |
| **Endpoint** | 動詞 + URI 合起來，就是一個操作 | `POST /books/` = 新增一本書 |
| **CRUD 對應** | GET→讀、POST→建、PUT/PATCH→改、DELETE→刪 | `DELETE /books/42` = 刪掉第 42 本 |
| **Status code** | 用回應碼的第一位數表示結果類型 | 1xx 資訊、2xx 成功、3xx 轉址、4xx 客戶端錯、5xx 伺服器錯 |

重點是：REST 的 URL 裡**只放名詞**（資源），**動作交給 HTTP method**。所以 RESTful 風格不會寫成 `/getBook?id=42` 或 `/deleteBook`，而是 `GET /books/42`、`DELETE /books/42`。

> 補充：
> - **PUT vs PATCH**：PUT 是整個替換資源，PATCH 是只改部分欄位。
> - 結果用 status code 表達，不是在 body 裡塞 `{"success": false}` 再回 200。例如找不到就回 `404`，參數錯就回 `400`，新增成功回 `201 Created`。

### URI 跟 URL 有什麼不一樣

- **URI**（Uniform Resource **Identifier**）：用來**識別**一個資源的字串，是比較大的概念。
- **URL**（Uniform Resource **Locator**）：URI 的一種，除了識別之外，還告訴你**去哪裡、用什麼方式拿到它**（有 scheme + 位置）。
- **URN**（Uniform Resource **Name**）：URI 的另一種，只給名字、不給位置。

```
URI
├── URL：https://api.example.com/books/42   ← 有協定、主機，可以直接去拿
└── URN：urn:isbn:9780134685991             ← 只是一個名字，沒說在哪
```

實務上，在 Web API 裡你看到的幾乎都是 URL，兩個詞常常混著用。原文說「resource is represented by an URI: /library/」，嚴格來說 `/library/` 只是 URL 的 **path** 部分，作者用 URI 這個詞是在強調它是用來「識別資源」的。

### RPC 也用 HTTP，那 HTTP 到底用在哪？

關鍵是：**HTTP 是傳輸協定；REST 和 RPC 是 API 的設計風格**。它們不在同一層。

```
API 設計風格：   REST        RPC (JSON-RPC、gRPC…)     GraphQL
                  │             │                         │
傳輸協定：       └──────────── HTTP ────────────────────┘
                                │
                               TCP / (QUIC)
```

差別在**對 HTTP 用到多深**：

| | REST | RPC over HTTP |
|---|---|---|
| 核心概念 | 資源（名詞） | 函式呼叫（動詞） |
| URL | 很多個，每種資源一個 | 通常一個或少數幾個 |
| HTTP method | 有語意，GET/POST/PUT/DELETE 各司其職 | 幾乎都用 POST |
| Status code | 用來表達結果 | 常常都回 200，錯誤寫在 body |
| 例子 | `DELETE /books/42` | `POST /rpc` body: `{"method":"deleteBook","params":{"id":42}}` |

所以：
- **REST** 是把 HTTP 的 method、URL、status code、header（快取等）**當成語意的一部分**來用。
- **RPC** 大多只把 HTTP **當成一條送資料的管道**，真正的「要做什麼」寫在 body 裡。例如 JSON-RPC 打 POST；gRPC 跑在 HTTP/2 上，主要是為了用它的多路復用和串流。

HTTP 本身則是更通用的東西：瀏覽器載入網頁、下載檔案、Webhook、WebSocket 的握手、各種 API 都用它。REST 和 RPC 只是在 HTTP 上「怎麼組織 API」的兩種做法。

### HTTP Header 和回傳格式的重要性
在 REST API 回傳時，不要回傳純文字：
1. **REST API 慣例上用 JSON 當資料格式。** REST 本身沒有規定一定要用 JSON（也可以用 XML、YAML 等），只是大家都這樣用。
2. **光是 body 裡放 JSON 格式的字串還不夠，HTTP header 也要告訴對方「這是 JSON」**：

```
Content-Type: application/json
```

因為 HTTP 傳過去的 body 只是一串 bytes，收到的人**不會自己去猜內容是什麼格式**，要看 `Content-Type` 才知道怎麼解析。

他可以是 `text/plain` 不見得是 `application/json`：

```http
HTTP/1.1 200 OK
Content-Type: text/plain <- 不一定是 application/json

{"id": 42, "title": "Clean Code"}
```
另一個服務或腳本在呼叫你的 API，可能會幫你處理或判斷：

- **Python `requests`**：`response.json()` 通常還是能解析，但有些 client wrapper 或 SDK 會先檢查 `Content-Type`，不是 JSON 就直接報錯，或把它當成字串回傳。
- **JavaScript `axios`**：它會依照 header 決定要不要自動 parse。header 錯了，你拿到的 `response.data` 可能是字串，不是物件，後面的 `data.id` 就變成 `undefined`。
- **API Gateway、Proxy、監控工具**：會靠 `Content-Type` 決定要不要壓縮、記錄、轉換內容。
- **瀏覽器**：有 `X-Content-Type-Options: nosniff` 的時候，型別不對可能直接被擋下來。

| Header | 方向 | 意思 |
|---|---|---|
| `Content-Type` | request 或 response | **我送的** body 是什麼格式 |
| `Accept` | request | **我希望收到**什麼格式 |

所以 client 送 POST 時也要帶 `Content-Type: application/json`，不然 server 可能讀不到 body（例如 Express 的 `express.json()` 只會解析這個型別的 body）。如果 server 收到不支援的格式，應該回 `415 Unsupported Media Type`；client 的 `Accept` 要求的格式 server 給不出來，就回 `406 Not Acceptable`。


## 善用 HTTP code

### 401 Unauthorized vs 403 Forbidden

兩個都是安全相關的錯誤，差別在於卡在哪一關：

- **Authentication（驗證）**：你是誰？
- **Authorization（授權）**：你可以做這件事嗎？

| Status | 卡在哪 | 情境 | client 該怎麼辦 |
|---|---|---|---|
| `401 Unauthorized` | 驗證：**不知道你是誰** | 沒帶 token、token 無效或過期、帳密錯誤 | 重新登入或換新 token 再試 |
| `403 Forbidden` | 授權：**知道你是誰，但你沒權限** | 一般使用者想呼叫管理員的 API、想改別人的資料 | 再試幾次結果都一樣，要找人開權限 |

`401` 的名字取得不好，雖然叫 "Unauthorized"，實際意思是 **unauthenticated**（還沒驗證）。依照規範，回 `401` 時要帶 `WWW-Authenticate` header，告訴 client 該用哪種方式驗證，例如 `WWW-Authenticate: Bearer`。

> 如果連「這個資源存在」都不想讓對方知道（例如別人的私人 repo），可以直接回 `404 Not Found`，不要回 `403`。GitHub 就是這樣做的。

### 202 Accepted vs 201 Created

| Status | 意思 | Response 內容 |
|---|---|---|
| `201 Created` | 資源**已經建好了** | 新資源本身，加上 `Location: /books/42` |
| `202 Accepted` | 請求**收到了，但還沒處理完**（之後才會建立） | 用來查詢處理進度的位置，例如 `Location: /jobs/123` |

`202` 最適合**非同步任務**：產生報表、轉檔影片、批次匯入這種要跑很久的工作。不用讓 client 一直等，server 先回 `202`，之後 client 再自己去查進度：

```
POST /reports          → 202 Accepted, Location: /jobs/123
GET  /jobs/123         → 200 {"status": "processing"}
GET  /jobs/123         → 200 {"status": "done", "result": "/reports/9"}
```

假設「資源早就存在，但這不算錯誤」。這比較有爭議，`202` 的原意是「還沒處理完」，用在這裡語意不太對。比較常見的做法是：

- 重複的請求不算錯誤（冪等）：回 `200 OK` 並附上已經存在的資源，或是回 `303 See Other` 指向它
- 重複算是衝突：回 `409 Conflict`

---

## 未整理

- [HTTP Methods](https://www.contrive.mobi/aviorapi/HTTPMETHODS.html)
- [mdn Authorization](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization)
- [HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status): 需要經驗累積什麼時候用 `panic`（shut down the server and return `500`），什麼時候用 `return err`（won't shut down the server and return `4xx`)

