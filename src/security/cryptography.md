# Cryptography

- [密碼學筆記](https://easonwang.gitbook.io/crypto)：這個蠻讚的，最基本該會的裡面都有提到
- 這四個是不同的要注意：Hash vs Encode vs Encrypt vs Sign

## 🔐 1. 加密演算法（Encryption Algorithms）

### 📦 分類一：對稱式加密（Symmetric Encryption）

* 加密與解密使用 **同一把密鑰**（速度快，適合大量資料）

| 演算法                                   | 特點與用途                                      |
| ------------------------------------- | ------------------------------------------ |
| **AES**（Advanced Encryption Standard） | 最常用，支援 128/192/256 位元金鑰。用於 HTTPS、VPN、檔案加密等 |
| **ChaCha20**                          | 快速且安全，Google 推薦用於行動裝置（如 TLS 1.3）           |
| **DES / 3DES**                        | 舊演算法，已逐漸淘汰（DES 安全性太低，3DES 效能差）             |
| **RC4**                               | 流加密，已被淘汰（有漏洞）                              |

> 對稱加密常搭配訊息認證（如 AES-GCM、ChaCha20-Poly1305）以確保資料完整性。

---

### 🔐 分類二：非對稱加密（Asymmetric Encryption）

* 使用 **公開金鑰加密**、**私密金鑰解密**，適合用於身份驗證與加密小量資料

| 演算法                                  | 特點與用途                                          |
| ------------------------------------ | ---------------------------------------------- |
| **RSA**                              | 最常見的非對稱加密，常用於 HTTPS/TLS、SSH、公私鑰簽名等             |
| **ECC（Elliptic Curve Cryptography）** | 更短金鑰達同等安全性，速度快，常見於行動裝置與區塊鏈（如 Bitcoin、Ethereum） |
| **ElGamal**                          | 數論加密，與 RSA 不同基礎，在某些 PGP 實作中使用                  |

---

## ✍️ 2. 簽章演算法（Digital Signature Algorithms）

數位簽章用來保證資料：

* **來源真實**（身份驗證）
* **內容未被竄改**（完整性）

| 演算法                                                   | 加密基礎                     | 特點與用途                                   |
| ----------------------------------------------------- | ------------------------ | --------------------------------------- |
| **RSA-SHA256**                                        | RSA + 雜湊                 | 傳統簽章，廣泛用於 JWT、TLS、數位憑證                  |
| **ECDSA**（Elliptic Curve Digital Signature Algorithm） | ECC + 雜湊                 | 區塊鏈主流簽章（Bitcoin, Ethereum）、TLS、JWT      |
| **EdDSA**（如 Ed25519）                                  | Curve25519               | 高速、固定長度簽章，近年越來越受歡迎（如 Signal、DNSSEC、SSH） |
| **DSA**                                               | 古老演算法，現已被 ECDSA 和 RSA 取代 |                                         |

---

## 🔄 3. 常搭配的雜湊演算法（Hash）

這些不加密資料，但用來產生摘要或簽章前的輸入：

| 演算法                 | 用途                            |
| ------------------- | ----------------------------- |
| **SHA-256**         | 簽章、資料指紋、區塊鏈（Bitcoin）          |
| **SHA-512**         | 更強安全性，但較長                     |
| **SHA-3 / Keccak**  | 新一代 SHA 系列，Ethereum 使用 Keccak |
| **BLAKE2 / BLAKE3** | 比 SHA-3 更快，逐漸被接受              |

---

## 🧰 4. 實際應用場景整理

| 應用情境                  | 使用技術                                                     |
| --------------------- | -------------------------------------------------------- |
| **HTTPS（SSL/TLS）**    | RSA/ECDSA 簽章、AES/ChaCha20 對稱加密、SHA 雜湊                    |
| **JWT**               | RS256（RSA+SHA256）、ES256（ECDSA+SHA256）簽章                  |
| **SSH 登入**            | RSA/ECDSA/Ed25519 公私鑰簽章                                  |
| **PGP 電子郵件加密**        | RSA 或 ElGamal 非對稱加密 + AES 對稱加密                           |
| **區塊鏈簽章**             | Bitcoin: ECDSA secp256k1，Ethereum: Keccak256 + secp256k1 |
| **Signal / WhatsApp** | Double Ratchet（結合 Curve25519、AES、SHA256）                 |