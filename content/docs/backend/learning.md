---
title: "建議的學習階段與實作順序"
---

我建議把專案分成 **6 個 Phase**，每個 phase 專注特定技能：

### Phase 1: 基礎架構 + Clean Architecture
**學習重點**: struct, interface, dependency injection, project structure

```
stocks/
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

### Phase 2: 資料庫 + Repository Pattern
**學習重點**: PostgreSQL, GORM/sqlc, transaction handling

- 實作 User, Tier, Stock, News, Delivery repositories
- 學會 migration 管理
- 實作 Redis cache layer

### Phase 3: HTTP Server + Middleware
**學習重點**: RESTful API, middleware chain, error handling

- User CRUD + Auth (Google OAuth)
- Stock management APIs
- Middleware: Auth, Logger, RateLimit, Recovery

### Phase 4: Background Workers + Concurrency
**學習重點**: goroutine, channel, worker pool, context timeout, graceful shutdown

- Google Sheet sync worker
- Digest generation worker (這裡用 worker pool)
- Email sending worker
- 實作 graceful shutdown

### Phase 5: 外部服務整合
**學習重點**: External API handling, retry, circuit breaker

- Google Sheet API 串接
- SendGrid/SES 串接
- 藍新/綠界 payment webhook

### Phase 6: 可觀測性 + 生產就緒
**學習重點**: Observability, monitoring, deployment

- Structured logging (zerolog/zap)
- Prometheus metrics
- Health check endpoints
- Docker + docker-compose
