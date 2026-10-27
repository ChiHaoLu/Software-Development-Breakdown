---
title: "Linux"
---

**Linux 嚴格來說只是 kernel；平常說的「Linux 系統」是 kernel 加上 GNU 工具、套件管理、init 系統等組成的 distribution（發行版）。** 絕大多數伺服器、container、雲端主機都跑 Linux，所以後端工程師至少要會在上面找東西、看 log、查問題。

## Distribution

| 家族 | 發行版 | 套件管理 | 常見用途 |
| --- | --- | --- | --- |
| Debian | Debian、Ubuntu | `apt`（`.deb`） | 雲端主機、開發環境 |
| Red Hat | RHEL、Rocky Linux、AlmaLinux、Fedora、Amazon Linux | `dnf` / `yum`（`.rpm`） | 企業伺服器 |
| Alpine | Alpine | `apk` | 小型 container image（約 5 MB） |
| Arch | Arch Linux | `pacman` | 個人桌面 |

- **Alpine 用 musl libc 而不是 glibc**，有些依賴 glibc 的程式（或 CGO 編譯的 Go 程式）會跑不起來或行為不同。Go 可以 `CGO_ENABLED=0` 編出靜態執行檔，搭配 `scratch` 或 distroless image。
- 只要 shell 和基本工具時，`debian:bookworm-slim` 是 Alpine 以外的常見選擇。

```bash
cat /etc/os-release      # 看是哪個發行版
uname -r                 # 看 kernel 版本
```

## 目錄結構（FHS）

| 目錄 | 放什麼 |
| --- | --- |
| `/` | 根目錄 |
| `/bin`、`/usr/bin` | 一般指令（新版發行版兩者已合併） |
| `/sbin`、`/usr/sbin` | 系統管理指令 |
| `/etc` | 設定檔（`/etc/nginx/`、`/etc/hosts`、`/etc/passwd`） |
| `/var` | 會變動的資料：`/var/log` 放 log、`/var/lib` 放服務資料（`/var/lib/docker`、`/var/lib/postgresql`） |
| `/home` | 一般使用者的家目錄 |
| `/root` | root 的家目錄 |
| `/tmp` | 暫存檔，可能在重開機時清空 |
| `/opt` | 第三方軟體 |
| `/proc` | kernel 即時產生的虛擬檔案系統，每個 process 一個目錄（`/proc/<pid>/`） |
| `/sys` | 裝置與 kernel 參數（cgroup 在 `/sys/fs/cgroup`） |
| `/dev` | 裝置檔（`/dev/sda`、`/dev/null`） |

`/proc` 很好用：

```bash
cat /proc/cpuinfo              # CPU 資訊
cat /proc/meminfo              # 記憶體詳細用量
cat /proc/<pid>/status         # process 的狀態、記憶體、thread 數
ls -l /proc/<pid>/fd           # process 開了哪些檔案
cat /proc/<pid>/environ | tr '\0' '\n'   # process 的環境變數
```

## 使用者與權限

每個檔案都有擁有者（user）、群組（group），以及三組權限：

```text
-rwxr-x---  1 app  app  4096  Oct 27 10:00  deploy.sh
│└┬┘└┬┘└┬┘
│ │  │  └── 其他人（others）：沒有權限
│ │  └───── 群組（group）：讀、執行
│ └──────── 擁有者（user）：讀、寫、執行
└────────── 檔案類型：- 一般檔案、d 目錄、l symbolic link
```

| 權限 | 數字 | 對檔案 | 對目錄 |
| --- | --- | --- | --- |
| `r` | 4 | 讀內容 | 列出裡面的檔名 |
| `w` | 2 | 修改內容 | 新增、刪除、改名裡面的檔案 |
| `x` | 1 | 執行 | 進入（`cd`）、存取裡面的檔案 |

```bash
chmod 750 deploy.sh          # rwx r-x ---
chmod +x script.sh           # 加上執行權限
chown app:app /var/lib/app   # 改擁有者與群組
chmod 600 ~/.ssh/id_ed25519  # 私鑰權限太寬，ssh 會拒絕使用
```

- **root**（UID 0）可以無視權限檢查。日常用一般帳號，需要時 `sudo`。
- **服務不要用 root 跑**：被攻破時損害範圍較小。Dockerfile 用 `USER` 指定非 root 使用者。
- 使用者資訊在 `/etc/passwd`，密碼雜湊在 `/etc/shadow`，群組在 `/etc/group`。
- 特殊權限：**setuid**（執行時以檔案擁有者身分執行，如 `passwd`）、**sticky bit**（`/tmp` 上，只有檔案擁有者能刪自己的檔案）。
- 更細的控制：ACL（`setfacl`）、Linux capabilities（只給 process 部分 root 權限，例如 `CAP_NET_BIND_SERVICE` 讓一般使用者綁 1024 以下的 port）、SELinux / AppArmor。

## 套件管理

```bash
# Debian / Ubuntu
sudo apt update                 # 更新套件清單
sudo apt install -y nginx
apt list --upgradable
sudo apt upgrade                # 升級，包含 security patch

# RHEL 系
sudo dnf install -y nginx
sudo dnf update
```

Dockerfile 裡記得把 `update` 和 `install` 寫在同一個 `RUN`，並清掉快取，減少 image 大小：

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
```

定期更新套件的重要性見 [Patch 管理](/devops/patch)。

## SSH

```bash
ssh-keygen -t ed25519 -C "me@example.com"   # 產生金鑰
ssh-copy-id user@host                        # 把公鑰放到遠端的 ~/.ssh/authorized_keys
ssh -i ~/.ssh/id_ed25519 user@host
ssh -L 5432:db.internal:5432 user@bastion    # port forwarding：透過跳板連內網資料庫
scp file.txt user@host:/tmp/
```

`~/.ssh/config` 可以幫常用的主機取別名：

```text
Host prod
    HostName 10.0.0.12
    User deploy
    ProxyJump bastion
```

伺服器端建議關掉密碼登入與 root 登入（`/etc/ssh/sshd_config` 的 `PasswordAuthentication no`、`PermitRootLogin no`）。

## Reference

- [看漫畫學 Linux](https://hackmd.io/@sysprog/linux-comic)
- [鳥哥的 Linux 私房菜](https://linux.vbird.org/)
- [Filesystem Hierarchy Standard](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/index.html)
- [The Linux Command Line](https://linuxcommand.org/tlcl.php)
