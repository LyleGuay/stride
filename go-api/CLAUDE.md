# go-api/CLAUDE.md

Go backend (Gin + PostgreSQL via pgx) for Stride. See the root `CLAUDE.md` for project-wide conventions.

## Commands

```bash
go run .                  # Start server on localhost:3000
go run ./cmd/migrate      # Apply pending migrations
go run ./cmd/create-user  # Interactive user creation (prompts for username/email/password)
go mod tidy               # Manage dependencies
go build ./...            # Type-check without running
```

**Migrations gotcha:** migration files live at `db/migrations/` (repo root), **not** inside `go-api/`. The migrate CLI resolves `../db/migrations` relative to `go-api/`. Run `./cmd/migrate` from inside `go-api/`.

## Architecture

**Framework:** Gin. Routes registered in `handler.go:registerRoutes`. One public route (`/api/login`), everything else behind `authMiddleware` which validates the JWT and sets `user_id` in the context.

**`Handler` struct** (`handler.go`): holds `*pgxpool.Pool` and `openAIBaseURL` (overridable for tests). All route handlers are methods on `*Handler`.

**Database access** — two generic helpers:
- `queryOne[T](pool, ctx, sql, args) (T, error)` — scans first row into `T` via `pgx.RowToStructByName`.
- `queryMany[T](pool, ctx, sql, args) ([]T, error)` — same, for all rows.

Use `pgx.NamedArgs{"key": value}` for params and `@key` in SQL. Struct tags: ``db:"column_name"`` for scan binding, ``json:"field"`` for HTTP serialization.

**Neon compat:** the pool is configured with `QueryExecModeSimpleProtocol` to avoid "cached plan must not change result type" errors after schema changes.

**Error responses:** call `apiError(c, status, "message")` — returns `{"error": "message"}` consistently.

**Request structs** live in `models.go`. Create requests use `binding:"required"` tags; update requests use pointer fields so omitted keys mean "don't change."

## Migrations

- **Location:** `db/migrations/` at repo root (not `go-api/`).
- **Naming:** `YYYY-MM-DD-SEQ-name.sql` (e.g. `2026-04-12-001-meal-plan-entries.sql`).
- **Content:** pure DDL — no `IF NOT EXISTS` guards, no data backfills. The migrate CLI tracks applied files in the `migrations` table and wraps each in a transaction.
- **One-off scripts:** data imports and ad-hoc cleanups live in `db/misc/` and are not run automatically.
- **Running against a non-local DB:** `DB_URL="postgresql://..." go run ./cmd/migrate`. Inline env var overrides `.env`.

## Database conventions

- **Enums** are named `{table}_{column}` (e.g. `calorie_log_item_type`, `habit_frequency`, `meal_plan_entry_type`).
- **Tables** (current):
  `users`, `migrations`,
  `calorie_log_items`, `calorie_log_user_settings`, `calorie_log_favorites`, `calorie_log_config_history`,
  `weight_log`,
  `recipes` (+ ingredients/tools/steps columns),
  `habits`, `habit_logs`,
  `journal_entries`, journal tags,
  `tasks`, `task_tags`,
  `meal_plan_entries`.

## Features & endpoints

Each feature is in its own `.go` file. Routes are registered in `handler.go` and roughly ordered to keep static paths before `:id` params (Gin otherwise captures them as IDs — see existing comments in `handler.go`).

### Auth — `auth.go`

- `POST /api/login` — returns `{ token }` JWT. Public route.
- User creation via CLI only: `go run ./cmd/create-user`.

### Calorie Log — `calorie_log.go`, `user_settings.go`, `tdee.go`

- CRUD: `POST/PUT/DELETE /api/calorie-log/items[/:id]`.
- Reads: `GET /api/calorie-log/daily?date=YYYY-MM-DD`, `GET /api/calorie-log/week-summary?week_start=...`, `GET /api/calorie-log/progress?range=...`, `GET /api/calorie-log/earliest-date`.
- Settings: `GET/PATCH /api/calorie-log/user-settings` — stores sex/DOB/height/weight/activity/budget, plus `budget_auto` (when true, budget is derived from TDEE).
- `tdee.go`: pure TDEE/pace helpers (good unit-test targets).
- `calorie_log_items.meal_plan_entry_id` links a logged item to a meal plan entry (see Meal Planning below).

### AI Suggestion — `suggest.go`

