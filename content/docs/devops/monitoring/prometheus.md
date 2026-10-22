---
title: "Prometheus 與 Metric 設計"
---

## Prometheus 是什麼

Prometheus 是一套以 time series 為核心的監控系統。每筆資料由三部分構成：

```text
metric name + labels + timestamped value
```

例如：

```text
order_worker_pending_jobs{service="order-worker",queue="settlement"} 12
```

意思是：`order-worker` 的 `settlement` queue 目前有 12 個 pending jobs。

### Pull model

常見做法不是應用主動把資料送到 Prometheus，而是：

1. 應用開一個 `/metrics` HTTP endpoint。
2. Prometheus 每隔一段時間，例如 30 秒，來抓取一次（稱為 **scrape**）。
3. 每次抓到的數值形成 time series。

如果 Prometheus 能成功抓取 target，會產生：

```text
up{job="my-service"} == 1
```

但 `up = 1` 只代表 `/metrics` 可被抓到，不代表所有業務檢查都正常。因此服務還需要輸出業務狀態及資料新鮮度。

## 四種常見 metric type

### Gauge

可以上升也可以下降，表示「目前狀態」。適合 queue depth、balance、temperature、active connections、oldest pending age、consecutive failures。

```text
worker_pending_jobs 12
worker_pending_jobs 7
worker_pending_jobs 0
```

### Counter

只能累加；process restart 後可以歸零。適合 requests total、processed jobs total、errors total。通常用 `rate()` 或 `increase()` 查詢：

```text
rate(http_requests_total[5m])
increase(job_failures_total[1h])
```

不要在每次 scanner 重掃同一批資料時都增加 Counter，否則同一事件會被重複計數。若無法清楚定義 checkpoint、去重及 restart 行為，先用 Gauge 表達目前掃描結果。

### Histogram

把觀測值放進 buckets，適合 latency、payload size 等分布。例如計算 P95 latency：

```text
histogram_quantile(
  0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)
```

### Summary

也用於分布，但 quantile 通常在 client 端計算，跨 instance 聚合較困難。大部分服務應優先使用 Histogram。

## 先做告警盤點

不要先寫 metrics，再猜它能不能取代舊告警。先列出完整映射：

```text
舊告警觸發條件
→ 需要觀測的客觀數值
→ metric name / labels / unit
→ PromQL rule
→ threshold / for
→ resolved 條件
→ owner / runbook
```

範例：

```text
舊功能：queue 中有 job 超過 5 分鐘便發 Slack

Metric:
worker_pending_jobs_over_age{queue="settlement",age_seconds="300"}

Rule:
worker_pending_jobs_over_age{age_seconds="300"} > 0

Resolved:
值回到 0，且資料仍是新鮮的
```

特別盤點以下情況：

- workload / Pod 不存在
- `/metrics` 無法 scrape
- process 還活著，但背景工作已停止
- 外部 RPC、database 或 API 持續失敗
- queue backlog / latency
- 餘額或容量不足
- 業務處理失敗
- 資料來源失效，導致應用無法計算某個 metric

## 設計 metric contract

Metric 是應用與監控平台之間的 API。應先寫文件，再實作。

### Naming

統一使用服務 prefix 與 base unit：

```text
my_service_pending_jobs
my_service_oldest_pending_age_seconds
my_service_last_success_timestamp_seconds
my_service_dependency_failures_total
my_service_request_duration_seconds
```

常見 suffix：

| Suffix | 意義 |
| --- | --- |
| `_total` | Counter |
| `_seconds` | 秒 |
| `_bytes` | bytes |
| `_timestamp_seconds` | Unix timestamp |
| `_info` | 固定 metadata，應謹慎使用 |

### Labels

Labels 用於切分**有限**的維度：

```text
{environment="staging",queue="settlement",dependency="database"}
```

- **可以使用**：environment、region、operation、queue、dependency 類別、有限集合的 status / reason class。
- **不要使用**：user ID、wallet address、transaction hash、request ID、message ID、raw error text、URL、block number、timestamp。

每一種不同的 label combination 都會建立一條 time series。無界 labels 會造成 cardinality 爆炸，使 Prometheus 變慢、記憶體增加甚至不可用。高維度調查資料應放在 structured logs，而不是 metrics。

### 單位與語義

每個 metric 必須說清楚：

- type：Gauge / Counter / Histogram
- unit：seconds、bytes、native token 等
- 更新頻率
- 成功時如何更新
- 失敗時如何處理
- 啟動但從未成功觀測時如何表示
- process restart 後的行為
- 多 instance 時如何聚合

### 健康零值、未知與過期不是同一件事

假設 RPC 失敗，scanner 無法取得 queue 狀態。錯誤做法是寫入 `pending_jobs = 0`，這會把「不知道」偽裝成「健康」。

較安全的做法：

