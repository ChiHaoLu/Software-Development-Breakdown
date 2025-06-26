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

## 推薦書單
- Web API 設計原則｜API 與微服務傳遞價值之道