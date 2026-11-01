---
title: "Kubernetes"
---

[k8s](https://blog.walle4561.com/topics/os-networking/#K8s)

**Kubernetes（k8s）是一個 container 編排（orchestration）平台：你宣告「想要的狀態」，它負責讓叢集一直維持在那個狀態。** 例如「這個服務要跑 3 個副本、每個最多用 512Mi 記憶體」，某台機器掛了、某個 container 當掉，k8s 會自動在別處補回來，不需要人半夜起床重開。

> k8s 的名字來自 Kubernetes 中間的 8 個字母。Container 本身是什麼，見 [Namespace & cgroup](/os/linux/namespace-cgroup)；入門介紹見 [Kubernetes](/container/k8s)。

## 宣告式與 reconcile loop

傳統部署是**命令式**的：「登入 A 機器、停掉舊版、啟動新版」。k8s 是**宣告式**的：你只寫 YAML 描述最終狀態，交給 controller 去比對、修正。

```text
   你：kubectl apply -f deploy.yaml（期望：3 個 Pod）
                    │
                    ▼
┌──────────── reconcile loop ────────────┐
│  觀察現況 → 和期望比較 → 採取動作       │
│  （現在 2 個）  （差 1 個）  （再建 1 個） │
└────────────────────────────────────────┘
```

所以手動 `kubectl delete pod` 刪掉一個 Pod，馬上又會長回來；要真的縮減，得改期望狀態（`replicas`）。這也是 GitOps 的基礎：把 YAML 放進 Git，Git 就是唯一的真相來源。

## 架構

```text
┌─────────────── Control Plane ───────────────┐
│ kube-apiserver   所有操作的唯一入口           │
│ etcd             存放叢集狀態的 key-value DB  │
│ kube-scheduler   決定 Pod 要放到哪個 Node     │
│ controller-manager  跑各種 reconcile loop     │
└──────────────────────┬──────────────────────┘
                       │
      ┌────────────────┼────────────────┐
      ▼                ▼                ▼
┌─── Node ───┐   ┌─── Node ───┐   ┌─── Node ───┐
│ kubelet    │   │ kubelet    │   │ kubelet    │  ← 負責在本機把 Pod 跑起來
│ kube-proxy │   │ kube-proxy │   │ kube-proxy │  ← 維護 Service 的轉發規則
│ containerd │   │ containerd │   │ containerd │  ← container runtime
│  [Pod][Pod]│   │  [Pod]     │   │ [Pod][Pod] │
└────────────┘   └────────────┘   └────────────┘
```

用 EKS、GKE、AKS 等 managed k8s 時，control plane 由雲端廠商維護（包含 etcd 備份和[上 patch](/devops/patch)），你只需要管 Node 和上面的 workload。

## 核心物件

| 物件 | 作用 | 類比 |
| --- | --- | --- |
| **Pod** | 最小的部署單位，一或多個 container 共用網路和 volume | 一台很小的機器 |
| **Deployment** | 管理無狀態服務的 Pod 副本數與滾動更新 | 一組可替換的機器 |
| **StatefulSet** | 有固定名稱與專屬儲存的 Pod，如資料庫 | 有編號、不可隨意替換的機器 |
| **DaemonSet** | 每個 Node 跑一份，如 log agent、node exporter | 每台機器都要裝的 agent |
| **Job / CronJob** | 跑完就結束的工作 / 排程工作 | 批次腳本 / crontab |
| **Service** | 給一組 Pod 一個穩定的 IP 與 DNS 名稱 | 內部 load balancer |
| **Ingress / Gateway** | 從叢集外把 HTTP 流量導到 Service | 反向代理（見 [Proxy](/backend/proxy)） |
| **ConfigMap / Secret** | 設定檔與敏感資訊，以環境變數或檔案注入 | `.env` |
| **PersistentVolume(Claim)** | 不隨 Pod 消失的儲存空間 | 外接硬碟 |
| **Namespace** | 叢集內的邏輯分區，用來隔離團隊或環境 | 資料夾 |

> k8s 的 Namespace 只是名稱與權限上的分區，和 Linux kernel 的 namespace 是不同的東西。

Pod 是**可拋棄的**：IP 每次重建都會變，所以服務之間永遠透過 Service 名稱溝通（例如 `http://order-svc.shop.svc.cluster.local`），而不是 Pod IP。

## 一個典型的 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-api
spec:
  replicas: 3
  selector:
    matchLabels: { app: order-api }
  strategy:
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }   # 先多開一個新的，再關一個舊的
  template:
    metadata:
      labels: { app: order-api }
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: app
          image: registry.example.com/order-api:1.4.2   # 不要用 latest
          ports: [{ containerPort: 8080 }]
          resources:
            requests: { cpu: 250m, memory: 256Mi }      # 排程依據
            limits: { memory: 512Mi }                   # 超過就 OOMKilled
          readinessProbe:                               # 準備好才接流量
            httpGet: { path: /readyz, port: 8080 }
          livenessProbe:                                # 卡死就重啟
            httpGet: { path: /healthz, port: 8080 }
            initialDelaySeconds: 10
          envFrom:
            - configMapRef: { name: order-api-config }
            - secretRef: { name: order-api-secret }
---
apiVersion: v1
kind: Service
metadata:
  name: order-api
spec:
  selector: { app: order-api }    # 用 label 找到上面的 Pod
  ports: [{ port: 80, targetPort: 8080 }]
