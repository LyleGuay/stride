# CLAUDE.md

## Core Behavior

- **Do only what is asked.** Do not refactor, reorganize, or "improve" code outside the scope of the current task.
- **Do not make assumptions.** If something is unclear, ask before proceeding. Do not guess at intent, architecture decisions, or business logic.
- **Verify before deleting or replacing.** Check that code is unused before removing it. Check that your replacement is functionally equivalent before rewriting.
- **Make minimal changes.** The smallest diff that solves the problem is the best diff.
- **If you're unsure, say so.** Flag uncertainty as an open question rather than making a best guess.

## Token Efficiency

- Do not read files you don't need. If the task is about `auth.controller.ts`, do not explore unrelated directories.
- Do not re-read files you've already read in this session unless they've changed.
- Keep responses concise. No preamble, no restating the task back to me, no "great question" filler.
- Batch related edits into a single operation when possible.
- When running commands, combine related checks (e.g., `npm run build && npm test`) rather than running them one at a time.

## Sub Agents / Task Tool

- Spawn sub agents freely when they'd speed things up or keep the main context clean.
- Common good uses: research, running tests, exploring unfamiliar code, reading many files, independent parallel work.
- **Don't spawn for trivial work** that takes 1-2 tool calls — just do it directly.
- Sub agents must have a specific, scoped instruction. No vague "look into this."
- Spawn multiple sub agents in parallel when the tasks are independent.
- **Model selection:** Use opus for anything requiring judgment or complex reasoning. Use sonnet for straightforward tasks (file reading, simple searches). Use haiku for trivial lookups.

## Comments

Use good judgment. The goal is that a developer reading the code for the first time can understand what's going on without guessing. Err on the side of commenting — a useful comment is always better than a missing one.

### What to comment

- **Functions/methods:** Brief comment explaining what it does. Every exported/handler function should have one.
- **Structs/types/interfaces:** What it represents and when it's used.
- **Code blocks:** When a block of code has a distinct purpose (e.g. "build dynamic SET clause", "compute daily totals"), add a short comment above it explaining the block's intent. Use these liberally — they make scanning code much faster.
- **Why, not what.** Comment non-obvious _reasons_: workarounds, business logic, intentional error suppression, ordering dependencies, or anything a future reader would question.
- **Edge cases and gotchas.** If code handles a subtle case, say why.
- **API endpoints:** What the endpoint does, any notable behavior (defaults, side effects).

### What NOT to comment

- Do not restate what a single line obviously does. `// increment counter` above `counter++` is noise.
- Do not use JSDoc on every function. Only add JSDoc when the function is part of a public API or the types genuinely need explanation.
- Do not leave `// TODO` comments unless I ask for them.
- Do not add commented-out code. Delete it; git has history.

### Style

- One to three lines is the sweet spot. Longer is fine if the context warrants it.
- Use `//` for inline and block-level comments. Use `/* */` for file or section headers when it improves readability.
- Write in plain language, not formal doc-speak. "Clears cache because user permissions changed" not "This method is responsible for the invalidation of the cache subsequent to a modification of user permissions."

### Examples

```go
// GOOD — handler purpose
// getDailySummary returns calorie log items and computed totals for a given date.
func (h *Handler) getDailySummary(c *gin.Context) {

// GOOD — block comment explaining a section's purpose
// Build SET clause dynamically — only update fields the client provided
setClauses := []string{}
args := pgx.NamedArgs{"userID": userID}

// GOOD — struct purpose
// DateOnly wraps time.Time to serialize as "YYYY-MM-DD" in JSON responses.
type DateOnly struct{ time.Time }

// GOOD — explains a non-obvious decision
// We use a connection pool instead of a single conn because Neon
// closes idle connections after ~5 minutes.
pool, err := pgxpool.New(ctx, os.Getenv("DB_URL"))
```

```typescript
// GOOD — explains why
// Guard: org-level routes must verify the caller belongs to this org tree
@UseGuards(AccessOrganizationGuard)

// GOOD — explains intentional error suppression
// Safe to ignore — profile image is optional and we don't want to block user creation.
try { await uploadAvatar(file); } catch { }

// BAD — restates the code
// Create a new user
async createUser(dto: CreateUserDto) { ... }
```

## Keeping Documentation in Sync

When you change code, update any documentation or comments affected by the change:

- **Comments near changed code.** If a comment describes behavior you just changed, update it. Stale comments are worse than no comments.
- **CLAUDE.md.** If you change architecture, add/remove commands, change table names, update routes, etc., update the relevant sections here.
- **README files.** If a README describes something you changed, update it.
- **Plan files.** Do not modify task descriptions in plan files — only check off completed tasks.

This is not optional. Outdated docs actively mislead, so treat doc updates as part of the change.

## Changes and Testing

- Run the relevant linter/typecheck after making changes. Fix issues before moving on.
- Run relevant tests after changes. Do not mark work as done if tests fail.
- Do not modify test expectations to make tests pass unless the test was wrong. If a test fails, fix the code.

## Communication

- When starting a task, briefly state your approach before writing code.
- When done with a task, state what you changed and what files were affected.
- If you discover something broken that is outside the current task, mention it but don't fix it.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stride is a life & productivity dashboard — habits, tasks, goals, calorie logging, and more. The first feature being built is a calorie log (replacing an existing Google Sheets workflow; see `design/existing_calorie_log_spreadsheet/` for reference).

## Modules

- **`go-api/`** — Go backend (Gin + PostgreSQL via pgx). This is the active backend.
- **`web-client/`** — React frontend (Vite + Tailwind CSS + PWA).
- **`api/`** — Deprecated TypeScript Express API. Not in use.

## Commands

### Go API (`go-api/`)

```bash
go run .                  # Run server (localhost:3000)
go run ./cmd/migrate      # Run pending migrations from db/
go run ./cmd/create-user  # Create a user (prompts for username, email, password)
go mod tidy               # Manage dependencies
```

### Web Client (`web-client/`)

```bash
npm run dev       # Vite dev server with HMR (proxies /api to localhost:3000)
npm run build     # TypeScript check + Vite production build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Architecture

### Go API

Uses Gin framework with a `Handler` struct that holds a `*pgxpool.Pool` connection pool. Routes are registered in `main.go`. PostgreSQL queries use `queryOne[T]` / `queryMany[T]` generic helpers with `pgx.NamedArgs` and `RowToStructByName` for scanning into Go structs. Migrations are plain SQL files in `db/` (pure DDL, no guard checks). Naming: `YYYY-MM-DD-SEQ-name.sql` (e.g. `2026-01-31-001-schema-versions.sql`). The migrate CLI tool handles transaction wrapping and tracking.

### Web Client

React 19 + TypeScript + Vite 7 + Tailwind CSS 4. Configured as a PWA (`vite-plugin-pwa`). Uses react-router for routing with a token-based auth guard. The Vite dev server proxies `/api` requests to `localhost:3000`. API calls go through `src/api.ts`.

### Database

PostgreSQL (hosted on Neon). Current tables: `users`, `calorie_log_items`, `calorie_log_user_settings`. Enum types follow the pattern `{table}_{column}` (e.g. `calorie_log_item_type`). Migration tracking via a `migrations` table (keyed by filename).

## Environment Variables

### Go API (`go-api/.env`)

- `DB_URL` — PostgreSQL connection string
