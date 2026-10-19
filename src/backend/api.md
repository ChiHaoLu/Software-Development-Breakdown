# API

> 每家服務都會加入他們自己的喜好，可以先掌握一些底層的概念，再去看別人的手冊，當作一種設計的參考範例
> 現在主流的 api 通常都會以 RESTful 為基礎，再根據團隊的習慣做調整，所以建議可以先了解 RESTful api 的基本概念
> By Cyan

## What's the difference between RPC and REST?

Remote Procedure Call (RPC) 和 REST 是兩種不同的 API 設計架構。

API 是用在不同的軟體元件（例如組件、服務）之間有一個共同的定義或協議（protocol），讓他們可以彼此溝通。有了 API 之後軟體工程師就可以呼叫第三方的服務或組件等。

RPC API 可用於在你的服務裡面呼叫外部的服務（remote functions in external servers），例如在你的軟體裡面加入聊天功能（呼叫外部的 chatting app）。

反過來說 REST APIs 可以讓你呈現（給予）特定的資料操作（給別人讀、讓別人寫）給外部的 server，例如，你可以提供外部 server 一個 REST APIs 讓他來更改你裡面的員工資料。

這兩種 API 設計都可以幫助外部不用了解（或從零開始撰寫）內部服務是怎麼實作的：can scale and change with less code rewriting

### Similarities between RPC and REST APIs

- 抽象 Abstraction：focus on function rather than technical implementation
- 溝通 Communication：為了可讀性與彈性以及訊息溝通，會使用 JSON and XML
- 跨語言相容 Cross-language compatibility：不同服務可能使用不同的 programming language

### Architecture principles: RPC vs. REST

RPC 專注在 functions 和 actions，而 REST 專注在 resources 或 objects。

在 RPC 中，client 會對 server 呼叫 remote function，所以會有多個 data / values 會隨著 call 一起被傳送。

反過來說，REST API 的 client 會向 server 發起一些 request 以此對某些資料做 CRUD（create, read, update, and delete），這個 request 會以 HTTP verbs or HTTP methods 的形式。

#### RPC principles

RPC 並沒有像 REST 那麼標準化，主要用於。

> REST 有一套大家都遵守的規則：用 HTTP、用 URL 表示資源（/users/123）、用 GET/POST/PUT/DELETE 表示動作。
> RPC 只是一種「概念/風格」，底下怎麼傳資料、用什麼格式，每個實作都不一樣（gRPC、JSON-RPC、XML-RPC、Thrift……各自一套）。

- 遠端呼叫 Remote invocation：
    - 讓你呼叫另一台機器上的函式，寫起來跟呼叫本地函式一樣。
    - REST 的思考方式是「對某個資源做某個動作」，RPC 的思考方式是「呼叫某個函式」。
- 傳遞參數 Passing parameters：
    - 客戶端把參數傳給伺服器的函式，跟本地函式傳參數差不多。
    - `getUser(123)` 裡的 `123` 就是參數。RPC 框架會自動把它序列化（例如轉成 JSON 或 Protobuf 二進位），透過網路送過去，伺服器那邊再反序列化回來，交給真正的函式。
- Stubs：
    - 是一個「替身」函式，負責處理網路傳輸的苦工，兩邊各有一個
    - Client stub：長得跟 `getUser` 一模一樣，但裡面沒有商業邏輯，只會「把函式名稱跟參數打包 → 送出去 → 等回應 → 解包回傳」。你以為在呼叫函式，實際上呼叫的是這個替身。
    - Server stub：收到網路請求後，把資料解包，然後呼叫伺服器上真正的 `getUser`，再把結果打包送回去。
    - Stub 通常不是手寫的，而是工具自動產生的。以 gRPC 為例，你先在 `.proto` 檔定義介面，工具就會幫你產生兩邊的 stub 程式碼。

```
 客戶端                                         伺服器
┌──────────────┐                           ┌──────────────┐
│ 你的程式碼     │                           │ 真正的函式     │
│ getUser(123) │                           │ getUser(id)  │
└──────┬───────┘                           └──────▲───────┘
       │                                          │
┌──────▼───────┐       網路傳輸               ┌───────┴──────┐
│ Client Stub  │ ───── {fn:"getUser", ─────▶ │ Server Stub  │
│ (假的 getUser)│        args:[123]}          │ (接收並轉呼叫)  │
└──────────────┘ ◀──── 回傳結果 ────────────── └──────────────┘
```

#### REST principles

REST 非常標準化。REST 有一套大家都認同的規則：用 HTTP、用 URL 代表資源、用 HTTP method 代表動作、用 status code 代表結果。只要你會用一個 REST API，換到另一個通常也很快上手。

