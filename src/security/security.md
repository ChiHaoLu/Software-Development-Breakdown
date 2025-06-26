# Seciruty

- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/AJAX_Security_Cheat_Sheet.html)
- [Web-based Wallet security practices](https://github.com/jayden-sudo/WalletAttackDemos/tree/main)

### 阻擋工具
- Cloudflare Tunnel
- fail2ban
- Zap trigger
- roboshadow

### 靜態分析工具(SAST, static application security testing) 

> 包含 lint，也包含用數學的方式證明程式的某些行為符合其設計規約，當然也包含把常見的 bug 引入測試

- CodiumAI
- PVS Studio
- ESlint
- SonarQube
- Fortify Static Code Analyzer
- Coverity
- Codacy
- ReSharper

## 常見攻擊

### DDoS

- [DDoS 技术鉴赏](https://www.youtube.com/watch?v=7kB9-nQJR44&ab_channel=Ele%E5%AE%9E%E9%AA%8C%E5%AE%A4)
- [CloudFlare](https://www.cloudflare.com/zh-tw/)：把網域註冊在下面
    * I'm not robot
    * Rate Limitinig
    * Malicious Network Protection

### XSS - Cross Site Scripting

Protect the input field attack
- [XSS 原理與攻防- Web 安全常識](https://www.youtube.com/watch?v=QJzkifQ-Cuk&ab_channel=%E4%BB%A3%E7%A0%81%E7%9C%9F%E9%A6%99)
- [React XSS Guide: Examples and Prevention](https://www.stackhawk.com/blog/react-xss-guide-examples-and-prevention/)
- [What does it mean when they say React is XSS protected?](https://stackoverflow.com/questions/33644499/what-does-it-mean-when-they-say-react-is-xss-protected)
- [dangerouslySetInnerHTML](https://reactjs.org/docs/dom-elements.html#dangerouslysetinnerhtml)
- [Check List: Avoiding XSS in React applications](https://pragmaticwebsecurity.com/files/cheatsheets/reactxss.pdf)

### Environment Variables
* Protect Steal the `.env` by encryption: [Vercel: Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

### CORS - Cross-Origin Resource Sharing

- [Cross-Origin Resource Sharing (CORS) - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [[教學] 深入了解 CORS (跨來源資源共用): 如何正確設定 CORS？](https://www.shubo.io/what-is-cors/)
