---
title: "新服務接入 Prometheus"
---

應用端完成 `/metrics` 之後（見 [Prometheus 與 Metric 設計](/devops/monitoring/prometheus)），還需要與 SRE 對接、驗證資料與告警，最後安全移除應用內直接發 Slack 的通知程式。

## 部署層與 SRE 對接

應用完成 `/metrics` 不代表 Prometheus 已接上。SRE 還需要讓 Prometheus 發現並存取 target。Kubernetes 常見需要：

1. Container 暴露 named metrics port。
2. Service 指向該 port。
3. ServiceMonitor / PodMonitor，或公司既有的 discovery annotation。
4. Prometheus selector 能選到它。
5. NetworkPolicy 允許監控系統存取。

概念示例：

```yaml
ports:
  - name: metrics
    containerPort: 9464
```

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-service
spec:
  selector:
    matchLabels:
      app: my-service
  endpoints:
    - port: metrics
      path: /metrics
      interval: 30s
      scrapeTimeout: 10s
```

實際格式應沿用公司的基礎設施模板，不要自行平行建立另一套 discovery 方法。

### SWE 交給 SRE 的資料

- 環境與 service / namespace 名稱
- metrics port 與 path
- 建議 scrape interval / timeout
- metric contract 文件
- 預期 route / queue / dependency 清單
- dashboard 需求
- 完整舊告警映射
- threshold、`for`、severity 建議
- Slack receiver / owner / runbook
- staging 驗證方式

### SRE 需要回覆的資料

- Prometheus datasource / cluster
- discovery 方式與配置所在 repo
- alert engine：Prometheus rules 或 Grafana-managed alerts
- rules 的 Git ownership 與部署流程
- notification receiver 與 routing 規則
- workload / Pod / scrape 的外部監控方式
- logs 與 dashboard 的標準位置

只選一套正式 alert rule engine，避免同時維護 Prometheus rules 與 Grafana-managed rules，造成重複通知與設定漂移。

## 驗證 Prometheus 是否真的接上

### Target 可用

```text
up{job="my-service-staging"}
```

預期值：`1`。查看最近 30 分鐘是否曾中斷：

```text
min_over_time(up{job="my-service-staging"}[30m])
```

預期值：`1`。

### Metric 已被採集

```text
{job="my-service-staging",__name__=~"my_service_.*"}
```

確認：

- 預期 metric 都出現。
- labels 與文件一致。
- 沒有 secrets 或無界值。
- 每個預期 instance / queue / dependency 都存在。

### 資料新鮮度

```text
time() - my_service_last_success_timestamp_seconds{job="my-service-staging"}
```

如果背景工作每 60 秒執行一次，值應大致週期性回到 0–60 秒；若持續增加，代表 process 可能還活著，但該工作已停滯。

### 重啟與失敗行為

- Pod restart 後 series 能重新建立。
- 未完成首次成功掃描前，不顯示健康零值。
- dependency failure 時 last-success 會過期。
- 恢復後 freshness 與狀態能恢復。
- Gauge 不會因抓取失敗而歸零。
- Counter reset 不會造成錯誤告警。

## 建立 Grafana dashboard

Dashboard 的角色是回答：

1. 服務現在可被監控嗎？
2. 哪個內部檢查已經 stale？
3. 業務狀態目前是多少？
4. 告警發生前後，數值如何變化？

第一版建議 panels：

- Target up / scrape health
- Workload / replicas / restarts
- 各背景 check freshness
- 核心 Gauge，例如 queue depth、balance、capacity
- Error / failure rate
- Dependency failures
- Latency Histogram
- 目前 firing alerts

先建立能支援判斷與調查的最小 dashboard，不必在第一版追求完整 BI 或漂亮排版。

Dashboard 不等於告警。Grafana 看得到數值，不表示系統會在異常時通知人。

## 建立 alert rules

### Target down

```yaml
- alert: MyServiceTargetDown
  expr: up{job="my-service-production"} == 0
  for: 2m
  labels:
    severity: critical
    service: my-service
  annotations:
    summary: "my-service Prometheus target is down"
    description: "Prometheus has been unable to scrape the target for 2 minutes."
```

只寫 `up == 0` 不夠。如果預期 target 完全消失，可能沒有任何 series 可供比較。需要由平台依預期 workload 建立 absent / Kubernetes workload rules。

### 背景工作 stale

```yaml
- alert: MyServiceQueueScanStale
  expr: |
    time() - my_service_last_success_timestamp_seconds{
      job="my-service-production",
      check="queue_scan"
    } > 180
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Queue scan has stopped updating"
```

### Queue backlog

```yaml
- alert: MyServiceQueueBacklog
  expr: my_service_pending_jobs{job="my-service-production"} >= 10
  for: 5m
  labels:
    severity: warning
```

### Error rate

```yaml
- alert: MyServiceHighErrorRate
  expr: |
    sum(rate(my_service_requests_total{status="error"}[5m]))
    /
    clamp_min(sum(rate(my_service_requests_total[5m])), 1)
    > 0.05
  for: 10m
  labels:
    severity: warning
