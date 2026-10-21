---
title: "Source Code Management (SCM)"
---

原始碼如何被管理的筆記：版本控制、分支與發布流程、monorepo、依賴管理、commit 規範等。

## 為什麼不放在 DevOps 底下

在 DevOps 流程中，SCM 對應「Code」階段，也是 CI/CD 的起點，所以常被視為 DevOps 的一部分。這裡仍將它獨立出來：

- **受眾不同**：DevOps 偏交付、部署與維運；SCM 是每個寫程式的人每天都在用的。
- **內容性質不同**：monorepo、依賴管理、commit 規範、Git 操作關心的是「開發時怎麼管理程式碼」，與 pipeline、監控關係不大。
- **業界慣例**：SCM 與 CI/CD 通常是並列的概念，而非上下層。

交界處的分工：用 Git 完成的流程（分支、tag、cherry-pick）放在 SCM；pipeline 自動化（tag 觸發 build、部署到 staging）放在 [DevOps 的 CI/CD](/devops/ci-cd)。
