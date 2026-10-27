---
title: "systemd 與 Signal"
---

**開機時 kernel 啟動的第一個 user space process（PID 1）是 init 系統，負責啟動其他所有服務。** 現在主流發行版的 init 都是 **systemd**，它也負責管理服務的重啟、log、資源限制。

## Signal

Signal 是 kernel 送給 process 的通知，只帶一個編號。Process 可以為大部分 signal 註冊處理函式（handler），或忽略它。

| Signal | 編號 | 預設行為 | 常見來源 / 用途 |
| --- | --- | --- | --- |
| `SIGHUP` | 1 | 結束 | 終端機斷線；很多 daemon 拿來**重新載入設定**（`nginx -s reload`） |
| `SIGINT` | 2 | 結束 | 按 `Ctrl+C` |
| `SIGQUIT` | 3 | 結束並產生 core dump | 按 `Ctrl+\`；Go 程式收到會印出所有 goroutine 的 stack |
| `SIGKILL` | 9 | 結束 | **不能攔截、不能忽略**，kernel 直接殺掉；OOM killer 也用它 |
| `SIGSEGV` | 11 | 結束並產生 core dump | 存取非法記憶體 |
| `SIGPIPE` | 13 | 結束 | 寫入一個對方已關閉的 pipe / socket |
| `SIGTERM` | 15 | 結束 | `kill` 的預設；`docker stop`、Kubernetes 停 Pod 時送的 |
| `SIGCHLD` | 17 | 忽略 | 子 process 結束，父 process 應該 `wait()` 回收 |
| `SIGSTOP` / `SIGCONT` | 19 / 18 | 暫停 / 繼續 | 不能攔截；`Ctrl+Z` 送的是可攔截的 `SIGTSTP` |
| `SIGUSR1` / `SIGUSR2` | 10 / 12 | 結束 | 自訂用途，例如重新開啟 log 檔 |

### Graceful Shutdown

服務收到 `SIGTERM` 時應該：停止接新請求 → 等進行中的請求處理完 → 關閉資料庫連線等資源 → 結束。

```go
ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
defer stop()

go srv.ListenAndServe()

<-ctx.Done()                                  // 等到收到 signal
shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
srv.Shutdown(shutdownCtx)                     // 停止接新連線，等進行中的請求結束
```

Kubernetes 停 Pod 的流程：送 `SIGTERM` → 等 `terminationGracePeriodSeconds`（預設 30 秒）→ 還沒結束就送 `SIGKILL`。所以 shutdown 要在期限內完成。

### Container 的 PID 1 問題

在 container 裡，你的程式就是 PID 1，而 kernel 對 PID 1 有特殊規則：**沒有註冊 handler 的 signal 會被忽略**，連 `SIGTERM` 也是。如果程式沒處理 `SIGTERM`，`docker stop` 只能等 10 秒後 `SIGKILL`。

另一個常見問題是 Dockerfile 用 shell form：

```dockerfile
CMD node server.js            # shell form：PID 1 是 /bin/sh，signal 不會轉給 node
CMD ["node", "server.js"]     # exec form：PID 1 就是 node
```

PID 1 也要負責回收 [zombie](/os/process#zombie-與-orphan)。程式不會做這些事時，用 `docker run --init` 或在 image 裡加 `tini` 當 PID 1。

## systemd

### Unit 與 Service

systemd 管理的單位叫 **unit**，最常用的是 `.service`。設定檔放在 `/etc/systemd/system/`（自己寫的）或 `/lib/systemd/system/`（套件安裝的）。

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My API server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=app
WorkingDirectory=/opt/myapp
EnvironmentFile=/etc/myapp/env
ExecStart=/opt/myapp/server --port 8080
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
MemoryMax=1G

[Install]
WantedBy=multi-user.target
```

- **`After` / `Wants`**：啟動順序與相依。`After` 只管順序，不會自動拉起對方；`Requires` / `Wants` 才會。
- **`Restart=on-failure`**：異常結束時自動重啟。
- **`LimitNOFILE`**：fd 上限，在 shell 裡設的 `ulimit` 對 systemd 服務沒有作用，要在這裡設。
- **`MemoryMax`、`CPUQuota`**：systemd 底層用 [cgroup](/os/linux/namespace-cgroup) 限制資源。
- **`WantedBy=multi-user.target`**：`enable` 之後，開機進入一般多使用者模式時會啟動它。

### 常用指令

```bash
sudo systemctl daemon-reload            # 改了 unit 檔之後要先重新載入
sudo systemctl start myapp
sudo systemctl stop myapp
sudo systemctl restart myapp
sudo systemctl reload nginx             # 重新載入設定（通常送 SIGHUP），不中斷服務
sudo systemctl enable --now myapp       # 設成開機啟動，並且馬上啟動
systemctl status myapp                  # 狀態、PID、最近幾行 log
systemctl list-units --type=service --state=failed
systemctl cat myapp                     # 看實際生效的 unit 內容
sudo systemctl edit myapp               # 用 drop-in 檔覆寫部分設定，不改原檔
```

### journald

systemd 會收集服務寫到 stdout / stderr 的輸出，用 `journalctl` 查詢：

```bash
journalctl -u myapp -f                  # 持續追蹤
journalctl -u myapp --since "2026-10-27 10:00" --until "2026-10-27 11:00"
journalctl -u myapp -n 100 --no-pager
journalctl -b -1                        # 上一次開機的 log（查當機原因）
journalctl --disk-usage
sudo journalctl --vacuum-time=7d        # 刪除 7 天前的 log
```

所以服務直接把 log 寫到 stdout 就好，不必自己管 log 檔與 rotate。這和 container 的做法一致（[Twelve-Factor App: Logs](https://12factor.net/logs)）。

### Timer

systemd timer 可以取代 cron，好處是有 log、可以設相依、錯過的排程可以補跑（`Persistent=true`）。

```ini
# /etc/systemd/system/backup.timer
[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

搭配同名的 `backup.service`，用 `systemctl enable --now backup.timer` 啟用，`systemctl list-timers` 查看。

## Reference

- [signal(7) — Linux manual page](https://man7.org/linux/man-pages/man7/signal.7.html)
- [systemd.service — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [Kubernetes: Pod Lifecycle - Termination of Pods](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)
- [krallin/tini](https://github.com/krallin/tini)