```

### Rule 設計原則

- threshold、severity 與 `for` 放在 rules，不放在應用 labels。
- 同時檢查值與 freshness。
- 為 no-data、target missing、workload missing 設計獨立檢測。
- 明確定義 resolved 條件。
- 告警內容包含影響、owner、處理動作、dashboard、logs / runbook。
- 用有限的服務維度分組，不要逐 transaction 或 request 發告警。
- `for` 用來避免瞬間抖動，但不能掩蓋真正需要立即處理的事件。

## Alertmanager / Grafana Alerting 做什麼

Rule engine 判定異常後，通知平台負責：

- **grouping**：把同類告警合併。
- **deduplication**：避免相同告警重複轟炸。
- **routing**：送到正確 Slack channel / Pager。
- **silencing**：維護期間暫停通知。
- **repeat interval**：控制持續異常的提醒頻率。
- **resolved notification**：恢復時通知。

因此，不應在應用內繼續維護 Slack cooldown、thread ID、severity routing 或重試狀態。

但要注意：

- 通知 API 成功只代表 Slack integration 接受請求，不代表有人已讀。
- repeat notification 不等於新的 incident。
- Prometheus time series 不是精確的事故事件帳本。
- 若要準確統計 incident 數量與持續時間，需要明確的 alert history / incident store。

## 從 direct Slack 安全遷移

不要在 `/metrics` 第一次出現資料後立刻刪除 Slack bot。安全順序如下：

```text
1. 應用加入 metrics，保留舊 Slack
2. Prometheus 完成 scrape
3. 建立 dashboard
4. 建立 shadow / no-notify rules
5. staging 故障與 recovery 驗證
6. 新規則通知到測試 Slack receiver
7. production 新舊鏈路短期並行比對
8. 確認無漏報、錯報或通知空窗
9. 切換成單一正式通知源
10. 移除應用內 Slack code、token、secret 與通知狀態
```

Shadow 期間要比較：

- 觸發覆蓋是否一致。
- 觸發延遲是否可接受。
- recovery / resolved 是否正確。
- grouping 是否符合操作需求。
- process restart、重掃及 no-data 是否誤報。

保留明確回滾方式，避免切換當下同時失去兩條通知鏈路。

## 驗收方式

不能只看 dashboard 有線就算完成。至少驗證：

### 功能性

- `/metrics` 可從監控網路存取。
- Prometheus `up = 1`。
- 所有預期 metrics 與 labels 可查詢。
- scrape 在觀察窗內穩定。
- dashboard 可呈現核心狀態。

### 故障與恢復

- dependency / RPC failure。
- background task 停止更新。
- queue / latency / balance 跨越 threshold。
- process crash。
- target 或 Pod 消失。
- 資料來源失效造成 metric 缺失。
- 恢復後 rule 進入 resolved。

### 語義

- 失敗不會被寫成健康零值。
- Gauge 能回到零。
- Counter 不因重掃重複計數。
- restart 行為符合文件。
- 無高基數或敏感 labels。
- 每個預期 target / check 都有 no-data / stale 保護。

### 通知

- firing 能送達正確 receiver。
- grouping、repeat、silence、resolved 正常。
- 新規則覆蓋所有舊 direct alerts。
- 舊通知移除後沒有通知空窗。

## 常見錯誤（平台與遷移）

- **Dashboard 完成就刪除舊告警**：Dashboard 不會自動通知。必須先建立 rules、receiver 並驗證 firing / resolved。
- **同時維護兩套正式 rules**：Grafana 與 Prometheus 各寫一份會漂移並重複通知。選用平台既有的一套。
- **只測 firing，不測 recovery**：告警可能永遠不 resolved，或恢復通知遺失。兩個方向都要驗證。

## 新服務接入 Checklist

### 設計

- [ ] 已盤點舊告警與所有觸發分支。
- [ ] 每個告警都有 metric / rule / resolved / owner mapping。
- [ ] 已選擇 Gauge、Counter 或 Histogram。
- [ ] 已定義 unit、更新、失敗、restart、多副本語義。
- [ ] Labels 有界且不含敏感資料。
- [ ] 已設計 per-check freshness 與 no-data。

### 應用

- [ ] 使用單一 Registry。
- [ ] `/metrics` endpoint 已完成。
- [ ] Endpoint 僅供內部監控存取。
- [ ] 完整成功後才更新健康狀態。
- [ ] graceful shutdown 已處理。
- [ ] Metric tests 已涵蓋成功、失敗、歸零、重掃與 restart。

### 平台

- [ ] Service / ServiceMonitor / discovery 已完成。
- [ ] `up = 1` 且 scrape 穩定。
- [ ] 所有預期 series 可查詢。
- [ ] Workload / Pod / target missing 有外部規則。
- [ ] Dashboard 已建立。
- [ ] Alert rules 已版本化並有 owner。
- [ ] Receiver、grouping、repeat、resolved 已配置。

### 遷移

- [ ] Shadow rules 已完成。
- [ ] Staging 故障與恢復已驗證。
- [ ] 新舊告警覆蓋與延遲已比對。
- [ ] Production rollout 與 rollback 已確認。
- [ ] 新正式通知鏈路已驗收。
- [ ] Direct Slack code、token 與 secrets 已移除。