```

幾個維運上最容易出事的欄位：

- **Probe**：readiness 失敗只會把 Pod 從 Service 拿掉，liveness 失敗會**重啟 container**。liveness 不要檢查資料庫等外部相依，否則 DB 一慢，全部 Pod 一起被重啟，問題反而擴大。啟動很慢的服務另外加 `startupProbe`。
- **Resources**：沒設 request，scheduler 不知道 Pod 要多少資源，會把 Node 塞爆；CPU limit 會造成 throttling。細節見 [對應到 Kubernetes](/os/linux/namespace-cgroup#對應到-kubernetes)。
- **Graceful shutdown**：滾動更新時舊 Pod 會收到 `SIGTERM`，程式要處理它並在 `terminationGracePeriodSeconds` 內結束，否則進行中的請求會被砍掉。見 [systemd & signal](/os/linux/systemd)。
- **Image tag**：用 `latest` 會讓你無法確定線上跑的是哪一版，也無法 rollback；用版本號或 commit SHA。

## 部署與發布

| 策略 | 做法 | 適合 |
| --- | --- | --- |
| Rolling update | Deployment 預設，逐批替換 Pod | 大部分無狀態服務 |
| Recreate | 先全部關掉再開新版 | 新舊版不能並存（如 schema 不相容） |
| Blue-green | 兩套環境，切換 Service 的 selector | 需要瞬間切換與快速回退 |
| Canary | 先導一小部分流量到新版 | 高風險變更，搭配監控逐步放量 |

Blue-green 和 canary 不是 Deployment 內建的，通常要靠 Argo Rollouts、Flagger 或 service mesh。

實務上不會每份 YAML 都手寫：

- **Helm**：YAML 的模板與套件管理，用 values 檔區分 dev / staging / prod。
- **Kustomize**：不用模板，以 base + overlay 的方式疊加差異，`kubectl` 內建支援。
- **GitOps（Argo CD、Flux）**：CI 只負責 build image、更新 Git 裡的 tag，叢集裡的 agent 偵測到變更後自己 sync。好處是叢集狀態可追溯，也不需要把叢集的權限交給 CI。見 [CI/CD](/devops/ci-cd)。

## 擴展

- **HPA（Horizontal Pod Autoscaler）**：依 CPU、記憶體或自訂 metric 調整 Pod 數量。HPA 的 CPU 使用率是相對於 **request** 計算的，所以 request 要設得合理。
- **VPA**：自動調整 request / limit，適合不知道該設多少的時候先觀察。
- **Cluster Autoscaler / Karpenter**：Pod 因資源不足排不上去時，自動加 Node；Node 閒置時縮減。
- **PodDisruptionBudget**：限制同時被主動驅逐的 Pod 數，避免 Node 升級或縮減時服務整個不見。

## 常用 kubectl 指令

```bash
kubectl get pods -n shop -o wide              # 列出 Pod，含所在 Node 和 IP
kubectl describe pod <pod> -n shop            # 看 events，排查問題的第一步
kubectl logs <pod> -c app --previous          # 看上一個（已崩潰的）container 的 log
kubectl exec -it <pod> -- sh                  # 進入 container
kubectl debug -it <pod> --image=busybox       # image 裡沒工具時，掛一個除錯用 container
kubectl port-forward svc/order-api 8080:80    # 把 Service 轉到本機測試
kubectl rollout status deploy/order-api       # 看滾動更新進度
kubectl rollout undo deploy/order-api         # 回到上一版
kubectl top pod -n shop                       # 看資源用量（需要 metrics-server）
kubectl get events -n shop --sort-by=.lastTimestamp
```

## 常見問題排查

| 狀態 | 意思 | 常見原因 |
| --- | --- | --- |
| `Pending` | 排不上任何 Node | 資源不夠、request 設太大、nodeSelector / taint 不符、PVC 綁不上 |
| `ImagePullBackOff` | 拉不到 image | tag 打錯、私有 registry 沒設 `imagePullSecrets` |
| `CrashLoopBackOff` | container 啟動後一直退出，k8s 重啟間隔越拉越長 | 程式錯誤、缺設定或環境變數、liveness 太嚴格 |
| `OOMKilled` | 超過 memory limit 被 kernel 殺掉（exit code 137） | memory leak、limit 太小。見 [Memory](/os/memory) |
| `Running` 但沒流量 | readiness 沒過，或 Service selector 對不上 label | `kubectl get endpoints <svc>` 看有沒有 Pod |
| `Evicted` | Node 資源（記憶體、磁碟）吃緊，Pod 被趕走 | 沒設 request、log 或暫存檔塞滿磁碟 |

排查順序通常是：`kubectl get` 看狀態 → `kubectl describe` 看 events → `kubectl logs --previous` 看崩潰前的輸出 → 再看監控（見 [Monitoring](/devops/monitoring)）。

## 維運上的挑戰

- **升級**：k8s 每年大約發布三個 minor 版本，每版只支援約一年，必須持續升級，而且 API 會被淘汰（如舊版 `Ingress` 的 `extensions/v1beta1`），升級前要先檢查 manifest。
- **權限**：用 RBAC 控制誰能對哪個 Namespace 做什麼；Pod 也要有自己的 ServiceAccount，權限給到最小。
- **Secret 不等於加密**：Secret 預設只是 base64 存在 etcd，要開 etcd encryption，或改用 External Secrets、Vault、Sealed Secrets。
- **成本**：request 設太大會浪費 Node，設太小會被 OOM 或擠壓；需要定期依實際用量調整。
- **複雜度**：小團隊、少量服務時，k8s 的學習與維護成本可能大於收益；Cloud Run、ECS、Fly.io 等託管方案也值得考慮。見 [Cloud](/container/cloud)。

## 延伸閱讀

- [Kubernetes Documentation: Concepts](https://kubernetes.io/docs/concepts/)
- [Kubernetes: Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Kubernetes: Debug Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/)
- [Monitoring](/devops/monitoring)：Prometheus 在 Kubernetes 上的 target 發現與告警。