- `POST /api/calorie-log/suggest` — takes `{ description, type }`, calls OpenAI `gpt-4o-mini`, returns structured `{ item_name, qty, uom, calories, protein_g, carbs_g, fat_g }`.
- For `type: 'exercise'`, loads the user's body stats from DB to improve calorie-burn estimates.
- Returns `{"error": "unrecognized"}` (200) for unparseable input or `{"error": "openai request failed"}` (500) on API errors.

### Favorites — `favorites.go`

- `GET/POST /api/calorie-log/favorites`, `DELETE /api/calorie-log/favorites/:id`.
- Stores pre-filled items for quick logging via the inline add row dropdown.

### Weight Log — `weight_log.go`

- `GET /api/weight-log`, `POST /api/weight-log` (upsert-by-date), `PUT/DELETE /api/weight-log/:id`.

### Recipes — `recipes.go`, `recipes_ai.go`

- CRUD: `GET /api/recipes`, `POST /api/recipes`, `GET/PUT/DELETE /api/recipes/:id`.
- `POST /api/recipes/:id/duplicate` — clones a recipe.
- `POST /api/recipes/generate` — AI-generate a full recipe from a prompt.
- `POST /api/recipes/:id/ai-modify` / `ai-copy` / `ai-nutrition` — AI-assisted edits.
- Recipes have ingredients, tools, steps, and nutrition fields. When logged to the calorie log at N servings, calories/macros are snapshotted (scaled by N / `recipe.servings`) into `calorie_log_items`.

### Habits — `habits.go`

- CRUD: `GET /api/habits`, `POST /api/habits`, `PATCH/DELETE /api/habits/:id`, `POST /api/habits/:id/archive`.
- `GET /api/habits/week` — weekly view with proportional level aggregation.
- `GET /api/habits/:id/logs` — per-habit log history.
- `PUT /api/habit-logs` — upsert a log entry (level 0–3 indicating "none"/partial/full).

### Journal — `journal.go`

- Entries CRUD: `GET/POST /api/journal`, `PUT/DELETE /api/journal/:id`.
- Summary views: `GET /api/journal/calendar`, `GET /api/journal/summary?range=week|month|6m|1y|all`, `GET /api/journal/tag-days`.
- Entries are additively scored (mood, mental-state bars) and tagged. Entry body is Markdown.

### Tasks — `tasks.go`

- CRUD: `GET /api/tasks?tab=today|upcoming|all`, `POST /api/tasks`, `GET/PATCH/DELETE /api/tasks/:id`.
- Completion: `PATCH /api/tasks/:id/complete` (returns `next_scheduled_date` for recurring tasks), `PATCH /api/tasks/:id/complete-forever` (permanent), `DELETE /api/tasks/:id/completions/latest` (undo most recent completion).
- `GET /api/tasks/overdue-count` — badge for the sidebar.
- Tasks have `scheduled_date`, `deadline`, and `recurrence` fields. A recurring task completion returns a new scheduled date and keeps the task in the active list.

### Meal Planning — `meal_plan.go`

- Entries CRUD: `GET /api/meal-plan/entries?date=|week_start=`, `POST /api/meal-plan/entries`, `PUT/DELETE /api/meal-plan/entries/:id`.
- `POST /api/meal-plan/copy-week` — bulk-copy entries from one week to another (filter by day and meal type).
- Entry types: `food`, `takeout`, `recipe`. For recipe entries, calories/macros are snapshotted at save time (scaled by servings).
- When a planned item is logged to the calorie log, the created `calorie_log_items` row carries `meal_plan_entry_id` so the frontend can show it as "logged" and suppress the ghost row.

## Testing

**Tooling:** Go's built-in `testing` package. No third-party framework.

**Test:**
- Pure functions with meaningful logic (`computeTDEE`, `currentMonday`, any extracted validation). Clear inputs/outputs and real edge cases.
- Handler integration tests (when written) — use `net/http/httptest` against a real test PostgreSQL database, not mocks. Tests the real SQL and catches constraint violations.

**Skip:**
- Handlers that are a straight pass-through to the DB — that's testing pgx and PostgreSQL, not our code.
- Anything that would only fail if a library is broken.

Run: `go test ./...`.

## Environment variables

Set in `go-api/.env` (gitignored):

- `DB_URL` — PostgreSQL connection string.
- `OPENAI_API_KEY` — required for `/suggest` and all recipe AI endpoints.
- `OPENAI_BASE_URL` — optional; defaults to `https://api.openai.com`. Override for testing/proxying.

For local development pointed at a Neon development branch, swap `DB_URL` in `.env`. For prod migrations, pass inline: `DB_URL="..." go run ./cmd/migrate`.
