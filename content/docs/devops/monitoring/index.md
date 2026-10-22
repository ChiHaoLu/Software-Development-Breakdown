---
title: "監控與告警 (Monitoring)"
---

讓後端服務具備監控與告警能力的筆記，以 Prometheus 為主。

- [Prometheus 與 Metric 設計](/devops/monitoring/prometheus)：Prometheus 基本概念、metric type、metric contract、應用端實作與測試。
- [新服務接入 Prometheus](/devops/monitoring/onboarding)：與 SRE 對接、驗證、dashboard、alert rules、從 direct Slack 遷移與驗收 checklist。

## 監控鏈路長什麼樣

```text
Service
  └─ GET /metrics              應用輸出客觀數值
          ↓ pull / scrape
Prometheus                      定期採集並保存 time series
  ├─ Grafana dashboard          查詢、視覺化、調查
  └─ Alert rules                判斷何時進入 pending / firing / resolved
          ↓
Alertmanager / Grafana Alerting 分組、去重、靜默、通知路由
          ↓
Slack / Pager / On-call         通知人員
```

## 應用只輸出「事實」

應用輸出的是客觀數值，例如：

- 目前 queue 中有 12 個待處理項目。
- 最舊項目已等待 240 秒。
- 某個背景檢查最後成功是在 95 秒前。
- 某依賴目前已連續失敗 4 次。

應用通常不應自行決定：

- 這是 warning 還是 critical。
- 是否要發 Slack。
- 同一告警多久重複通知。
- 多個實例的告警如何合併。
- 恢復時要通知哪個 channel。

這些屬於 alert rule 與通知平台的責任。

## SWE 與 SRE 的責任邊界

### SWE 主要負責

- 定義業務健康與故障語義。
- 設計並實作 metrics。
- 保證 labels 有界且不含敏感資料。
- 提供 last-success / freshness。
- 撰寫應用測試。
- 提供舊告警映射與 threshold 建議。
- 配合 staging 故障驗證。
- 驗收後移除 direct notification code。

### SRE / Platform 主要負責

- Prometheus discovery 與 scrape 配置。
- ServiceMonitor / PodMonitor / 網路存取。
- 公司標準 rule engine 與部署方式。
- Alertmanager / Grafana Alerting routing。
- Slack / Pager receivers、silence、grouping。
- workload、Pod、node 及監控平台自身的外部監測。
- retention、HA、權限與平台運維。

### 共同決策

- scrape interval 與 freshness threshold。
- severity、`for`、notification delay。
- owner 與 runbook。
- expected target / route / shard 清單。
- 多副本時的聚合及去重語義。
- rollout、rollback 與舊通知移除時機。

## 完成標準

Prometheus 接入不是「程式可以輸出 `/metrics`」就完成，而是同時滿足：

1. 應用能輸出語義清楚、低 cardinality、失敗安全的 metrics。
2. Prometheus 能穩定發現並 scrape target。
3. Grafana 能用這些 metrics 快速判斷與調查。
4. Alert rules 能識別異常、stale、no-data 與 recovery。
5. 通知平台能把 firing / resolved 送到正確 owner。
6. 故障注入證明整條鏈路真的有效。
7. 舊 direct notification 被安全移除，沒有重複通知或通知空窗。

達到以上條件後，新服務才算真正接入 Prometheus，而不是只有一個可以被打開的 metrics 頁面。
