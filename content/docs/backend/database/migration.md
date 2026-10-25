---
title: "DB Migration"
---

**Schema 是「資料現在長什麼樣子」，migration 是「怎麼把資料從一個版本改到下一個版本」。** 不論 SQL 還是 NoSQL，只要資料格式會隨程式演進，就需要 migration。

## 為什麼需要 Migration

資料庫裡已經有資料，而且通常有多個環境（本機、staging、production），不能像程式碼一樣整個覆蓋：

- **可重現**：每個環境都照同樣順序套用同樣的變更，結構才會一致，不會出現沒人知道的手動修改。
- **保留資料**：變更要考慮既有資料怎麼轉換，這些步驟與順序要被記錄下來。
- **可 review、可回滾**：migration 跟程式碼一起進 PR，出問題時有辦法退回。

可以用 Git 來類比：

| | 資料庫 | 程式碼 |
| --- | --- | --- |
| 某個時間點的樣子 | Schema | 某個 commit 的檔案內容 |
| 一次變更 | Migration | 一個 commit 的 diff |
| 依序套用所有變更 | 從第一版跑到最新版 | 從第一個 commit 走到 HEAD |

## Expand-Contract

部署時新舊版程式會短暫並存，任何時間點的資料都要能被兩個版本讀寫。因此破壞性的變更要拆成多步，以「把 `name` 改名為 `full_name`」為例：

1. **Expand**：新增 `full_name`，舊的 `name` 先保留。
2. **雙寫**：新版程式同時寫入兩個欄位，讀取優先用 `full_name`。
3. **Migrate**：把舊資料的 `name` 補進 `full_name` (backfill)。
4. **Contract**：確認沒有程式再讀 `name` 後，移除它。

直接 rename 會讓還在跑的舊版程式立刻壞掉。

## SQL Database

Schema 存在資料庫裡，寫入時強制檢查，所以 migration 主要是用 DDL 改**結構**，而且必須在程式依賴新結構之前套用。

Migration 是帶版本號的 SQL 腳本，通常附上反向的 down script：

```text
migrations/
├─ 0001_create_users.up.sql        CREATE TABLE users (...)
├─ 0002_add_users_name.up.sql      ALTER TABLE users ADD COLUMN name VARCHAR(100);
├─ 0002_add_users_name.down.sql    ALTER TABLE users DROP COLUMN name;
└─ 0003_index_users_email.up.sql   CREATE INDEX ...
```

Migration 工具（如 golang-migrate、Flyway、Liquibase、Prisma Migrate）會在資料庫裡記錄目前的版本，部署時只執行尚未套用的腳本。

- **新增 `NOT NULL` 欄位**：拆成「加可為 NULL 的欄位 → backfill → 加 constraint」。
- **大表 `ALTER`**：先確認是否會鎖表，必要時改用線上 schema 變更工具（如 gh-ost、pt-online-schema-change）或分批執行。
- **宣告式做法**（如 Prisma 的 `schema.prisma`、Atlas）：只維護想要的最終 schema，由工具比對資料庫目前的狀態並產生 migration。

## NoSQL Database

以 MongoDB 為例，資料庫不強制 schema，結構主要存在應用程式的程式碼裡。不做 migration 不會讓寫入失敗，但新舊格式的資料會混在一起，讀取時可能出錯。因此 migration 主要是轉換**資料**本身，另外也包括：

- 新增或調整 index。
- 設定驗證規則（如 MongoDB 的 `$jsonSchema`）。

轉換既有資料有兩種策略：

- **Eager**：寫批次腳本一次改完所有 document，之後程式只需要處理新格式。

  ```js
  db.users.updateMany(
    { full_name: { $exists: false } },
    [{ $set: { full_name: "$name" } }]
  );
  ```

- **Lazy**：每筆 document 帶 `schemaVersion` 欄位，程式讀到舊版本時轉成新格式再寫回。不需要停機或長時間批次，但程式要能同時處理多個版本，舊資料可能永遠不會被轉換。

常見工具：migrate-mongo、Mongock；golang-migrate 和 Liquibase 也支援 MongoDB。

## SQL vs. NoSQL

| | SQL | NoSQL |
| --- | --- | --- |
| Schema 在哪裡 | 資料庫，寫入時強制檢查 | 主要在應用程式程式碼 |
| Migration 主要改什麼 | 結構（DDL） | 資料（document 轉換） |
| 不做的後果 | 寫入直接失敗 | 新舊格式混雜，讀取時出錯 |
| 常見做法 | 依序套用版本化的 DDL 腳本 | 批次轉換 (eager) 或讀寫時轉換 (lazy) |
