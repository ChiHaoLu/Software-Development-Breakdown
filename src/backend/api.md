# API

> 每家服務都會加入他們自己的喜好，可以先掌握一些底層的概念，再去看別人的手冊，當作一種設計的參考範例
> 現在主流的 api 通常都會以 RESTful 為基礎，再根據團隊的習慣做調整，所以建議可以先了解 RESTful api 的基本概念
> By Cyan

- [How We Design Our APIs at Slack](https://slack.engineering/how-we-design-our-apis-at-slack/)
- [API design guide](https://cloud.google.com/apis/design)
- [API note](https://x.com/nikkisiapno/status/1797882928648925515?s=46&t=FIpRVfpSS4pqRodQSt6utQ)

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

#### The Six Core Principles of REST
1. **Client-Server Architecture**: The client (user interface) and the server (data storage/processing) are decoupled and can evolve independently, provided the interface between them remains consistent. This separation improves portability across platforms and increases scalability.
1. **Statelessness**: Each client request to the server must contain all the information necessary for the server to understand and process it, without the server needing to store any client context or session state between requests. This design improves the system's reliability and scalability.
1. **Cacheability**: Responses from the server must define themselves as cacheable or non-cacheable. This allows clients or intermediaries (like proxies) to store responses to reduce network latency, improve performance, and decrease server load for repeated requests.
1. **Uniform Interface**: This is a fundamental constraint that simplifies the overall system architecture by mandating a standard way of interacting with the API. This includes:
    1. Resource Identification: Unique URIs (Uniform Resource Identifiers) are used to identify each resource.
    1. Resource Manipulation Through Representations: Clients receive representations of resources (e.g., in JSON or XML format) and have enough information to modify or delete the resource on the server.
    1. Self-Descriptive Messages: Each message includes enough information (typically via HTTP headers) to describe how to process it.
    1. Hypermedia as the Engine of Application State (HATEOAS): Clients should only need the initial URI and then dynamically discover all other resources and actions by following hyperlinks provided in the responses.
1. **Layered System**: The architecture can be composed of multiple hierarchical layers (such as security, load balancers, or proxies) between the client and the end server. The client cannot ordinarily tell whether it is connected directly to the end server or an intermediary, which enhances scalability and security.
1. **Code on Demand (Optional)**: This is the only optional constraint. It allows the server to temporarily extend or customize client functionality by transferring executable code (e.g., JavaScript) to the client, such as for client-side form validation.

### OpenAPI

提供開發者可以透過程式去存取應用軟體或網路服務，讓外部應用系統可以透過這些Open API存取原本私有的資源。Open AP 提供了一致的API規格、說明文件，使得API的使用方式對開發者而言易懂易讀，能用最少的成本進行開發及測試，較快的速度應用至商業流程服務上。

## 推薦書單
- Web API 設計原則｜API 與微服務傳遞價值之道