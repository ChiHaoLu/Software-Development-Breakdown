---
title: "Namespace & cgroup"
---

**Container 不是虛擬機，而是一個被 Linux kernel 限制住的普通 process。** Namespace 決定它**看得到什麼**，cgroup 決定它**能用多少**，再加上 overlayfs 提供檔案系統、seccomp 與 capabilities 限制它能做什麼。

## Container vs. VM

```text
       VM                                  Container
┌────────┬────────┐                ┌────────┬────────┐
│ App A  │ App B  │                │ App A  │ App B  │
├────────┼────────┤                ├────────┴────────┤
│Guest OS│Guest OS│                │  Container      │
├────────┴────────┤                │  Runtime        │
│   Hypervisor    │                ├─────────────────┤
├─────────────────┤                │   Host Kernel   │ ← 共用同一個 kernel
│    Hardware     │                ├─────────────────┤
└─────────────────┘                │    Hardware     │
                                   └─────────────────┘
```

| | VM | Container |
| --- | --- | --- |
| 隔離層級 | 硬體虛擬化，各自有 kernel | 共用 host kernel |
| 啟動時間 | 數十秒 | 毫秒到秒 |
| 大小 | GB 等級 | MB 等級 |
| 安全邊界 | 強 | 較弱，kernel 漏洞可能逃逸 |

因為共用 kernel，Linux container 不能直接跑在 macOS 或 Windows 上：Docker Desktop 其實是先開一台 Linux VM，container 跑在 VM 裡。

需要更強隔離時有折衷方案：gVisor（在 user space 攔截 system call）、Kata Containers、Firecracker（輕量 VM，AWS Lambda 使用）。

## Namespace：看得到什麼

| Namespace | 隔離的東西 | 效果 |
| --- | --- | --- |
| PID | Process ID | container 裡看到自己是 PID 1，看不到 host 的其他 process |
| Network | 網卡、IP、路由表、port | 每個 container 有自己的 `eth0`、可以各自 listen 80 port |
| Mount | 掛載點 | 有自己的根目錄 `/` |
| UTS | hostname | 每個 container 有自己的 hostname |
| IPC | shared memory、message queue | 互相看不到 |
| User | UID / GID | container 裡的 root（UID 0）可以對應到 host 上的一般使用者（rootless container） |
| Cgroup | cgroup 階層 | 看不到 host 的 cgroup 結構 |
| Time | 系統時鐘的偏移 | 較少用 |

```bash
lsns                                   # 列出系統上的 namespace
ls -l /proc/<pid>/ns                   # 某個 process 屬於哪些 namespace
sudo unshare --pid --fork --mount-proc bash   # 開一個新的 PID namespace，裡面 ps 只看得到自己
sudo nsenter -t <pid> -n ip addr       # 進入某個 process 的 network namespace 執行指令
```

`nsenter` 在除錯時很有用：container image 裡沒有 `curl`、`tcpdump` 時，可以從 host 進入它的 network namespace，用 host 上的工具。Kubernetes 也可以用 `kubectl debug` 掛一個除錯用的 container 進去。

Kubernetes 的 Pod 就是**多個 container 共用同一組 network namespace**，所以同一個 Pod 裡的 container 可以用 `localhost` 互連。

## cgroup：能用多少

cgroup（control group）把 process 分組，並限制、統計每組能用的資源。現在主流是 **cgroup v2**，掛載在 `/sys/fs/cgroup`。

| 資源 | cgroup v2 檔案 | 超過時 |
| --- | --- | --- |
| CPU | `cpu.max`（quota 與 period） | 被 **throttle**，暫停到下一個週期 |
| 記憶體 | `memory.max` | 先嘗試回收 page cache，還不夠就 **OOM kill** |
| Process 數 | `pids.max` | `fork` 失敗，防止 fork bomb |
| 磁碟 I/O | `io.max` | 被限速 |

```bash
cat /proc/<pid>/cgroup                       # 這個 process 在哪個 cgroup
cat /sys/fs/cgroup/<path>/memory.max         # 記憶體上限
cat /sys/fs/cgroup/<path>/memory.current     # 目前用量
cat /sys/fs/cgroup/<path>/cpu.stat           # nr_throttled、throttled_usec：被 throttle 的次數與時間
systemd-cgls                                 # 樹狀列出 cgroup
systemd-cgtop                                # 像 top 一樣看各 cgroup 的用量
```

### 對應到 Kubernetes

