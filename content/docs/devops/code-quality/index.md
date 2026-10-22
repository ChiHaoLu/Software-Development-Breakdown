---
title: "程式碼品質把關 (Code Quality Gate)"
---

在 CI 中自動檢查程式碼品質、安全性與測試覆蓋率，並在不合格時擋下 merge 的筆記。

- [SonarQube](/devops/code-quality/sonarqube)：SonarQube 能做什麼、可用哪些工具組合替代，以及如何安全地把它從 repo 拔掉。

## 品質把關在 CI 裡的位置

```text
PR opened / pushed
  └─ CI pipeline
       ├─ build
       ├─ lint / format            語言層級規則（ESLint、Ruff、golangci-lint…）
       ├─ static analysis (SAST)   安全與 bug pattern（CodeQL、Semgrep、SonarQube…）
       ├─ test + coverage report   產出 coverage 檔（lcov、cobertura、jacoco.xml…）
       └─ quality gate             彙整以上結果：通過 / 失敗
            ↓
Branch protection (required checks)
            ↓
允許 / 阻擋 merge
```

## 重點觀念

- **真正擋人的是 branch protection 的 required check**，不是工具本身。工具只負責回報 pass / fail；沒被設為 required 的 check，失敗也只是一個紅叉。
- **只針對新程式碼把關**（clean as you code）比要求整個 repo 一次達標實際：例如「新增程式碼 coverage ≥ 80%」「PR 不得新增 critical issue」。
- **規則要能在本機重現**：lint、format、test 最好都能在 local 或 pre-commit 跑，CI 只是最後一道確認，否則開發者只能靠反覆 push 來試錯。
- **誤報要有出口**：每個工具都要有明確的 suppress 方式（inline comment、baseline、config exclude），並在 code review 中被看見，而不是由個人在外部 dashboard 上默默按掉。
