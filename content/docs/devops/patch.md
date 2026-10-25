---
title: "Patch 管理"
---

**Patch（修補程式）是軟體廠商發布的小型更新，用來修正已經發現的問題。** 「上 patch」就是把這個更新安裝上去。這個詞原本的意思是衣服上的「補丁」：衣服破了洞不用整件換新，補一塊布就好；軟體也一樣，不必整個重裝，只更新有問題的部分。

> 不要和 HTTP 的 `PATCH` 方法搞混，那是「部分更新資源」的 API 動詞，見 [HTTP](/backend/api/HTTP)。

## 通常在修什麼

- **安全漏洞**：最重要的一類。例如某個版本被發現可以繞過登入驗證，廠商就會發布 security patch。沒上 patch 的系統，等於把已公開的漏洞留給攻擊者。
- **Bug**：例如某種操作會讓服務當掉，或算出錯誤的結果。
- **效能或穩定性問題**：例如 memory leak。

## Patch vs. Upgrade

以 PostgreSQL 為例：

| 更新類型 | 版本變化 | 內容 | 風險 |
| --- | --- | --- | --- |
| Patch（minor release） | 16.2 → 16.3 | 只修 bug 和漏洞，不加新功能 | 低，通常重啟就好 |
| Upgrade（major release） | 16 → 17 | 新功能，可能改變行為或資料格式 | 高，要測試、規劃遷移 |

Patch 通常建議盡快上，尤其是 security patch；大版本升級則要先規劃、測試。

> 各家的版本號規則不同。在 semantic versioning（`MAJOR.MINOR.PATCH`，如 `1.4.2`）裡，最後一碼才是 patch version；PostgreSQL 則是第二碼代表 patch。

## 為什麼是維運的挑戰

上 patch 看似簡單，但對正在服務的系統來說：

- 通常要**重啟服務**，所以得安排維護時段，或先切換到備援機器，避免服務中斷。
- 上之前要先確認 patch **不會影響現有的應用程式**，最好先在 staging 驗證。
- 廠商幾乎每個月都會發布 patch，持續追蹤和安裝需要人力。

因此 managed service（如 Amazon RDS、Cloud SQL）會強調「自動上 patch」：雲端廠商會在你設定的維護時段自動處理。程式碼的相依套件則可以用 Dependabot、Renovate 自動開 PR 更新。
