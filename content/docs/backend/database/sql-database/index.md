---
title: "SQL DataBase"
---

SQL Database 也就是關聯式資料庫 (Relational Database, RDBMS)：資料存成由 row 與 column 組成的 table，table 之間透過 key 建立關聯，並以 SQL 操作。

- [SQL 語言](/backend/database/sql-database/sql)：SQL 語法、JOIN、Transaction、Index 與在應用程式中使用 SQL 的筆記。

## What is structured data?

結構化資料的意思他的編排是固定的，format 等都是預先定義好的。

| 類型 | 特徵 | 例子 |
| --- | --- | --- |
| 結構化 | 欄位與型別固定 | 訂單、使用者、交易紀錄 |
| 半結構化 | 有欄位標籤，但每筆欄位可不同、可巢狀 | JSON、XML、log |
| 非結構化 | 沒有預先定義的格式 | 文章、圖片、影片 |

關聯式資料庫使用固定 schema，寫入的資料必須符合預先定義的格式，因此最適合結構化資料。補充兩點：

- 半結構化資料也能存：PostgreSQL 的 `JSONB`、MySQL 的 `JSON` 可以儲存並查詢 JSON。
- 非結構化資料可以存成 `BLOB`，但無法用 SQL 查詢內容，實務上通常放在 object storage（如 S3），資料庫只存路徑。

## SQL Database 與 SQL 語言

兩者常被混著叫「SQL」，但指的是不同層次的東西：

| | SQL Database | SQL 語言 |
| --- | --- | --- |
| 是什麼 | 一種資料庫系統（軟體） | 一種查詢與操作資料的語言 |
| 負責 | 儲存資料、執行查詢、維護 index、處理 transaction 與權限 | 描述「要做什麼」：查哪些資料、改哪些結構、給誰權限 |
| 例子 | PostgreSQL、MySQL、SQLite、Oracle | `SELECT`、`CREATE TABLE`、`GRANT` |
| 差異來源 | 儲存引擎、效能、擴展方式、功能、授權 | 各家在標準 SQL 之上的方言（函式、型別、語法細節） |

可以類比成「瀏覽器」與「JavaScript」：SQL 是共通的語言，SQL Database 是實際執行它的引擎，同一段標準 SQL 大多能在不同資料庫上執行，但進階語法與效能表現會因資料庫而異。

## 關聯式資料庫的特性

> Relational databases, or relational database management systems (RDBMSs)

![關聯式資料庫以 table 儲存資料，table 之間透過 ID 欄位互相關聯](relational-db.png)

- **事先定義 schema**：每張 table 的欄位、型別與 constraint 在寫入前就要決定，資料格式由資料庫保證。
- **以 key 建立關聯**：用 primary key 識別每一列，用 foreign key (e.g., unique identifiers) 指向其他 table，查詢時再用 `JOIN` 組合。
- **支援 transaction 與 ACID**：多個寫入可以包成一個交易，全部成功或全部失敗，適合金流、訂單、庫存這類要求一致性的資料。
- **查詢彈性高**：資料正規化後，可以用 SQL 從不同角度組合查詢，不必事先為每種讀取方式設計資料格式。
- **擴展以 vertical scaling 為主**：單機升級最直接；水平擴展需要 read replica、partitioning 或 sharding，複雜度較高。


## 什麼時候選 SQL Database

| 適合 | 不一定適合 |
| --- | --- |
| 資料結構穩定、關聯多（使用者、訂單、商品） | 結構常變動或每筆欄位差異很大的文件型資料 |
| 需要強一致性與 transaction | 極高寫入量、可接受最終一致性的場景（log、事件流） |
| 需要彈性的查詢、報表與聚合 | 只用 key 存取、追求極低延遲（cache、session） |

不確定時，關聯式資料庫（尤其 PostgreSQL）通常是穩妥的預設選擇；之後遇到特定瓶頸，再針對該部分引入 NoSQL。

