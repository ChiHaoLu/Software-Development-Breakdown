---
title: "DNS"
---

DNS 把好記的名字（`api.example.com`）轉成 IP，像網路世界的電話簿。查詢通常用 **[UDP](/network/protocol#tcp-vs-udp) port 53**，回應太大（超過 512 bytes，例如 DNSSEC）或做 zone transfer 時改用 TCP。

## 查詢流程

```text
瀏覽器 / OS 快取 → 有就直接用
      │ 沒有
      ▼
Recursive Resolver（ISP 或 8.8.8.8、1.1.1.1，幫你跑完整個流程）
      │
      ├─▶ Root server：「.com 去問這幾台」
      ├─▶ TLD server (.com)：「example.com 去問這幾台」
      └─▶ Authoritative server (example.com)：「api.example.com = 93.184.216.34」
      │
      ▼
回傳給你，並依 TTL 快取
```

- **Recursive 查詢**：client 問 resolver，resolver 負責問到底再回答。
- **Iterative 查詢**：resolver 問 root、TLD、authoritative，每台都只回「下一個去問誰」。

## 常見的 Record 類型

| Record | 作用 | 例子 |
| --- | --- | --- |
| `A` | 名字 → IPv4 | `api.example.com → 93.184.216.34` |
| `AAAA` | 名字 → IPv6 | `api.example.com → 2606:2800::1` |
| `CNAME` | 名字 → 另一個名字（別名） | `www.example.com → example.com` |
| `MX` | 這個網域的 mail server | `example.com → mail.example.com` |
| `TXT` | 任意文字，常用來驗證網域、SPF | `"v=spf1 include:_spf.google.com ~all"` |
| `NS` | 這個網域由哪幾台 DNS server 負責 | `example.com → ns1.example.com` |

> `CNAME` 不能放在 zone apex（`example.com` 本身），因為那裡一定要有 `NS` 和 `SOA`。要讓根網域指向 load balancer 時，AWS Route53 用 **Alias record**、Cloudflare 用 **CNAME flattening** 來解決。

## TTL 與除錯

TTL 決定一筆紀錄被快取多久。**搬家前先把 TTL 調低**（例如 300 秒），切換完確認沒問題再調回來，不然舊 IP 可能還會被快取好幾個小時。

```bash
dig api.example.com            # 查 A record
dig api.example.com AAAA       # 查 IPv6
dig +trace api.example.com     # 從 root 開始一路查下來
dig @8.8.8.8 api.example.com   # 指定 resolver，比較是不是快取問題
```

在 k8s 裡 Service 也是靠叢集內的 DNS（CoreDNS）找到的，例如 `my-svc.my-namespace.svc.cluster.local`（見 [Kubernetes](/devops/k8s)）。

## 延伸閱讀

- [Cloudflare: What is DNS?](https://www.cloudflare.com/learning/dns/what-is-dns/)