| Kubernetes 設定 | 對應的 cgroup 行為 |
| --- | --- |
| `resources.requests.cpu` | 排程依據；轉成 `cpu.weight`，CPU 搶不過來時依比例分配 |
| `resources.limits.cpu` | 轉成 `cpu.max`，例如 `500m` = 每 100ms 最多用 50ms |
| `resources.requests.memory` | 排程依據 |
| `resources.limits.memory` | 轉成 `memory.max`，超過就 `OOMKilled` |

- **CPU limit 會造成 throttling**：一個多 thread 的程式可能在 100ms 週期的前 20ms 就用完 quota，剩下 80ms 全部暫停，延遲因此飆高。延遲敏感的服務常只設 request 不設 CPU limit，或至少監控 `cpu.stat` 的 throttle 指標。
- **程式要知道自己在 container 裡**：JVM（8u191 之後）、Go 1.25 之後的 `GOMAXPROCS` 會讀 cgroup 的限制；更舊的版本會以為整台主機的 CPU 和記憶體都能用。見 [Goroutine](/code/language/go/goroutine#不是萬能的)。
- `memory.current` 包含 page cache，大量讀寫檔案的程式看起來會很接近上限，但 page cache 可以被回收，不一定會 OOM。

## 檔案系統：overlayfs

Container image 由多個唯讀的 layer 組成，執行時在最上面加一層可寫的 layer：

```text
┌─────────────────────────┐
│ Container layer（可寫）  │ ← 執行時的修改都在這，container 刪掉就沒了
├─────────────────────────┤
│ Layer 3: COPY app       │
│ Layer 2: RUN apt install│  ← 唯讀，多個 container 共用
│ Layer 1: debian:slim    │
└─────────────────────────┘
          ↓ overlayfs 合併
       container 看到的 /
```

- 改一個底層的檔案時，會先把整個檔案複製到可寫層再改（copy-up），所以大檔案的修改很慢。資料庫等要大量寫入的資料應該放 **volume**，不要寫在 container layer。
- Dockerfile 裡每個指令產生一層，把不常變的指令放前面才能善用 build cache，見 [Docker](/container/docker)。
- 早期 container 用 `chroot` 切換根目錄，現在用更安全的 `pivot_root`。

## 安全限制

只靠 namespace 和 cgroup，container 裡的 root 還是能做很多危險的事，所以還有：

- **Capabilities**：把 root 權限拆成幾十個小項目，Docker 預設只保留一部分（例如移除 `CAP_SYS_ADMIN`）。`--privileged` 會全部給回去，等於幾乎沒有隔離，盡量不要用。
- **seccomp**：限制 container 能呼叫哪些 system call，Docker 預設的 profile 擋掉數十個危險的 system call。
- **AppArmor / SELinux**：限制能存取哪些檔案與資源。
- **Rootless / User namespace**：container 裡的 root 對應到 host 上的一般使用者，逃逸出來也沒有 root 權限。
- **不要掛載 `/var/run/docker.sock` 進 container**：拿到它等於拿到 host 的 root。

## 自己做一個 Container

把上面的東西組合起來，大致就是 container runtime（runc）做的事：

```bash
# 1. 準備根目錄
mkdir rootfs && docker export $(docker create alpine) | tar -C rootfs -xf -

# 2. 開新的 namespace，切換根目錄，執行 shell
sudo unshare --pid --net --mount --uts --ipc --fork \
  chroot rootfs /bin/sh -c "mount -t proc proc /proc && hostname box && exec sh"

# 3. 在另一個終端機用 cgroup 限制它（cgroup v2）
sudo mkdir /sys/fs/cgroup/box
echo "100M" | sudo tee /sys/fs/cgroup/box/memory.max
echo <pid> | sudo tee /sys/fs/cgroup/box/cgroup.procs
```

進去之後 `ps` 只看得到自己、`hostname` 是 `box`，而且最多只能用 100 MB 記憶體。

## 一句話總結

> Container = 普通 process + namespace（看得到什麼）+ cgroup（能用多少）+ overlayfs（檔案系統）+ capabilities / seccomp（能做什麼）。它共用 host kernel，所以比 VM 輕，但隔離也比較弱。Kubernetes 的 resource limit 就是 cgroup，CPU limit 會 throttle，memory limit 會 OOM kill。

## Reference

- [Julia Evans: What even is a container?](https://jvns.ca/blog/2016/10/10/what-even-is-a-container/)
- [Containers From Scratch (Liz Rice)](https://www.youtube.com/watch?v=8fi7uSYlOdc)
- [namespaces(7) — Linux manual page](https://man7.org/linux/man-pages/man7/namespaces.7.html)
- [Control Group v2 — The Linux Kernel documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Kubernetes: Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
