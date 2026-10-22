---
title: "SonarQube 與其替代方案"
---

## SonarQube 在做什麼

SonarQube（自架版稱 SonarQube Server，SaaS 版為 SonarQube Cloud，舊名 SonarCloud）是一個整合型的程式碼品質平台。CI 中的 scanner 分析程式碼並把結果上傳到 Sonar server，再由 server 判斷 Quality Gate 是否通過。

主要功能：

- **Static analysis**：不執行程式，直接分析原始碼，找出 bugs、vulnerabilities、code smells。
- **Maintainability**：complexity（cyclomatic / cognitive）、duplication（重複程式碼的比例與位置）、technical debt（估算修完所有 code smell 需要的時間）。
- **Security**：
  - **Vulnerability**：確定有問題、需要修的程式碼。
  - **Security hotspot**：安全敏感的寫法（如自組 SQL、關閉 TLS 驗證），不一定是漏洞，需要人工 review 後標記 safe 或 fix。
  - **Taint analysis**：追蹤不可信輸入（request 參數等）流到危險位置（SQL、shell、file path）的路徑，用來找 injection 類漏洞。只有付費版本支援，且只涵蓋部分語言。
- **Test coverage 匯入**：SonarQube 本身不跑測試，而是讀取測試工具產出的 coverage 報告（lcov、JaCoCo XML、coverage.py XML…）。
- **PR / branch analysis**：只分析 PR 的變更，標示新增程式碼的問題，並在 PR 上留言（PR decoration）。自架的 Community 版不支援 branch / PR analysis，需要付費版本。
- **Quality Gate**：依 issue 嚴重度、coverage、duplication 等條件（如新程式碼 coverage ≥ 80%、無新增 blocker issue、重複率 ≤ 3%），決定這次 CI pass 或 fail。
- **集中式 dashboard**：跨 project 的歷史趨勢、issue assignment（把 issue 指派給人）、標記誤報。

其中 lint、security 掃描、coverage 都有現成工具可以替代；真正難替代的是最後一項：**跨 repo 的集中 dashboard 與長期趨勢**。

### 為什麼常讓人覺得惱人

- 規則和誤報處理在 **repo 外的 dashboard**，不在 code review 裡，開發者看不到也改不到。
- 預設規則集很大，常與團隊既有的 linter 規則重複或衝突。
- 失敗原因要點進 Sonar UI 才看得到，本機難以重現。
- 需要額外維護 server、token、webhook、授權與版本升級。

## 替代方案：用工具組合拼出來

沒有單一免費工具能 1:1 取代 SonarQube，通常是依需求把幾個專門工具組合起來。

| SonarQube 功能 | 替代工具 |
| --- | --- |
| Security analysis (SAST) | GitHub CodeQL、Semgrep |
| 自訂規則 | Semgrep（用接近原始碼的 pattern 寫規則） |
| Bug pattern / code smell / 語言品質規則 | ESLint、Ruff、Checkstyle / SpotBugs、golangci-lint、Clippy |
| Complexity | linter 內建規則：ESLint `complexity`、Ruff `C901`、golangci-lint `gocyclo` / `gocognit` |
| Duplicated code | jscpd、PMD CPD |
| Coverage 產出 | coverage.py、JaCoCo、Istanbul / nyc / c8、`go test -cover` |
| Coverage gate（尤其是新程式碼） | Codecov、Coveralls、diff-cover |
| 依賴套件漏洞（SonarQube 不是主力） | Dependabot、Renovate、Snyk Open Source、Trivy |
| Secret 偵測 | GitHub secret scanning、gitleaks |
| 整合型（最接近 SonarQube） | CodeClimate、Codacy、Snyk Code、DeepSource |

### 建議組合

| 面向 | 做法 |
| --- | --- |
| 程式風格與一般品質 | 各語言原生 lint / formatter |
| 安全掃描 | CodeQL 或 Semgrep |
| 依賴套件風險 | Dependabot / Renovate |
| 測試品質 | 各語言各自的 coverage gate |
| 集中 dashboard、technical debt 趨勢 | 真的需要才導入整合型產品 |

- **想要減少外部依賴、規則留在 repo**：linter + CodeQL / Semgrep + coverage 工具，全部以設定檔進版控。
- **想要一個 dashboard 看全部**：選整合型產品，但本質上只是換一個 SonarQube。如果團隊根本沒有在看 dashboard 或 technical debt trend，就不必再找一套大型平替。
- **GitHub repo**：CodeQL 對 public repo 免費，private repo 需要 GitHub Advanced Security；結果會出現在 Security tab 與 PR 上。

### 實例：盤點一個 monorepo 已經有什麼

先盤點 repo 現有的 checks，常會發現 SonarQube 做的事有一大半已經被別的工具做掉了。以一個 TypeScript + Solidity + Go 的 monorepo 為例：

