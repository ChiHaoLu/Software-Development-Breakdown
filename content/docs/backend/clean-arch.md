---
title: "Clean Architecture"
---

```
/
├── cmd/
│   ├── api/           # HTTP server entry point
│   └── worker/        # Background worker entry point
├── internal/
│   ├── domain/        # 核心業務邏輯 (entities, interfaces)
│   ├── repository/    # 資料存取層
│   ├── service/       # 業務邏輯層
│   ├── handler/       # HTTP handlers
│   └── middleware/    # Auth, logging, rate limit
├── pkg/
│   ├── config/        # 設定管理
│   ├── logger/        # Structured logging
│   └── validator/     # Input validation
├── migrations/        # DB migrations
└── docker-compose.yml
```