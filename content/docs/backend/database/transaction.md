---
title: "Transaction"
---

**Transaction（交易）是一組操作，要嘛全部生效，要嘛全部不生效。** 有些操作流程一次需要多個 query（例如轉帳要扣一邊、加一邊），transaction 讓這些 query 被當成一個單位處理，是設計安全可靠的資料庫系統不可或缺的一環。

資料庫主要靠三樣東西做到這點：**WAL（預寫日誌）**、**並行控制（Lock 或 MVCC）**、**Commit 協定**。下面以 PostgreSQL 與 MySQL InnoDB 為例。

## ACID

| 特性 | 意思 | 主要靠什麼保證 |
| --- | --- | --- |
| Atomicity（原子性） | 只會是「全部執行」或「全部沒執行」其中一種狀態 | WAL + undo（或 MVCC 舊版本） |
| Consistency（一致性） | 交易前後資料都符合規則（constraint、業務邏輯） | Constraint + 應用程式 |
| Isolation（隔離性） | 並行的交易互不干擾，看不到別人改到一半的資料 | Lock / MVCC |
| Durability（持久性） | Commit 之後，資料不會因當機而遺失 | WAL 落盤 |

## 生命週期

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;   -- 任一步失敗則 ROLLBACK
```

- **開始**：資料庫替這個 transaction 配一個 ID（txid），並決定它能看到哪個時間點的資料（snapshot）。PostgreSQL 實際上是第一次寫入時才配 txid，唯讀交易不消耗 txid。
- **修改**：每次修改都先寫進日誌，並在記憶體的 buffer pool 裡改 page，**不會立刻寫回磁碟上的資料檔**。
- **`COMMIT`**：日誌落盤（fsync）就算成功。
- **`ROLLBACK` 或當機**：把這個 transaction 的修改撤銷。
- **`SAVEPOINT`**：在交易中設一個中繼點，可以只 `ROLLBACK TO SAVEPOINT` 退回到那裡，不必整個放棄。

## Atomicity 與 Durability：WAL

規則只有一條：**資料頁寫回磁碟之前，描述這次修改的日誌必須先落盤。**

- **Redo log**：記錄「改成了什麼」。已 commit 但資料頁還沒寫回磁碟時當機，重啟後重播 redo，修改就不會遺失（Durability）。
- **Undo log**：記錄「原本是什麼」。沒 commit 的 transaction 在 rollback 或當機後用它還原（Atomicity）。InnoDB 有獨立的 undo log；PostgreSQL 沒有，舊版本本來就留在 table 裡，rollback 只要把該 txid 標成 aborted，之後沒人會看到它寫的版本。
- **為什麼這樣比較快**：commit 只需要**順序寫**一小段日誌，不必**隨機寫**一堆分散的資料頁。資料頁之後再由 checkpoint 批次寫回。

當機後的復原以 **ARIES** 演算法為代表，分三步：

1. **Analysis**：從最後一個 checkpoint 開始掃日誌，找出當機時哪些 transaction 還沒結束、哪些 page 可能還沒寫回。
2. **Redo**：把所有修改（包含沒 commit 的）重播，回到當機前一刻的狀態。
3. **Undo**：撤銷沒 commit 的 transaction。

PostgreSQL 因為用 MVCC 保留舊版本，復原時只需要 redo，沒 commit 的版本自然不可見。

## Isolation：Lock 與 MVCC

多個 transaction 同時跑，要避免互相看到對方改到一半的資料。

### Lock（悲觀）

- 讀加 shared lock，寫加 exclusive lock；shared 之間相容，exclusive 與任何鎖都互斥。
- **2PL（Two-Phase Locking）**：先只能加鎖（growing），開始放鎖之後就不能再加（shrinking）。**Strict 2PL** 把寫鎖一路持有到 commit，避免別人讀到之後可能被 rollback 的資料。
- 代價是會互相等待，還可能 **deadlock**：資料庫偵測等待圖（wait-for graph）裡的環，挑一個 transaction 殺掉並 rollback，應用程式要準備好重試。

### MVCC（多版本，現代主流）

- 寫入不覆蓋舊資料，而是產生新版本，每個版本記著是哪個 txid 建立、哪個 txid 刪除的。
- 每個 transaction 拿到一份 **snapshot**，只看得到「snapshot 建立前已經 commit」的版本。
- 所以**讀不擋寫、寫不擋讀**，只有兩個 transaction 寫同一筆資料時才會衝突（後到的要等前一個結束）。
- 舊版本要清理：PostgreSQL 把舊版本留在 table 裡，要靠 `VACUUM`（通常是 autovacuum）回收；InnoDB 的舊版本在 undo log，由 purge thread 清掉。長時間不結束的 transaction 會讓舊版本無法回收，造成 table bloat。

實務上兩者會並用：一般讀取走 MVCC，`SELECT ... FOR UPDATE` 和寫入仍然會加 row lock。

## Isolation Level

隔離越嚴格越安全，但衝突、等待與重試也越多，isolation level 就是在一致性與效能之間取捨。

### 常見異常

| 異常 | 情境 |
| --- | --- |
| Dirty Read | 讀到別人還沒 commit 的資料，對方後來 rollback 了 |
| Non-repeatable Read | 同一筆資料讀兩次，中間被別人改掉 |
| Phantom Read | 同樣條件查兩次，中間別人新增或刪除了符合條件的 row |
| Lost Update | 兩人都「讀 → 改 → 寫」，後寫的蓋掉先寫的 |
| Write Skew | 兩人讀同一批資料、各改不同的 row，各自看都合法，合起來卻違反規則 |

### 各等級防住什麼

| Level | Dirty Read | Non-repeatable Read | Phantom Read | 常見實作 |
| --- | --- | --- | --- | --- |
| Read Uncommitted | 可能 | 可能 | 可能 | 幾乎沒人用；PostgreSQL 直接當成 Read Committed |
| Read Committed | 不會 | 可能 | 可能 | 每條 SQL 取一次新 snapshot（PostgreSQL 預設） |
| Repeatable Read | 不會 | 不會 | 依實作 | 整個 transaction 共用一份 snapshot（MySQL InnoDB 預設） |
| Serializable | 不會 | 不會 | 不會 | 結果等同所有 transaction 一個接一個跑 |

上表是 SQL 標準的定義，實際行為要看資料庫：

- **Repeatable Read 與 Phantom**：PostgreSQL 的 RR 是 snapshot isolation，一般查詢不會看到 phantom；InnoDB 的一般讀取靠 snapshot，`FOR UPDATE` 等 locking read 則靠 **next-key lock（gap lock）** 擋住範圍內的插入。
- **Repeatable Read 與 Lost Update**：PostgreSQL 的 RR 發現同一筆 row 被並行修改時會直接報錯（`could not serialize access`），要應用程式重試；InnoDB 的 RR 不會，寫入時讀的是最新版本，「先 `SELECT` 再 `UPDATE`」的寫法仍會 lost update。
- **Serializable**：PostgreSQL 用 **SSI（Serializable Snapshot Isolation）** 偵測危險的讀寫依賴並 abort 其中一個；InnoDB 則是把一般 `SELECT` 都變成加 shared lock，接近 strict 2PL。
- **Write Skew**：snapshot isolation（也就是多數資料庫的 Repeatable Read）擋不住，要用 Serializable 或明確加鎖。

### Write Skew 範例

規則是「至少要有一位醫生值班」，目前 Alice、Bob 兩人值班：

```sql
-- Alice 和 Bob 同時執行
BEGIN;
SELECT count(*) FROM doctors WHERE on_call = true;  -- 兩人都看到 2
UPDATE doctors SET on_call = false WHERE name = 'Alice';  -- Bob 改的是自己那筆
COMMIT;
```

兩個 transaction 改的是不同 row，不會互相衝突，於是都成功，結果沒人值班。

## 處理 Lost Update 與 Write Skew

| 方法 | 做法 | 適合 |
| --- | --- | --- |
| 原子更新 | 把「讀 → 判斷 → 寫」寫成單一條件式 `UPDATE` | 邏輯能用一條 SQL 表達（扣庫存、扣餘額） |
| 悲觀鎖 | `SELECT ... FOR UPDATE` 先鎖住要讀的 row | 衝突頻繁、重試成本高 |
| 樂觀鎖 | 加 `version` 欄位，寫入時檢查版本沒變 | 衝突少、讀多寫少 |
| Serializable + retry | 交給資料庫偵測衝突，失敗就整個重試 | 規則複雜、難以手動找出要鎖哪些 row |

原子更新：

```sql
UPDATE products SET stock = stock - 1
WHERE id = 42 AND stock > 0;   -- 檢查 affected rows 是否為 1
```

悲觀鎖（Write Skew 的例子要鎖住「被讀取來判斷」的那批 row，不只是要改的那筆）：

```sql
BEGIN;
SELECT * FROM doctors WHERE on_call = true FOR UPDATE;
-- 確認人數 >= 2 才繼續
UPDATE doctors SET on_call = false WHERE name = 'Alice';
COMMIT;
```

樂觀鎖：

```sql
SELECT balance, version FROM accounts WHERE id = 1;   -- 假設 version = 7
UPDATE accounts SET balance = :new_balance, version = version + 1
WHERE id = 1 AND version = 7;   -- affected rows 為 0 代表被別人改過，重讀後重試
```

選擇時的考量：

- **能用原子更新就先用**，最簡單也沒有額外鎖。
- 用 Serializable 或樂觀鎖時，應用程式**一定要有重試邏輯**，而且重試的是整個 transaction，不是單一 SQL。
- **Transaction 要短**：不要在 transaction 裡呼叫外部 API 或等使用者輸入，否則鎖持有過久、舊版本無法回收。
- 以餘額更新為例：同一個帳戶可能同時被多個請求扣款（例如同時送出多筆交易），用「讀出餘額 → 在程式算 → 寫回」就會 lost update；改成 `UPDATE ... SET balance = balance - :amount WHERE id = :id AND balance >= :amount`，或以 nonce / version 欄位做樂觀鎖。

## Consistency

Consistency 比較像是應用層的責任。資料庫用 constraint（PK、FK、`CHECK`、`UNIQUE`、`NOT NULL`）幫忙守住能用 schema 表達的規則；A、I、D 都做好，加上應用程式的邏輯正確，資料就會從一個合法狀態轉到另一個合法狀態。

注意這裡的 Consistency 和 [CAP](/backend/database#cap-定理) 的 Consistency 不是同一件事：ACID 的 C 指「資料符合規則」，CAP 的 C 指「所有節點讀到同一份最新資料」。

## 跨節點的 Transaction

單機靠 WAL 就夠了，跨多台機器（或多個資料庫）要用 **2PC（Two-Phase Commit）**：

1. **Prepare**：coordinator 問每個參與者能不能 commit。參與者把 redo / undo 寫好、鎖住資源，然後回答 yes 或 no。
2. **Commit / Abort**：全部說 yes 才 commit，任何一個說 no 就全部 abort。

缺點是 **blocking**：coordinator 在兩階段之間掛掉的話，已經回答 yes 的參與者不能自己決定 commit 或 abort，只能一直鎖著資源等待。

所以微服務常改用 **Saga**：每一步都是各服務自己的本地 transaction，某一步失敗時，依序執行前面步驟的**補償操作**（例如「扣款」的補償是「退款」）。換來的是最終一致性，過程中其他人可能看到中間狀態，補償操作也要設計成可重試、冪等。

| | 2PC | Saga |
| --- | --- | --- |
| 一致性 | 強一致 | 最終一致 |
| 隔離 | 有（資源全程鎖住） | 沒有，中間狀態可見 |
| 失敗處理 | 資料庫 rollback | 應用程式寫補償操作 |
| 可用性 | coordinator 掛掉會卡住 | 各步驟獨立，不會整體卡住 |

## 一句話總結

> Transaction 用 **WAL** 保證 A 和 D：commit 只要日誌落盤，當機時 redo 已 commit 的、undo 沒 commit 的。用 **MVCC 加上鎖** 保證 I，isolation level 決定 snapshot 的範圍和要防哪些異常。C 靠 constraint 與應用程式。跨節點用 **2PC** 或 **Saga**。

## Reference

- [What are Database Isolation Levels?](https://bytebytego.com/guides/what-are-database-isolation-levels/)
- [Pessimistic vs Optimistic Locking](https://bytebytego.com/guides/pessimistic-vs-optimistic-locking/)
- [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [MySQL: InnoDB Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html)
