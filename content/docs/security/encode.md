---
title: "Encode"
---

## 🔡 常見的 Encoding（編碼）

編碼（Encoding）是將資料轉成某種格式，以便儲存或傳輸。它不涉及安全性，只是資料格式的轉換。

| 編碼方式                         | 特點與用途                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| **Base64**                   | 最常見的編碼方式。將二進位轉成文字（A-Z, a-z, 0-9, +, /）。常用於圖片、JWT、email 內嵌資料。 |
| **Hex（十六進位）**                | 將二進位轉成 0-F。常見於雜湊值（如 SHA-256）表示、Ethereum address。             |
| **URL Encoding**             | 把非 URL 安全字元轉成 `%XX`。例如空白變 `%20`，用於網址參數。                      |
| **UTF-8**                    | 最常見的 Unicode 編碼格式。支援全球多語言。                                   |
| **ASCII**                    | 英文與控制字元的基本編碼格式。                                              |
| **Base32 / Base58 / Base62** | 更短或更適合某些應用的文字編碼。例如 Bitcoin 使用 Base58。                        |

---

## 🔐 JWT（JSON Web Token）

JWT 是一種用來在兩方之間安全傳遞資訊的標準格式（RFC 7519），常用於身份驗證（Authentication）和授權（Authorization）。

### ✅ 結構（由三部分組成）：

```text
xxxxx.yyyyy.zzzzz
```

* **Header**：說明使用的演算法和類型，例如：

  ```json
  {
    "alg": "HS256",
    "typ": "JWT"
  }
  ```
* **Payload**：實際的資料內容（不可加密），例如：

  ```json
  {
    "sub": "1234567890",
    "name": "Alfred",
    "iat": 1710000000
  }
  ```
* **Signature**：用密鑰對 Header 和 Payload 簽名，確保資料未被竄改。

> 三個部分都使用 **Base64URL encoding** 處理（類似 Base64，但去除 `+`, `/`, `=` 以適應 URL）。

---

### 📌 常見簽名演算法（alg）

| 演算法   | 類型          | 說明                      |
| ----- | ----------- | ----------------------- |
| HS256 | 對稱式（HMAC）   | 使用同一密鑰進行簽名與驗證           |
| RS256 | 非對稱式（RSA）   | 使用私鑰簽名、公鑰驗證             |
| ES256 | 非對稱式（ECDSA） | 使用 elliptic curve，較短更安全 |

---

### 🧠 JWT 的應用場景

* Web 登入的 Token-based 認證（取代 session）
* OAuth 2.0 / OpenID Connect 的 access token、ID token
* 微服務之間的身份驗證
* API 授權控制（scopes）

---

### 🚫 JWT 的常見誤用警告

* **不要儲存敏感資料**（如密碼）在 Payload，因為它是明文 Base64 可解碼。
* 避免使用無簽名的演算法（如 `alg: none`）。
* 要妥善管理 token 的過期（`exp`）與更新機制。

太好了！以下是更實用的補充，包括：

---

## 🧪 JWT 範例與解碼說明

### 🔧 JWT 範例

這是一個典型的 JWT：

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsZnJlZCIsImlhdCI6MTUxNjIzOTAyMn0.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

### 🧩 各部分解碼後的內容：

#### Header（Base64URL decode）

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

#### Payload（Base64URL decode）

```json
{
  "sub": "1234567890",
  "name": "Alfred",
  "iat": 1516239022
}
```

#### Signature（驗證這兩段內容是否被竄改）

這段由伺服器使用密鑰產生：

```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

---

## 🛠 線上工具推薦

| 工具                                                | 用途                               |
| ------------------------------------------------- | -------------------------------- |
| [jwt.io](https://jwt.io/)                         | JWT 解碼與簽名演算法視覺化，支援 HS256/RS256 等 |
| [base64decode.org](https://www.base64decode.org/) | Base64 解碼工具                      |
| [CyberChef](https://gchq.github.io/CyberChef/)    | 超強萬用編碼/解碼/加密工具                   |

---

## 🧑‍💻 JWT 程式碼範例（使用 JavaScript）

### 用 `jsonwebtoken` 套件產生 JWT：

```bash
npm install jsonwebtoken
```

```js
const jwt = require('jsonwebtoken');

const payload = {
  sub: "1234567890",
  name: "Alfred",
  iat: Math.floor(Date.now() / 1000),
};

const secret = 'my-secret';

const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
console.log(token);
```

### 驗證 JWT：

```js
const decoded = jwt.verify(token, secret);
console.log(decoded);
```

---

## 🤔 常見 JWT Payload 欄位（Claim）

| 欄位    | 意義                   |
| ----- | -------------------- |
| `iss` | 發行者 (issuer)         |
| `sub` | 主體 (subject)         |
| `aud` | 受眾 (audience)        |
| `exp` | 過期時間（Unix timestamp） |
| `nbf` | 在此時間前不接受（Not before） |
| `iat` | 發行時間（Issued at）      |
| `jti` | JWT ID，唯一識別碼         |