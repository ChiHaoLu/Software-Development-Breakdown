---
title: "NoSQL DataBase"
---

## What is NoSQL
NoSQL Database（Not only Structured Query Language）泛指非關聯式的資料庫，不以固定 schema 的 table 儲存資料。

常見的資料形式包含：pictures, audio files, videos, and maps。

所以這些 data 不能被傳統的 SQL 直接分析或計算，這些資料是 non-tabular 和 non-relational，但他們仍然支援 SQL-like query languages。

資料可能長這樣：

```json
{
  "_id": "u1",
  "name": "Alice",
  "orders": [
    { "id": "o1", "amount": 100, "items": ["book", "pen"] }
  ]
}
```

## NoSQL 的種類

| 類型 | 資料模型 | 適合 | 例子 |
| --- | --- | --- | --- |
| Document | 類似 JSON 的 document，可巢狀、每筆欄位可不同 | 結構多變的資料、內容管理、使用者資料 | MongoDB、CouchDB |
| Key-Value | 一個唯一的 key 對應一個 value | cache、session、設定值 | Redis、DynamoDB |
| Wide-Column | 以 row key 存取，每列可以有不同的 column，column 再分組成 family | 海量、稀疏、需要水平擴展的資料 | Cassandra、HBase、ScyllaDB |
| Graph | node 存實體，edge 存實體之間的關係 | 社群網路、推薦系統、階層結構 | Neo4j、Amazon Neptune |

- **Document**：每個 document 就是一筆紀錄，可以包含數字、字串、布林、陣列、巢狀物件。document 的結構和程式語言裡的物件很接近，通常不需要 ORM 就能直接對應。
- **Key-Value**：只能用 key 查詢 value，例如 key 是 `"color"`、value 是 `"purple"`。模型最簡單，所以讀寫最快。
- **Wide-Column**：又稱 column-family store。它和 OLAP 的 columnar 儲存不一樣：資料仍然以 row key 為單位存取，只是每一列的欄位可以不同，適合欄位很多但大多是空值的資料。
- **Graph**：查詢「關係」是它的強項，例如「朋友的朋友」這類多層關聯。同樣的查詢如果用 SQL，要做好幾次 `JOIN`。

## What is SQL-like query languages
為了讓熟悉 SQL 的人容易上手，很多 NoSQL 資料庫設計了**語法很像 SQL** 的語言。例如 Cassandra 的 CQL：

```sql
SELECT name, email FROM users WHERE user_id = 'u1';
```

看起來跟 SQL 幾乎一模一樣，但能做的事少很多：

- **不支援 `JOIN`**：資料要事先依照查詢需求設計好，通常會冗餘存好幾份。
- **`WHERE` 只能用在特定欄位上**：通常只能用 partition key 或有建 index 的欄位當條件。
- **沒有跨資料表的 transaction**。

所以「SQL-like」的意思是**語法像 SQL，但背後的資料模型和能力都不一樣**，不能當成真的 SQL 來用。

### 常見的例子

| 資料庫 | 查詢語言 | 跟 SQL 的相似度 |
| --- | --- | --- |
| Cassandra | CQL | 語法非常像，但沒有 JOIN |
| Couchbase | SQL++ (N1QL) | 像 SQL，並且擴充了 JSON 巢狀查詢 |
| Elasticsearch | Elasticsearch SQL | 在原本的搜尋 API 上加一層 SQL 介面 |
| MongoDB | MQL | 不像 SQL，是 JSON 格式的查詢（另有 Atlas SQL 介面） |
| Neo4j | Cypher | 不像 SQL，是專門查圖形結構的語言 |
