---
title: "Shell & Script"
---

**Shell 是使用者和 kernel 之間的指令直譯器：讀進一行指令，解析後 fork + exec 對應的程式。** 常見的有 `bash`（多數 Linux 預設）、`zsh`（macOS 預設）、`sh`（POSIX 標準，在 Debian / Alpine 上通常是 `dash` / `ash`）。

> 寫 script 時第一行的 `#!/usr/bin/env bash` 決定用哪個 shell 執行。寫成 `#!/bin/sh` 就只能用 POSIX 語法，`[[ ]]`、陣列等 bash 功能在 Alpine 上會失敗。

## 輸入輸出與重導向

每個 process 預設有三個 [file descriptor](/os/io#file-descriptor)：0 stdin、1 stdout、2 stderr。

| 寫法 | 意思 |
| --- | --- |
| `cmd > file` | stdout 寫進 file（覆蓋） |
| `cmd >> file` | stdout 附加到 file |
| `cmd 2> err.log` | stderr 寫進 err.log |
| `cmd > out.log 2>&1` | stdout 和 stderr 都寫進 out.log（順序不能反） |
| `cmd &> out.log` | 同上，bash 的簡寫 |
| `cmd < file` | 從 file 讀 stdin |
| `cmd > /dev/null 2>&1` | 丟掉所有輸出 |
| `cmd1 \| cmd2` | cmd1 的 stdout 接到 cmd2 的 stdin |
| `cmd \| tee file` | 同時印出並寫進檔案 |

```bash
cat <<EOF > config.yaml        # here document：把多行文字當 stdin
port: 8080
env: ${ENV}
EOF
```

## 組合指令

| 寫法 | 意思 |
| --- | --- |
| `a ; b` | 不管 a 成功與否都執行 b |
| `a && b` | a 成功（exit code 0）才執行 b |
| `a \|\| b` | a 失敗才執行 b |
| `$(cmd)` | 把 cmd 的輸出代入（command substitution） |
| `cmd &` | 丟到背景執行 |
| `( cd /tmp && ls )` | 在 subshell 裡執行，不影響目前的目錄 |

每個指令結束都有 **exit code**：0 代表成功，非 0 代表失敗，用 `$?` 查看上一個指令的結果。被 signal 殺掉的 process exit code 是 128 + signal 編號（`SIGKILL` = 9 → 137，`SIGTERM` = 15 → 143）。

## 變數與引號

```bash
name="world"               # 等號兩邊不能有空白
echo "hello $name"         # 雙引號：會展開變數
echo 'hello $name'         # 單引號：原樣輸出
echo "${name}_suffix"      # 用 {} 標出變數名稱的邊界
export DB_HOST=localhost   # export 之後子 process 才看得到
```

- **變數一律加雙引號**：`rm -rf $DIR/` 在 `DIR` 是空的時候會變成 `rm -rf /`；`"$file"` 也能避免檔名有空白時被拆開。
- 預設值：`${PORT:-8080}`（沒設定就用 8080）、`${TOKEN:?TOKEN is required}`（沒設定就報錯退出）。
- 特殊變數：`$0` script 名稱、`$1`…`$9` 參數、`$@` 所有參數、`$#` 參數個數、`$$` 目前的 PID。

## 流程控制

```bash
if [[ -f "$file" ]]; then           # 檔案存在
  echo "found"
elif [[ -z "$name" ]]; then         # 字串是空的
  echo "empty"
fi

for f in *.log; do
  gzip "$f"
done

while read -r line; do              # 一行一行讀檔
  echo "$line"
done < hosts.txt

case "$1" in
  start) start_server ;;
  stop)  stop_server ;;
  *)     echo "usage: $0 {start|stop}"; exit 1 ;;
esac
```

常用的判斷：`-f` 檔案存在、`-d` 目錄存在、`-z` 字串為空、`-n` 字串不為空、`==` / `!=` 字串比較、`-eq` / `-lt` / `-gt` 數字比較。

## 寫可靠的 Script

```bash
#!/usr/bin/env bash
set -euo pipefail

trap 'echo "failed at line $LINENO" >&2' ERR
trap 'rm -rf "$TMP_DIR"' EXIT

TMP_DIR="$(mktemp -d)"
```

- **`set -e`**：任何指令失敗就立刻結束，不會帶著錯誤繼續跑。
- **`set -u`**：使用未定義的變數就報錯，避免拼錯變數名稱變成空字串。
- **`set -o pipefail`**：pipeline 裡任何一段失敗，整條就算失敗（預設只看最後一段）。
- **`trap ... EXIT`**：不管怎麼結束都會執行，用來清理暫存檔。
- 用 [ShellCheck](https://www.shellcheck.net/) 檢查 script，可以抓出大部分引號、變數的錯誤。
- Script 超過一兩百行、需要複雜的資料結構或錯誤處理時，考慮改用 Python 或 Go。

## 文字處理

Linux 的哲學是「每個工具只做一件事，用 pipe 組合」。

```bash
grep -rn "ERROR" /var/log/app/            # 遞迴搜尋，顯示行號
grep -v "health" access.log               # 排除符合的行
grep -E "5[0-9]{2}" access.log            # 正規表達式

awk '{print $1}' access.log               # 印出第一欄（以空白分隔）
awk -F, '$3 > 100 {print $1}' data.csv    # 以逗號分隔，第三欄大於 100 的印出第一欄

sed 's/foo/bar/g' file                    # 取代後輸出
sed -i 's/8080/9090/' config.yaml         # 直接改檔案（macOS 要寫 sed -i ''）

cut -d: -f1 /etc/passwd                   # 以 : 分隔取第一欄
sort file | uniq -c | sort -rn            # 計數並由多到少排序
head -n 20 file                           # 看開頭 20 行
tail -f app.log                           # 持續追蹤新寫入的內容
wc -l file                                # 算行數
find . -name "*.tmp" -print0 | xargs -0 rm   # 把 stdin 轉成參數
jq '.items[].name' response.json          # 處理 JSON
```

例子：找出 access log 裡請求最多的前 10 個 IP：

```bash
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -10
```

找出並刪除 7 天前的 log：

```bash
find /var/log/app -name "*.log" -mtime +7 -print   # 先確認
find /var/log/app -name "*.log" -mtime +7 -delete
```

## 好用的設定

- `Ctrl+R`：搜尋指令歷史。`!!` 上一個指令（`sudo !!`），`!$` 上一個指令的最後一個參數。
- `alias k=kubectl`：寫進 `~/.bashrc` 或 `~/.zshrc`。
- `~/.bashrc` 在互動式 shell 啟動時載入，`~/.bash_profile` 在登入時載入；改完要 `source ~/.bashrc` 才會生效。
- `PATH` 決定去哪裡找指令，`which` / `command -v` 查看指令實際的位置。

## Reference

- [Bash Reference Manual](https://www.gnu.org/software/bash/manual/bash.html)
- [ShellCheck](https://www.shellcheck.net/)
- [explainshell.com](https://explainshell.com/)：貼上指令，逐段解釋每個參數
- [Google Shell Style Guide](https://google.github.io/styleguide/shellguide.html)
