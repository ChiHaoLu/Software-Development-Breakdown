---
title: "常用指令與除錯"
---

**伺服器出問題時，通常照「CPU → 記憶體 → 磁碟 → 網路 → 程式本身」的順序找。** 這頁依照這個順序整理指令。

## 60 秒快速檢查

登入一台有問題的機器，先跑這幾個（整理自 Brendan Gregg 的 *Linux Performance Analysis in 60,000 Milliseconds*）：

```bash
uptime              # load average：1、5、15 分鐘的平均負載
dmesg -T | tail     # kernel 訊息：OOM killer、磁碟錯誤、網卡問題
vmstat 1            # 每秒一次：r（等 CPU 的 task 數）、si/so（swap）、wa（等 I/O）
mpstat -P ALL 1     # 每顆 CPU 的使用率，看是不是只有一顆被打滿
pidstat 1           # 哪個 process 在吃 CPU
iostat -xz 1        # 磁碟：%util、await（平均等待時間）
free -h             # 記憶體，看 available
sar -n DEV 1        # 網卡流量
sar -n TCP,ETCP 1   # TCP 連線數、重傳
top                 # 綜合
```

`mpstat`、`pidstat`、`iostat`、`sar` 在 `sysstat` 套件裡。

**Load average** 是「正在跑 + 等著跑 + 在 `D` 狀態等 I/O」的 task 平均數量。要和 CPU 核心數（`nproc`）比較：4 核心的機器 load 4 代表剛好滿載。Linux 的 load 包含等 I/O 的 task，所以 load 高不一定是 CPU 不夠。

## CPU 與 Process

```bash
top                       # 按 1 看每顆 CPU，按 M 依記憶體排序，按 P 依 CPU 排序
htop                      # 比 top 好看好用
ps aux --sort=-%cpu | head
ps -ef --forest           # 樹狀顯示父子關係
ps -eLf | grep <pid>      # 看某個 process 的所有 thread
pgrep -a nginx            # 用名稱找 PID
kill <pid>                # 送 SIGTERM，讓它優雅結束
kill -9 <pid>             # 送 SIGKILL，強制殺掉（最後手段）
```

`top` 的 CPU 欄位：

| 欄位 | 意思 | 高的時候 |
| --- | --- | --- |
| `us` | user space | 程式本身在算東西 |
| `sy` | kernel | system call 太多、context switch 太頻繁 |
| `wa` | 等 I/O | 磁碟太慢 |
| `st` | 被 hypervisor 偷走 | 雲端主機的鄰居在搶資源 |
| `si` | 處理軟中斷 | 網路流量大 |

## 記憶體

```bash
free -h
ps aux --sort=-rss | head        # 依實體記憶體用量排序
cat /proc/<pid>/status | grep -E "VmRSS|Threads"
dmesg -T | grep -i oom           # 有沒有被 OOM killer 殺過
```

各欄位的意思見 [Memory](/os/memory#看記憶體用量)。

## 磁碟

```bash
df -h                          # 每個檔案系統的使用量
df -i                          # inode 使用量
du -sh * | sort -h             # 目前目錄下每個項目的大小
du -h --max-depth=1 /var | sort -h
ncdu /                         # 互動式找出大檔案
lsof +L1                       # 已刪除但還被開著的檔案（空間沒釋放的元凶）
iostat -xz 1                   # 磁碟延遲與使用率
iotop                          # 哪個 process 在大量讀寫
```

## 網路

```bash
ip addr                        # 網卡與 IP（取代 ifconfig）
ip route                       # 路由表
ss -tlnp                       # 有哪些 TCP port 在 listen，以及是哪個 process（取代 netstat）
ss -tanp state established     # 已建立的連線
ss -s                          # 各狀態連線數量摘要
lsof -i :8080                  # 誰在用 8080 port
curl -v http://localhost:8080/health
curl -w "%{time_connect} %{time_starttransfer} %{time_total}\n" -o /dev/null -s https://example.com
dig api.example.com            # DNS 查詢
nc -zv db.internal 5432        # 測試 port 通不通
mtr example.com                # 看封包經過哪些節點、哪裡掉包（traceroute + ping）
tcpdump -i any port 5432 -nn   # 抓封包
```

常見情況：

- **`Address already in use`**：`ss -tlnp | grep :8080` 找出佔用的 process。
- **大量 `TIME_WAIT`**：主動關閉連線的一方會進入 `TIME_WAIT`，短連線太多時會出現。通常該改用連線池或 keep-alive。
- **大量 `CLOSE_WAIT`**：對方已經關閉，但我方程式沒有 `close()`，通常是程式 bug（例如 HTTP response body 沒關）。
- **連不上**：依序檢查 DNS（`dig`）、port 通不通（`nc`）、防火牆（`iptables -L`、`nft list ruleset`、雲端的 security group）、服務有沒有在 listen（`ss`），以及是不是只 listen 在 `127.0.0.1`。

## 程式在做什麼

```bash
strace -p <pid>                    # 看 process 正在呼叫哪些 system call
strace -f -e trace=network ./app   # 只看網路相關，-f 包含子 process
strace -c -p <pid>                 # 統計各 system call 的次數與時間
lsof -p <pid>                      # 開了哪些檔案、socket
ltrace ./app                       # 看呼叫了哪些 library 函式
perf top                           # 即時看哪些函式最耗 CPU
gdb -p <pid>                       # 附加 debugger
```

程式卡住沒反應時，`strace -p` 通常一眼就能看出它卡在哪個 system call（等鎖、等網路、等磁碟）。Go 程式則可以用 `pprof` 看 goroutine 和 CPU profile。

## Log

```bash
journalctl -u nginx -f             # 追蹤某個 systemd 服務的 log
journalctl -u nginx --since "1 hour ago"
journalctl -p err -b               # 本次開機以來的錯誤
tail -f /var/log/syslog            # Debian / Ubuntu 的系統 log
tail -f /var/log/messages          # RHEL 系的系統 log
```

更多 systemd 相關見 [systemd 與 Signal](/os/linux/systemd)。

## 其他常用

```bash
watch -n 1 'ss -s'                 # 每秒重跑一次指令
time ./script.sh                   # 計算執行時間
nohup ./job.sh > job.log 2>&1 &    # 登出後繼續執行
tmux                               # 終端機多工，斷線也不會中斷工作
crontab -e                         # 排程，格式：分 時 日 月 星期 指令
sysctl -a | grep somaxconn         # 查看 kernel 參數
ulimit -a                          # 目前 shell 的資源上限
```

## Reference

- [Linux Performance Analysis in 60,000 Milliseconds](https://netflixtechblog.com/linux-performance-analysis-in-60-000-milliseconds-accc10403c55)
- [Brendan Gregg: Linux Performance](https://www.brendangregg.com/linuxperf.html)
- [Julia Evans: Wizard Zines](https://wizardzines.com/)