## 常見的 SQL Database

| 資料庫 | 特色 | 常見場景 |
| --- | --- | --- |
| PostgreSQL | 開源的 object-relational DB，源自 UC Berkeley 的 POSTGRES 專案；功能豐富，支援 JSONB、CTE、window function 與 extension | 通用首選、需要複雜查詢的服務 |
| MySQL | 開源、易用、社群龐大，現由 Oracle 開發；InnoDB 引擎支援 transaction | Web 應用、讀多寫少的服務 |
| MariaDB | MySQL 被 Oracle 收購後分支出來的開源替代品，與 MySQL 高度相容 | 想避開 Oracle 授權的 MySQL 使用者 |
| SQLite | 一個函式庫而非 server：嵌入在應用程式內、單一檔案、零設定 | 行動 App、桌面軟體、測試、小型工具 |
| Oracle | 商用，全球最常見的企業級資料庫之一 | 金融、電信等大型企業系統 |
| SQL Server (MSSQL) | Microsoft 開發，擅長大量交易處理、BI 與分析 | .NET / Windows 環境的企業系統 |

其他類型的資料庫也能表達資料之間的關聯，只是方式不同：關聯式資料庫用 foreign key 或中介表 (intersection table)；MongoDB 這類 NoSQL 則用嵌入 (embedding) 或引用 (referencing)。

## 各資料庫優缺點

整理自 [後端工程師的第一堂課 (15)：資料庫 — 介紹與比較](https://medium.com/johnliu-%E7%9A%84%E8%BB%9F%E9%AB%94%E5%B7%A5%E7%A8%8B%E6%80%9D%E7%B6%AD/%E5%BE%8C%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%AB%E7%9A%84%E7%AC%AC%E4%B8%80%E5%A0%82%E8%AA%B2-15-%E8%B3%87%E6%96%99%E5%BA%AB-%E4%BB%8B%E7%B4%B9%E8%88%87%E6%AF%94%E8%BC%83-b942818e4b15)（2022）。

### MySQL

- **優點**：開源、更新快；跨語言、跨作業系統；多執行緒，能充分利用資源；社群活躍、資料好找；使用成本低。
- **缺點**：原文認為效能較適合中小型應用、安全機制較弱且設定複雜（多指早期版本，現代 InnoDB 已大幅改善）。
- MySQL 本身沒有圖形介面，MySQL Workbench、phpMyAdmin 是另外的操作工具，不要搞混。

- [一小时MySQL教程](https://www.youtube.com/watch?v=nZlH5in_660&ab_channel=GeekHour)

### PostgreSQL

- **優點**：開源且由社群主導（不屬於單一公司）；transaction 等核心機制驗證嚴謹；stored procedure、view 等進階功能比 MySQL 強；內建地理資料型別與函式（PostGIS），適合地理相關應用。
- **缺點**：功能多、體積較大，對小型伺服器是負擔。原文另提到「複雜查詢效能較差」，但這點有爭議，PostgreSQL 的 query planner 通常被認為很擅長複雜查詢。
- 沒有特殊需求時，PostgreSQL 與 MySQL 都是可以任選的通用資料庫。

- [PostgreSQL Tutorial](https://www.postgresqltutorial.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/current/)

### SQL Server

- **優點**：與微軟生態系（C#、報表、BI 工具）整合佳；學習曲線低，內建圖形化管理工具；transaction 安全控制良好。
- **缺點**：專有軟體、原始碼封閉，社群討論較少；引擎較吃資源。
- 過去幾乎只能用在微軟環境，現在相容性已提升（也支援 Linux）。

### Oracle

- **優點**：安全性高，具最高等級的認證；大型運算與查詢效能出色；功能齊全（多種儲存格式、synonym、package 等）。
- **缺點**：授權昂貴、硬體要求高；學習門檻高，需要資深人員支援。
- 主要用在銀行、政府機關等大型組織，新創與個人專案很少使用。