| 語言 / 面向 | 已有 | 缺口 |
| --- | --- | --- |
| TypeScript | ESLint、Prettier、unit tests | coverage gate |
| Solidity | `forge fmt --check`、`forge test` | lint（如 solhint）、`forge coverage` gate |
| Go | `go test` | `golangci-lint` 設定被註解掉，等於沒有 lint |
| CI 調度 | GitHub Actions 透過 `moon ci` 只跑受影響（touched）projects 的 lint / test | — |
| Dependency risk | Dependabot | — |
| Security (SAST) | 無 | CodeQL 或 Semgrep |

補齊缺口的方式：

- **Go**：把 `golangci-lint` 設定恢復，並加進 moon 的 lint task，讓 `moon ci` 自動帶到。
- **Coverage**：Jest `--coverage`、`go test -coverprofile`、`forge coverage --report lcov` 各自產出報告，再用 Codecov 或 diff-cover 檢查新程式碼的 coverage。Jest 也可以直接用 `coverageThreshold` 設門檻。
- **Security**：加一個 CodeQL（支援 JS/TS、Go）或 Semgrep（另有 Solidity 規則）的 workflow。
- 新 checks 一樣要設為 branch protection 的 required checks。

### 範例：GitHub Actions 中的替代 gate

```yaml
name: quality
on: [pull_request]

jobs:
  lint-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # diff-cover 需要比對 base branch
      - run: npm ci
      - run: npm run lint            # ESLint：含 complexity 規則
      - run: npx jscpd src --threshold 3
      - run: npm test -- --coverage  # 產出 coverage/cobertura-coverage.xml
      - run: |
          pip install diff-cover
          diff-cover coverage/cobertura-coverage.xml \
            --compare-branch=origin/${{ github.base_ref }} \
            --fail-under=80          # 只要求「這次變更」的 coverage

  codeql:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3
```

接著把 `lint-test`、`codeql`（或 CodeQL 的 code scanning 結果）設為 branch protection 的 required checks。

## 如何安全地拔掉 SonarQube

不能只刪 CI step。如果 Quality Gate 原本有擋住某些問題，直接刪掉等於默默拿掉一道防線；反之若 required check 沒同步移除，所有 PR 都會卡在「等待一個永遠不會回報的 check」。

### 1. 盤點現在真正在擋什麼

- 在 Sonar UI 找出該 project 套用的 **Quality Gate** 條件與 **Quality Profile**（規則集）。
- 查最近一段時間的 PR：Quality Gate 實際擋下了哪些？是 coverage、新 bug、security hotspot，還是重複率？
- 確認 Sonar 的 check 在 branch protection / ruleset 裡是否為 **required**。若不是 required，代表它從來沒真正擋過 merge，替代的急迫性也較低。
- 分辨哪些規則是團隊真的在意的，哪些只是預設值。

### 2. 為必要規則建立替代 checks

- 只替換有價值的條件，例如「新程式碼 coverage ≥ 80%」→ diff-cover / Codecov；「無新增 vulnerability」→ CodeQL / Semgrep。
- 先讓新 checks 與 SonarQube **並行跑一段時間**，比較兩邊結果，確認沒有明顯漏網。
- 把新 checks 設為 required。

### 3. 移除 SonarQube 相關的所有痕跡

- **CI**：scanner step（`sonarsource/sonarqube-scan-action`、`sonar-scanner`、`mvn sonar:sonar`、`gradle sonar` 等）。
- **設定檔**：`sonar-project.properties`、`pom.xml` / `build.gradle` 中的 sonar plugin 與 `sonar.*` 屬性、只為 Sonar 存在的 coverage 格式轉換。
- **Secrets / variables**：`SONAR_TOKEN`、`SONAR_HOST_URL`，並到 Sonar 端 revoke 該 token。
- **Sonar 端**：project、webhook、與 GitHub / GitLab 的 integration（GitHub App 安裝、PR decoration 設定）。
- **Branch protection / rulesets**：移除 Sonar 的 required status check（例如 `SonarCloud Code Analysis`、`SonarQube Quality Gate`）。
- **文件與 badge**：README 中的 Sonar badge、貢獻指南中的相關說明。

### 4. 用一個 PR 驗證新 gate

刻意開一個「應該被擋下」的測試 PR，例如加入沒有測試的程式碼、違反 lint 規則或已知的 vulnerable pattern，確認：

- 新的 checks 會失敗，且錯誤訊息直接說明原因。
- branch protection 確實阻擋 merge。
- 不再出現任何 Sonar check 或卡在 pending 的 required check。

驗證完成後關閉該 PR。

> 記住：拔掉 SonarQube 的目標不是「少一個 check」，而是把真正有價值的規則搬回 repo 內、可在本機重現、在 code review 中可見的地方。