- 保留最後一次成功取得的 Gauge 值。
- 不更新 `last_success_timestamp_seconds`。
- 另外更新 dependency failure 狀態。
- Alert rule 同時檢查數值與 freshness。

若服務啟動後從未成功觀測，該 series 可以不存在，但 rules 必須處理 no-data。

## 應用端實作

以下以 Node.js / TypeScript 與 `prom-client` 示意；其他語言使用官方或成熟 client library，概念相同。

### 使用單一 Registry

```typescript
import { Gauge, Registry } from "prom-client";

const registry = new Registry();

const pendingJobs = new Gauge({
  name: "my_service_pending_jobs",
  help: "Current number of pending jobs after a successful scan.",
  labelNames: ["queue"],
  registers: [registry],
});

const lastSuccess = new Gauge({
  name: "my_service_last_success_timestamp_seconds",
  help: "Unix time of the last complete successful check.",
  labelNames: ["check"],
  registers: [registry],
});
```

不要讓每個 scanner 建立自己的 Registry 或重複註冊相同 metric。

### 只在完整成功後更新狀態

```typescript
async function scanQueue(): Promise<void> {
  const jobs = await loadPendingJobs();

  // 所有必要讀取都成功後，才更新健康狀態。
  pendingJobs.set({ queue: "settlement" }, jobs.length);
  lastSuccess.set({ check: "queue_scan" }, Date.now() / 1000);
}
```

錯誤處理時保留上次 Gauge，讓 freshness 自然過期：

```typescript
try {
  await scanQueue();
} catch (error) {
  logger.error({ errorClass: classify(error) }, "queue scan failed");
  // 不把 pendingJobs 設成 0，也不刷新 lastSuccess。
}
```

### 提供 `/metrics`

```typescript
import { createServer } from "node:http";

const host = process.env.METRICS_HOST ?? "127.0.0.1";
const port = Number(process.env.METRICS_PORT ?? "9464");

const server = createServer(async (req, res) => {
  if (req.method !== "GET" || req.url !== "/metrics") {
    res.writeHead(404).end();
    return;
  }

  res.writeHead(200, { "Content-Type": registry.contentType });
  res.end(await registry.metrics());
});

server.listen(port, host);
```

注意事項：

- 預設綁 loopback 是安全的本機設定。
- Kubernetes 由 Pod 外 scrape 時，需要綁 private interface，例如 `0.0.0.0`。
- `/metrics` 通常沒有 authentication，不應直接公開到 Internet。
- graceful shutdown 時關閉 metrics server。
- `/metrics` 不應執行昂貴查詢；它只輸出記憶體內最新值。

### 不要把業務 scanner 與 Prometheus library 綁死

可以建立一個小型 metrics adapter：

```typescript
interface ServiceMetrics {
  queueScanSucceeded(queue: string, pending: number): void;
  dependencyFailure(dependency: string): void;
}
```

這樣 scanner 表達業務事件，adapter 負責更新 metric。不要一開始就建立龐大的 telemetry framework；小而清楚的 module 通常足夠。

## 應用端測試

至少測試：

1. `/metrics` 回傳 HTTP 200 與正確 Content-Type。
2. 成功掃描後 metric 值正確。
3. 健康狀態能從非零回到零。
4. 掃描失敗時不會把舊值誤設為零。
5. 掃描失敗時不刷新 last-success。
6. 啟動但未完成首次掃描時，不會宣稱健康。
7. Counter 不會因重掃同一事件而重複增加。
8. 多 route、queue 或 dependency 的 labels 不互相污染。
9. Registry 不重複註冊。
10. shutdown 能關閉 server。

範例測試思路：

```typescript
it("does not report a healthy zero when the scan fails", async () => {
  metrics.queueScanSucceeded("settlement", 12);

  await expect(runFailingScan()).rejects.toThrow();

  const output = await registry.metrics();
  expect(output).toContain("my_service_pending_jobs{queue=\"settlement\"} 12");
});
```

## 常見錯誤（應用端）

- **只檢查 `up`**：`up = 1` 但內部 scanner 可能已死。增加 per-check last-success。
- **RPC 失敗時寫零**：把未知偽裝成健康。保留舊值並讓 freshness 過期。
- **把 severity 放進應用 metric**：threshold 改變就要重新部署應用。輸出原始值，由 rules 分級。
- **用 ID、地址或 error message 當 label**：造成高 cardinality 或敏感資料外洩。詳細資料放 logs。
- **把 scanner 次數當事件次數**：重掃會重複計數。先定義 checkpoint 與去重，否則使用 snapshot Gauge。
- **把 Prometheus 當精確事件帳本**：scrape 之間發生又消失的事件可能看不到；Counter reset 與 retention 也會影響統計。資金、交易或合規事件若要求一次都不能漏，需要持久化事件系統。

接下來的平台對接、alert rules 與遷移流程見 [新服務接入 Prometheus](/devops/monitoring/onboarding)。
