---
title: "DataBase"
---

## 什麼是資料庫

使用資料庫時，通常會牽涉到三個部分：

```text
使用者 → 程式（前端 + 後端） → DBMS → 資料庫
```

- **資料庫**：實際存放資料的地方。
- **DBMS** (Database Management System)：管理資料庫的軟體，負責執行資料的新增、查詢、更新、刪除。平常說「用 MySQL」、「用 PostgreSQL」，指的其實是 DBMS；多數 DBMS 都看得懂 SQL。
- **程式**：讓使用者輸入、檢視資料的部分。以 Web 來說，使用者在前端輸入資料，後端再透過 DBMS 把資料存進資料庫。

## 使用資料庫的好處

讓程式和資料庫**解耦**：程式只透過 DBMS 存取資料，日後要換資料庫時，程式不需要大幅修改。

## 資料庫的分類

### RDBMS vs. NoSQL

- **關聯式資料庫 (RDBMS)**：開源的有 MySQL、PostgreSQL；付費的有 SQL Server、Oracle。見 [SQL DataBase](/backend/database/sql-database)。
- **非關聯式資料庫 (NoSQL)**：Key-Value（Redis、DynamoDB）、文件型（MongoDB、CouchDB）、圖形（Neo4j）。見 [NoSQL DataBase](/backend/database/nosql-database)。

### OLTP vs. OLAP

| | OLTP (Online Transaction Processing) | OLAP (Online Analytical Processing) |
| --- | --- | --- |
| 用途 | 快速處理交易，確保寫入正確 | 複雜分析與查詢，以讀取為主 |
| 場景 | 電商、銀行 | BI、財務報表、data warehouse |
| 例子 | MySQL、PostgreSQL、MongoDB | BigQuery、Redshift、ClickHouse |

### Row-oriented vs. Columnar

儲存方式通常對應上面的 OLTP / OLAP：

```text
Row-oriented（適合 OLTP）       Columnar（適合 OLAP）
Row 1: [1, "Alice", 50]         id:    [1, 2]
Row 2: [2, "Bob",   60]         name:  ["Alice", "Bob"]
                                score: [50, 60]
```

- **Row-oriented**：一整列存在一起，適合一次讀寫整筆資料。例如 MySQL、PostgreSQL、MongoDB。
- **Columnar**：同一欄存在一起，只讀需要的欄位、壓縮率高，適合大量聚合計算。例如 BigQuery、Redshift、ClickHouse。

### 伺服器型 vs. 檔案型

- **伺服器型**：需要安裝並啟動資料庫 server，多數 RDBMS 屬於這類。
- **檔案型**：一個檔案就是一個資料庫，例如 SQLite、Microsoft Access，適合資料量小、不會多人同時寫入的情境。

## SQL vs. NoSQL

| | SQL | NoSQL |
| --- | --- | --- |
| 資料模型 | 關聯式，資料存在 table 的 row 與 column，table 之間互相關聯 | 非關聯式，依需求選擇 key-value、document、column-oriented、graph |
| Schema | 預先定義且嚴格，寫入前要先規劃好結構 | 動態，可以隨時新增欄位，不同筆資料結構可以不同 |
| 擴展方式 | 以 vertical scaling 為主（升級單機）；sharding 可行但支援度較差 | 以 horizontal scaling 為主（加機器），多數內建 sharding |
| 一致性模型 | ACID，強調交易的正確性 | 以 CAP 取捨為主，常見最終一致性；MongoDB、DynamoDB 等也支援 ACID transaction |
| 社群與支援 | 歷史悠久，社群龐大、資源與專家多 | 較新，個別產品的社群較小 |
| 資料類型 | 結構化資料為主（現代 RDBMS 也能存 JSON 等半結構化資料） | 結構化、半結構化、非結構化都能存，可接受資料原本的格式 |
| 常見應用 | 金融與會計、POS 收銀、處方與訂單、ERP（人資、供應鏈）、需符合法規的資料 | 含影像文件的病歷與保險案件、影音串流與數位出版、社群與詐欺偵測、IoT 感測資料 |
| 例子 | MySQL、PostgreSQL、Oracle、Db2、CockroachDB | MongoDB、Redis、Cassandra、Elasticsearch、Neo4j |

