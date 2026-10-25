---
title: "SQL 語言"
---

SQL (Structured Query Language) 是操作關聯式資料庫 (RDBMS) 的標準語言。MySQL、PostgreSQL、SQLite、Oracle、SQL Server 都以 SQL 為主，語法大同小異，差異多在函式、型別與進階功能。

SQL 最常用來對資料庫中的資料做 CRUD（新增、查詢、更新、刪除），但它的用途不只如此：也可以用來定義與修改 schema，例如欄位的資料型別與 constraint、table 與 index 的結構；還可以管理使用者對資料庫的存取權限。

- [SQL Tutorial (W3Schools)](https://www.w3schools.com/sql/)
- [PostgreSQL Tutorial](https://www.postgresqltutorial.com/)
- [SQLBolt：互動式 SQL 練習](https://sqlbolt.com/)
- [Use The Index, Luke!：給開發者的 SQL 索引與效能指南](https://use-the-index-luke.com/)

## SQL 的分類

| 類別 | 全名 | 用途 | 常見指令 |
| --- | --- | --- | --- |
| DDL | Data Definition Language | 定義結構 | `CREATE`、`ALTER`、`DROP`、`TRUNCATE` |
| DML | Data Manipulation Language | 操作資料 | `INSERT`、`UPDATE`、`DELETE` |
| DQL | Data Query Language | 查詢資料 | `SELECT` |
| DCL | Data Control Language | 權限控管 | `GRANT`、`REVOKE` |
| TCL | Transaction Control Language | 交易控制 | `BEGIN`、`COMMIT`、`ROLLBACK`、`SAVEPOINT` |

## 建立資料表

```sql
CREATE TABLE users (
    id          BIGSERIAL PRIMARY KEY,
    email       VARCHAR(255) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT        NOT NULL REFERENCES users(id),
    amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    status      VARCHAR(20)   NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

常見 constraint：

- `PRIMARY KEY`：唯一且非 NULL，用來識別每一列。
- `FOREIGN KEY` / `REFERENCES`：確保關聯的資料存在，可搭配 `ON DELETE CASCADE` 等行為。
- `UNIQUE`、`NOT NULL`、`CHECK`、`DEFAULT`。

金額請用 `NUMERIC` / `DECIMAL`，不要用 `FLOAT`，避免浮點誤差。

## 基本 CRUD

```sql
-- Create
INSERT INTO users (email, name) VALUES ('alice@example.com', 'Alice');

-- Read
SELECT id, email, name FROM users WHERE email = 'alice@example.com';

-- Update
UPDATE users SET name = 'Alice Chen' WHERE id = 1;

-- Delete
DELETE FROM users WHERE id = 1;
```

`UPDATE` 與 `DELETE` 忘了加 `WHERE` 會改到整張表。在正式環境手動操作前，先用相同條件 `SELECT` 確認影響範圍，並在 transaction 內執行。

## SELECT 的執行順序

寫的順序和資料庫邏輯上執行的順序不同：

```text
寫法順序：SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT
執行順序：FROM / JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
```

這解釋了幾個常見問題：

- `WHERE` 不能使用 `SELECT` 裡定義的 alias，因為 `SELECT` 還沒執行。
- `WHERE` 過濾的是「列」，`HAVING` 過濾的是「分組後的結果」，所以聚合函式條件要寫在 `HAVING`。

```sql
SELECT user_id, COUNT(*) AS order_count, SUM(amount) AS total
FROM orders
WHERE status = 'paid'
GROUP BY user_id
HAVING SUM(amount) > 1000
ORDER BY total DESC
LIMIT 10;
```

## JOIN

```sql
SELECT u.name, o.id AS order_id, o.amount
FROM users u
JOIN orders o ON o.user_id = u.id;
```

| JOIN | 結果 |
| --- | --- |
| `INNER JOIN` | 只保留兩邊都有對應的列 |
| `LEFT JOIN` | 保留左表全部，右表沒對應則為 `NULL` |
| `RIGHT JOIN` | 保留右表全部，左表沒對應則為 `NULL` |
| `FULL OUTER JOIN` | 兩邊全部保留 |
| `CROSS JOIN` | 笛卡兒積，每列兩兩配對 |

找出「沒有任何訂單的使用者」：

```sql
SELECT u.*
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.id IS NULL;
```

`LEFT JOIN` 後若把右表條件寫在 `WHERE`（例如 `WHERE o.status = 'paid'`），會把 `NULL` 列濾掉，效果等同 `INNER JOIN`。要保留左表全部，條件應寫在 `ON`。

## 子查詢與 CTE

```sql
-- 子查詢
SELECT * FROM users
WHERE id IN (SELECT user_id FROM orders WHERE amount > 500);

-- CTE (Common Table Expression)，可讀性較好
WITH big_spenders AS (
    SELECT user_id, SUM(amount) AS total
    FROM orders
    GROUP BY user_id
    HAVING SUM(amount) > 1000
)
SELECT u.name, b.total
FROM big_spenders b
JOIN users u ON u.id = b.user_id;
```

## Window Function

聚合但不把列合併，適合排名、累計、與上一筆比較：

```sql
SELECT
    user_id,
    id,
    amount,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn,
    SUM(amount)  OVER (PARTITION BY user_id ORDER BY created_at)      AS running_total,
    LAG(amount)  OVER (PARTITION BY user_id ORDER BY created_at)      AS prev_amount
FROM orders;
```

取每位使用者最新一筆訂單：

```sql
SELECT * FROM (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM orders o
) t
WHERE rn = 1;
```

## NULL 的陷阱

- `NULL` 代表「未知」，`NULL = NULL` 的結果不是 `TRUE` 而是 `NULL`，判斷要用 `IS NULL` / `IS NOT NULL`。
- `COUNT(*)` 計算所有列，`COUNT(column)` 會略過 `NULL`。
- `NOT IN (子查詢)` 若子查詢結果含 `NULL`，整個條件永遠不成立；改用 `NOT EXISTS` 較安全。
- 用 `COALESCE(column, 預設值)` 處理 `NULL`。

## Transaction 與 ACID

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;   -- 任一步失敗則 ROLLBACK
```

- **Atomicity**：全部成功或全部失敗。
- **Consistency**：交易前後都符合 constraint。
- **Isolation**：並行交易互不干擾的程度。
- **Durability**：commit 後資料不會因當機而遺失。

### Isolation Level

| Level | Dirty Read | Non-repeatable Read | Phantom Read |
| --- | --- | --- | --- |
| Read Uncommitted | 可能 | 可能 | 可能 |
| Read Committed | 不會 | 可能 | 可能 |
| Repeatable Read | 不會 | 不會 | 可能 |
| Serializable | 不會 | 不會 | 不會 |

PostgreSQL 預設 Read Committed，MySQL (InnoDB) 預設 Repeatable Read。等級越高越安全，但鎖競爭與重試越多。

需要「讀出來再更新」時（例如扣庫存），用 `SELECT ... FOR UPDATE` 鎖住列，或改寫成單一條件式更新：

```sql
UPDATE products SET stock = stock - 1
WHERE id = 42 AND stock > 0;   -- 檢查 affected rows 是否為 1
```

## Index

Index 讓查詢不必掃整張表，最常見的是 B-Tree。

```sql
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at);
```

- **複合索引看最左前綴**：`(user_id, created_at)` 可用於 `WHERE user_id = ?` 或 `WHERE user_id = ? AND created_at > ?`，但單獨 `WHERE created_at > ?` 用不到。
- **索引會失效的寫法**：對欄位套函式（`WHERE LOWER(email) = ?`）、隱式型別轉換、前綴萬用字元（`LIKE '%abc'`）。
- **索引不是越多越好**：每次寫入都要維護索引，會拖慢 `INSERT` / `UPDATE` 並佔空間。
- **Covering index**：查詢需要的欄位都在索引內，就不用回表。

用 `EXPLAIN` 看執行計畫：

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20;
```

看到大表上的 `Seq Scan`（PostgreSQL）或 `type: ALL`（MySQL）通常代表缺索引。

## 分頁

```sql
-- OFFSET 分頁：頁數越後面越慢，因為要先掃過前面所有列
SELECT * FROM orders ORDER BY id LIMIT 20 OFFSET 100000;

-- Keyset (cursor) 分頁：用上一頁最後一筆的 key 接續，效能穩定
SELECT * FROM orders WHERE id > :last_id ORDER BY id LIMIT 20;
```

## 正規化

- **1NF**：每個欄位都是不可再分的單一值，沒有重複群組。
- **2NF**：滿足 1NF，且非主鍵欄位完全依賴整個主鍵（避免部分依賴）。
- **3NF**：滿足 2NF，且非主鍵欄位不依賴其他非主鍵欄位（避免遞移依賴）。

正規化減少重複與更新異常；讀取量大的場景可以適度反正規化（例如冗餘存一份 `order_count`），以 JOIN 次數換取一致性維護成本。

## 在應用程式中使用 SQL

### SQL Injection

永遠不要用字串拼接組 SQL，改用 parameterized query / prepared statement：

```go
// ❌ 危險
db.Query("SELECT * FROM users WHERE email = '" + email + "'")

// ✅ 安全
db.Query("SELECT * FROM users WHERE email = $1", email)
```

### N+1 Query

先查出 N 筆資料，再對每筆各發一次查詢，總共 N+1 次 round trip。ORM 的 lazy loading 很容易造成這個問題。解法是用 `JOIN`、`WHERE id IN (...)` 批次查詢，或 ORM 的 eager loading（如 `Preload`、`include`）。

### Migration

Schema 變更要透過版本化的 migration 管理，詳見 [DB Migration](/backend/database/migration)。

## 延伸閱讀

- [SQL Joins Visualizer](https://sql-joins.leopard.in.ua/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/current/)
- [MySQL 8.0 Reference Manual](https://dev.mysql.com/doc/refman/8.0/en/)
