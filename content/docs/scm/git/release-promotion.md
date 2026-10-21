---
title: "版本推進 (Release Promotion)"
---

## 從 develop 用 cherry-pick 推進到 staging

### 先理解三個東西

- **develop**：持續開發的分支，可能已有下一版或其他產品的變更。
- **tag**：標記某個確定的 commit，例如 `hyperlane-relayer@1.0.11`。它是版本的定位點，本身不會把程式碼帶到 staging。
- **staging**：準備驗證或部署的分支。我們用 cherry-pick，只把指定版本需要的提交複製過去。

Cherry-pick 會在 staging 上產生新的 commit；內容相同，commit ID 不同。

### 標準流程

以「staging 已有 1.0.10，要推進到 1.0.11」為例：

```bash
git fetch origin --tags
git switch develop
git pull --ff-only

# 確認新版本相對前一版有哪些提交
git log --oneline hyperlane-relayer@1.0.10..hyperlane-relayer@1.0.11
```

先確認這些提交確實屬於要發布的產品。接著從最新的 staging 建立發布分支，依時間順序 cherry-pick（舊的先、新的後）：

```bash
git switch -c release/hyperlane-relayer-1.0.11-staging origin/staging
git cherry-pick <較舊的commit> <較新的commit>
```

### 合併前核對

核心問題是：發布分支上的產品內容，是否與 tag 指向的版本一致？

```bash
# 在儲存庫根目錄執行；沒有輸出代表該產品目錄完全一致
git diff --exit-code hyperlane-relayer@1.0.11 HEAD -- alpha/hyperlane

git diff --check origin/staging...HEAD
git diff --stat origin/staging...HEAD
```

然後推送分支，開一個以 `staging` 為目標的 PR。PR 說明列出來源 tag、cherry-pick 的提交，以及核對結果。合併 PR 後，staging 才真正取得這些更新。

### 遇到衝突時

衝突表示來源提交與 staging 的現況無法自動合併。逐檔確認應保留的內容，解完後執行 `git add <檔案>`、`git cherry-pick --continue`，再重新做上述核對。若選錯提交或無法確定正確結果，先用 `git cherry-pick --abort` 回到操作前。

> 記住：版本號告訴你目標在哪裡；commit 清單告訴你要搬什麼；產品目錄的 diff 告訴你是否搬完整。
