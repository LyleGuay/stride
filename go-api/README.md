# go-api

Go backend for Stride. Gin HTTP server backed by PostgreSQL (hosted on Neon in production).

## Stack

- **[Gin](https://gin-gonic.com/)** — HTTP router
- **[pgx](https://github.com/jackc/pgx)** — PostgreSQL driver with connection pooling
- **[godotenv](https://github.com/joho/godotenv)** — `.env` loading for local dev

## Commands

```bash
go run .                  # Start the server (localhost:3000)
go run ./cmd/migrate      # Apply pending migrations from migrations/
go run ./cmd/create-user  # Create a user (prompts for username, email, password)
go mod tidy               # Sync dependencies
go test ./...             # Run unit tests
go build .                # Compile binary
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `DB_URL` | PostgreSQL connection string |
| `PORT`   | Port to listen on (default: `3000`; injected by Railway in production) |

Create a `.env` file in this directory for local development:

```env
DB_URL=postgresql://user:password@localhost:5432/stride
```

## Project layout

```
go-api/
  main.go           # Entry point — loads env, creates DB pool, starts server
  handler.go        # Handler struct, DB helpers (queryOne/queryMany), route registration
  models.go         # Domain types: DateOnly, CalorieLogItem, UserSettings, etc.
  auth.go           # POST /api/login, authMiddleware (JWT bearer token)
  calorie_log.go    # Calorie log CRUD endpoints + daily/weekly summary
  user_settings.go  # GET/PATCH /api/calorie-log/user-settings
  tdee.go           # TDEE computation, currentMonday(), activityMultipliers
  tdee_test.go      # Unit tests for computeTDEE and currentMonday
  cmd/
    migrate/        # CLI: applies pending SQL migrations from migrations/
    create-user/    # CLI: creates a user account interactively
  migrations/       # Plain SQL migration files (YYYY-MM-DD-SEQ-name.sql)
  static/           # Embedded compiled frontend (copied from web-client/dist at build)
```

## API routes

All routes under `/api` except `/api/login` require a `Authorization: Bearer <token>` header.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/login` | Authenticate and receive a token |
| `GET` | `/api/calorie-log/daily` | Daily summary + items for a given date (`?date=YYYY-MM-DD`) |
| `GET` | `/api/calorie-log/week-summary` | 7-day summary starting from a Monday (`?date=YYYY-MM-DD`) |
| `POST` | `/api/calorie-log/items` | Add a calorie log item |
| `PUT` | `/api/calorie-log/items/:id` | Update a calorie log item |
| `DELETE` | `/api/calorie-log/items/:id` | Delete a calorie log item |
| `GET` | `/api/calorie-log/user-settings` | Fetch user settings (includes computed TDEE/budget) |
| `PATCH` | `/api/calorie-log/user-settings` | Update user settings |

## Migrations

Migrations are plain SQL files in `migrations/`, named `YYYY-MM-DD-SEQ-name.sql`. The migrate CLI wraps each in a transaction and tracks applied migrations in a `migrations` table — re-running is safe.

```bash
DB_URL=... go run ./cmd/migrate
```

## Production

The compiled binary embeds the React frontend from `static/` (copied from `web-client/dist` by the Dockerfile). In production on Railway, `DB_URL` and `PORT` are injected as environment variables — no `.env` file is used.