> 以下五條不是隨便定的，是 Roy Fielding 在他 2000 年的博士論文裡提出的「REST 架構限制」。符合這些限制的 API，才算 RESTful。

- Client-server 客戶端與伺服器分離：
    - 把 client 和 server 拆開，當成兩個獨立的系統。Client 只管畫面和使用者互動（網頁、App），Server 只管資料和商業邏輯，兩邊只透過 API 溝通，互相不用知道對方內部怎麼做。
    - 好處在於前端要從 React 換成 Vue、或多做一個 iOS App，後端都不用改。後端換資料庫，前端也不受影響。只要 API 的「合約」不變，兩邊可以各自演進。
- Stateless 無狀態：
    - Server 不會記住 client 上一次請求的狀態：每個請求都要自己帶齊所有需要的資訊，server 不靠「上一次的記憶」處理。
    - 這也是為什麼 REST API 常用 JWT / API token，每次請求都放在 header 裡。
    - 好處：任何一台 server 都能處理任何請求，因為不用去找「那台記得你的 server」，所以很好水平擴展（加機器、做 load balancing）。
    - 代價：每個請求會比較大，因為要重複帶一樣的資訊。
- Cacheable 可快取：
    - Client 或中間的系統可以快取 server 的回應，前提是回應有標明可以快取。
    - 通常是 server 在回應裡標明能不能快取、能快取多久，用的是 HTTP header：
    ```
    HTTP/1.1 200 OK
    Cache-Control: max-age=3600     ← 這個回應可以快取 1 小時
    ETag: "abc123"                  ← 版本號，之後可以問「有沒有變？」
    ```
    - 瀏覽器可以直接用快取，不用再發請求
    - CDN（像 Cloudflare）可以幫你擋掉大量重複請求
    - 好處：減少 server 負擔、回應更快。
- Layered system 分層系統：
    - Client 和 server 之間可以有中間層，但兩邊都不知道它們存在，運作起來就像直接相連。
    ```
    Client ──▶ CDN ──▶ Load Balancer ──▶ API Gateway ──▶ Server
         (快取)    (分流)            (驗證、限流)
    ```
    - Client 以為自己直接連到 api.example.com，其實中間經過好幾層。Server 也不在乎前面有誰，照常處理請求。
    - 好處：可以隨時加入或移除中間層（加快取、加安全防護、加負載平衡），不用改 client 或 server 的程式。
    - 這條跟上面兩條有關：因為 stateless，中間層才能隨便轉發；因為 cacheable，中間層才能幫忙快取。
- Uniform interface 統一介面：
    - Client 和 server 用一套標準化的指令和訊息格式溝通。資源用 URL 識別，這個 URL 就叫做 REST API endpoint。這是 REST 最核心、也最能跟 RPC 區分的一條。
    - REST 裡動作只有那幾個固定的 HTTP method，不會出現 /getUser、/deleteUser 這種把動詞寫進 URL 的設計。結果也統一用 status code 表示（200 成功、404 找不到、401 沒授權……）。
    - 好處：所有 REST API 長得都差不多，看到 URL 和 method 大概就知道它在做什麼。
    - URL 代表「資源」（名詞），HTTP method 代表「動作」（動詞）：

動作 |	REST|	RPC 風格（對比
--- | --- | ---
取得使用者 | 	GET /users/123	 | POST /getUser
建立使用者 | 	POST /users | 	POST /createUser
更新使用者 | 	PUT /users/123	 | POST /updateUser
刪除使用者 | 	DELETE /users/123	 | POST /deleteUser


小結：RPC 的核心是「呼叫函式」（動詞導向），REST 的核心是「操作資源」（名詞導向）。

### How they work: RPC vs. REST

在 RPC 裡面，client 會直接使用 HTTP POST 來呼叫特定的函式名稱，所以 client-side developer 就必須知道 function name 和 params。

在 REST 裡面，clients 和 servers 都用 HTTP 動詞像是 GET, POST, PATCH, PUT, DELETE, and OPTIONS。開發者只需要知道 server resource URLs 而不用知道準確的 function name。

例如要「增」，RPC 使用 POST on function, and REST 使用 POST on URL：
- RPC 為：
    ```
    POST /addProduct HTTP/1.1

    HOST: api.example.com

    Content-Type: application/json

    {"name": "T-Shirt", "price": "22.00", "category": "Clothes"}
    ```
- REST 為：
    ```
    POST /products HTTP/1.1

    HOST: api.example.com

    Content-Type: application/json

    {"name": "T-Shirt", "price": "22.00", "category": "Clothes"}
    ```

### When to use?

