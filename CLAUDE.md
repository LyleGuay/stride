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
- **Classes/Structs/types/interfaces:** should have a `/**/` explaining what it is, it's purpose and how it fits in the big picture.
- **Code blocks:** When a block of code has a distinct purpose (e.g. "build dynamic SET clause", "compute daily totals"), add a short comment above it explaining the block's intent. Use these liberally — they make scanning code much faster.
- **Why, not what.** Comment non-obvious _reasons_: workarounds, business logic, intentional error suppression, ordering dependencies, or anything a future reader would question.
- **Edge cases and gotchas.** If code handles a subtle case, say why.
- **API endpoints:** What the endpoint does, any notable behavior (defaults, side effects).

### What NOT to comment

- Do not restate what a single line obviously does. `// increment counter` above `counter++` is noise.
- Do not include `@param` or other JSDoc decotators unless it adds useful info.
- Do not leave `// TODO` comments unless I ask for them.
- Do not add commented-out code. Delete it; git has history.

### Style

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
- **Every feature or bug fix should include corresponding tests.** When building a plan, explicitly scope out what tests are needed — Go unit tests for pure logic, Vitest tests for hooks/utilities, E2E tests for new critical user flows. Test tasks belong in the same phase as the code they cover, not a separate phase at the end.

## Testing Strategy

### Philosophy

Coverage percentage is not a goal. A test is worth writing if it would catch a real bug or if breaking the logic would break the test. If renaming a variable causes a test to fail, that test is testing implementation — it should be deleted.

**Test behaviour, not implementation.** Before writing a test, ask: *"Could this code be wrong in a way that's non-obvious and hard to spot manually?"* Pure business logic with real edge cases — yes. A component rendering without crashing — no.

### Go API (`go-api/`)

**Tools:** Go's built-in `testing` package. No third-party test framework.

**What to test:**
- Pure functions with meaningful logic: `computeTDEE`, `currentMonday`, any extracted validation helpers. These have clear inputs/outputs and real edge cases.
- Handler integration tests (when written): use `net/http/httptest` against a real test PostgreSQL database, not mocks. Tests the real SQL, catches constraint violations.

**What to skip:**
- Handlers that are a straight pass-through to the DB — that's testing pgx and PostgreSQL, not our code.
- Anything that would only fail if a library is broken.

### Web Client (`web-client/`)

**Tools:** Vitest (Vite-native, fast). `@testing-library/react` with `renderHook` for hooks. `msw` (Mock Service Worker) for mocking network calls in hook tests — intercepts at the network level so real hook logic runs.

**What to test:**
- Pure utility functions: date helpers (`today`, `getMondayOf`, `shiftWeek`), any extracted business logic (TDEE equivalent in Settings).
- Custom hooks (e.g. `useDailySummary`): does it set loading correctly, handle errors, refetch on date change?
- Components with non-trivial logic where bugs are non-obvious and faster to catch than via E2E. Good candidates: form validation, create vs edit mode behaviour, type/unit relationships (`AddItemSheet`), keyboard navigation (`InlineAddRow`), computed display logic like budget bar thresholds (`DailySummary`). Ask: *"Could this component behave incorrectly in a way that's hard to spot manually?"* If yes, write a component test.

**What to skip:**
- Purely presentational components — if it just renders props into JSX, E2E covers what matters.
- Snapshot tests — high maintenance, low signal.
- Tests that only verify a component renders without crashing.
- Tests that verify CSS classes or visual appearance.

### E2E (`playwright`)

Covers critical user flows only — happy paths that verify the app works end-to-end with a real browser, real API, and real database. Not for edge cases (unit tests cover those).

**Flows worth covering:**
- Login → add an item → verify totals update
- Edit an item inline → verify change persists on reload
- Settings save → verify calorie budget updates

### CI Order of Operations

When introducing tests to an existing codebase:
1. Write E2E tests first — they become the safety net for structural refactoring.
2. Do structural refactoring (extract utilities, lift data fetching, split files).
3. Add unit/hook tests for the newly extracted, well-shaped code.

## Linear

All Linear issues must be added to the **Stride** project (`939cc8a9-92ac-4ece-917a-82dbb67c3ada`). When creating issues, always pass `project: "Stride"` or the project ID.

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