SQL 傳統上難以水平擴展，是因為分散到多台機器後，以下幾件事都會變得困難：

- **ACID**：要在多個節點之間保證交易的正確性，成本很高。
- **交易協調**：同時進行的交易要跨節點協調，增加複雜度與資源消耗。
- **Schema 一致**：每個節點的 schema 版本都要保持一致。

CockroachDB、YugabyteDB 這類 distributed SQL 就是為了在水平擴展的同時保留 ACID 而設計的。

### 什麼時候選哪個

- **SQL**：資料彼此關聯、需要確保資料正確（如金流、訂單）。每筆資料只存在一個地方，更新一次就好，不會有新舊版本不一致的問題。
- **NoSQL**：資料量大且持續成長、需求常變動、比起強一致性更在意可用性與速度。依用途挑選：
  - 大量非結構化資料：document DB（MongoDB、CouchDB）
  - 快速 key-value 存取、不需要強一致性：Redis
  - 大量資料的全文或彈性搜尋：Elasticsearch
  - 跨多台機器的海量資料、無單點故障：Cassandra

### CAP 定理

分散式系統在發生網路分區時，無法同時保證以下三點：

- **Consistency**：每次讀取都拿到最新的資料，否則回傳錯誤。
- **Availability**：每個請求都會得到非錯誤的回應。
- **Partition tolerance**：節點之間的訊息延遲或遺失時，系統仍能運作。

分散式系統一定會遇到網路分區，所以實際上是在 **C 與 A 之間取捨**。CAP 適用於所有分散式資料庫，不是 NoSQL 專屬，只是 NoSQL 多半為了水平擴展而以分散式架構設計，才較常被拿來討論。

## Query
指的是對資料庫作查詢時，會寫出的資料庫 SQL 程式語言，所組合而成的語句。



## Transaction

交易功能，有些資料庫的操作流程，會一次需要多個 query ，而 transaction 的功能，就可以把這麼多的 query，當作一個統一的單位來操作，是設計安全且可靠的資料庫系統，不可或缺的一環。

交易有 ACID 特性：
- Atomicity（原子性）：只會是「全部執行」或「全部尚未執行」的其中一種狀態
- Consistency（ㄧ致性）：交易前後資料的完整性受到保持，例如透過定義 Model Schema
- Isolation（隔離性）：交易執行時，其他使用者看不到正在處理的資料，也不會受到影響
- Durability（持久性）：交易完成後將永久被儲存

## 資料庫維運的挑戰

- **資料量暴增**：感測器、連網設備等來源持續湧入資料，需要有效率地整理與管理。
- **資料安全**：既要防止外洩，又要讓有權限的人方便存取。
- **即時存取**：業務決策需要即時的資料，查詢要能快速回應。
- **維護成本**：要持續監控、做預防性維護、升級與上 [patch](/devops/patch)；資料庫越複雜，需要的人力越多。
- **擴展性**：很難預估未來需要多少容量，自建機房 (on-premises) 尤其難。
- **資料落地與延遲**：有些資料依法規必須存放在特定地區 (data residency / sovereignty)，或有低延遲需求，只能放在自建機房。

雲端的 managed database（如 Amazon RDS、Cloud SQL、Oracle Autonomous Database）會自動處理備份、patch、擴展等工作，減輕這些維運負擔。

## Reference

- [什麼是資料庫？](https://www.oracle.com/tw/database/what-is-database/)
- [[DB] 資料庫基礎 Database Basic](https://pjchender.dev/database/database-basic/)
- [SQL vs. NoSQL Databases: What's the Difference?](https://www.ibm.com/think/topics/sql-vs-nosql)
- [NoSQL vs. SQL Databases](https://www.mongodb.com/resources/basics/databases/nosql-explained/nosql-vs-sql)