判斷方式很簡單：你要「做一件事」還是「操作一筆資料」？
- 要做一件事（動詞）→ RPC
- 要對資料做增刪改查（名詞）→ REST

真實世界的系統很少只用一種：

- 對外的公開 API 常用 REST，因為標準化、好懂、好快取（例如 GitHub API）
- 內部微服務之間常用 RPC（尤其 gRPC），因為效能好、型別嚴謹

很多 REST API 裡也會夾幾個 RPC 風格的 endpoint，例如 GitHub 的 POST /repos/{owner}/{repo}/merges（合併分支），因為「合併」本來就是一個動作。

#### RPC 適合：要觸發「動作」、拿「動作的結果」
RPC 通常用來呼叫遠端函式，你要的是動作執行完的結果。適合複雜運算，或觸發 server 上的某個程序，而且過程不讓 client 看到。

> 重點是「過程隱藏」：client 只說「幫我做 X」，不用知道 server 裡面跑了哪些步驟。

例子 | 為什麼適合 RPC
--- | ---
用遠端裝置的相機拍照	|這是操作硬體的動作，不是「一筆資料」
用 ML 演算法偵測詐騙	|複雜運算，client 只要結果（是/不是詐騙）
轉帳到另一個帳戶	|一個動作牽涉很多步驟（扣款、入帳、記錄、檢查餘額），要一次完成
遠端重開 server	| 純粹觸發一個動作，沒有對應的資料可以 CRUD

#### REST 適合：對「資料」做 CRUD

REST API 通常用來對 server 上的資料物件做 CRUD（Create 建立、Read 讀取、Update 更新、Delete 刪除）。適合需要用統一方式公開資料和資料結構的情況。

例子	| CRUD	| REST 寫法
--- | --- | ---
新增商品到資料庫	| Create	| POST /products
取得音樂播放清單內容|	Read	| GET /playlists/7/songs
更新某人的地址	|Update	|PUT /users/123/address
刪除一篇部落格文章|	Delete	| DELETE /posts/88

這些都有一個明確的名詞（商品、播放清單、地址、文章），動作就是 HTTP method 那幾個。這正是上一段講的 Uniform interface：所有資源都用同一套規則操作，別人一看就懂。

---

# 未整理

- [How We Design Our APIs at Slack](https://slack.engineering/how-we-design-our-apis-at-slack/)
- [API design guide](https://cloud.google.com/apis/design)
- [API note](https://x.com/nikkisiapno/status/1797882928648925515?s=46&t=FIpRVfpSS4pqRodQSt6utQ)



https://youtu.be/b4TpO9pYpqk?si=9R7EQ_5sTKqrQeZx

## HTTP Request

- [HTTP Methods](https://www.contrive.mobi/aviorapi/HTTPMETHODS.html)
- [mdn Authorization](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization)
- [HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status): 需要經驗累積什麼時候用 `panic`（shut down the server and return `500`），什麼時候用 `return err`（won't shut down the server and return `4xx`)

## 驗證
- [27 成為看起來很強的後端：JWT 跟 Session 怎麼組合？](https://www.youtube.com/watch?v=GxhPQl2guXM&ab_channel=Web%E5%AF%A6%E9%A9%97%E5%AE%A4)
- [理解 Session 和 Cookie](https://www.youtube.com/watch?v=lNQAl71Abqc&ab_channel=%E4%BB%A3%E7%A0%81%E7%9C%9F%E9%A6%99)

## API 風格

### Remote Procedure Call (RPC)

- [Remote Procedure Call (RPC)](https://www.techtarget.com/searchapparchitecture/definition/Remote-Procedure-Call-RPC)
- [RPC是什麼，看完就知道了](https://zhuanlan.zhihu.com/p/187560185)

### RESTful API

- [什麼是RESTful API？](https://aws.amazon.com/tw/what-is/restful-api/)
- [簡明RESTful API設計要點](https://tw.twincl.com/programming/*641y)

REST (Representational State Transfer) is a software architectural style, that is based on a set of six guiding principles (also called constraints) for designing scalable and reliable networked applications. 

Systems that adhere to these principles are often described as RESTful.


### OpenAPI

提供開發者可以透過程式去存取應用軟體或網路服務，讓外部應用系統可以透過這些Open API存取原本私有的資源。Open AP 提供了一致的API規格、說明文件，使得API的使用方式對開發者而言易懂易讀，能用最少的成本進行開發及測試，較快的速度應用至商業流程服務上。

### GRPC

https://youtu.be/nw5YbyA04J0?si=twzitK1Aumt0OoTq


---

## Reference

[armankhondker/best-system-design-resources](https://github.com/armankhondker/best-system-design-resources)


## 推薦書單
- Web API 設計原則｜API 與微服務傳遞價值之道