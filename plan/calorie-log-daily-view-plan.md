# Calorie Log — Daily View Implementation Plan

## Goal

Implement the calorie logging daily view as designed in `design/mockups/calorie-log-daily-view/daily-view-table.html`. This includes: database schema for calorie log items and user budget settings, Go API endpoints for CRUD operations and daily summaries, basic token auth, and a React frontend with the table-based daily view (summary ring, meal-grouped item table, inline quick-add, full bottom sheet entry, inline cell editing, right-click context menu, and app shell with sidebar).

## Rules

- Database changes via plain SQL migration files (no ORM). Follow existing pattern in `db/`.
- Go API follows existing patterns: Handler struct methods, pgx queries with `RowToStructByName`, Gin router.
- Passwords hashed with bcrypt (`golang.org/x/crypto/bcrypt`). No plaintext passwords anywhere.
- Web client uses React 19 + TypeScript + Tailwind CSS 4. No additional UI library.
- Vite proxy port will be changed to 3000 to match the Go API.
- Auth: basic token auth via `Authorization: Bearer <token>` header, validated against `users.auth_token`.
- Single hardcoded user in the seed data for development. Auth middleware extracts `user_id` from the token lookup.

## Phases

### Phase A: Database Schema

- [x] **A.1 — Create schema versions migration**
  Create `db/2026-01-31-001-schema-versions.sql`. This is the bootstrap migration — it creates the `schema_versions` table and inserts its own version record. No guard check needed (it's the first migration). Wrap in a transaction.

- [x] **A.2 — Create users migration**
  Create `db/2026-01-31-002-users.sql`. Uses the migration guard pattern (temp table + check against `schema_versions`). Creates the `users` table (`id` serial PK, `username` varchar unique, `email` varchar unique, `auth_token` text, `password` text). Also creates the `habits` table and enum from the original migration, plus habit seed data. Delete `go-api/migrations/1-2026-01-31-initial-migration.sql` since it's been split into A.1 and A.2. Update `CLAUDE.md` to document `db/` as the migrations directory.

- [x] **A.3 — Create calorie log migration**
  Create `db/2026-02-14-001-calorie-log.sql`. Uses the migration guard pattern. This migration should:
  - Create enum `calorie_log_items_type_enum` with values: `breakfast`, `lunch`, `dinner`, `snack`, `exercise`.
  - Create enum `calorie_log_items_uom_enum` with values: `each`, `g`, `miles`, `km`, `minutes`.
  - Create table `calorie_log_items` with columns: `id` (serial PK), `user_id` (int, FK to users), `date` (date, not null), `item_name` (text, not null), `type` (calorie_log_items_type_enum, not null), `qty` (numeric(10,2), default 1), `uom` (calorie_log_items_uom_enum, default 'each'), `calories` (int, not null), `protein_g` (numeric(6,1)), `carbs_g` (numeric(6,1)), `fat_g` (numeric(6,1)), `created_at` (timestamptz, default now()), `updated_at` (timestamptz, default now()). Index on `(user_id, date)`.
  - Create table `calorie_log_settings` with columns: `user_id` (int, PK, FK to users), `calorie_budget` (int, default 2300), `protein_target_g` (int, default 150), `carbs_target_g` (int, default 250), `fat_target_g` (int, default 80), `breakfast_budget` (int, default 400), `lunch_budget` (int, default 400), `dinner_budget` (int, default 1000), `snack_budget` (int, default 600).
  - No user seed data in the migration. The CLI tool (A.4) handles user creation and settings.

- [x] **A.4 — Create user CLI tool**
  Create `go-api/cmd/create-user/main.go`. A standalone CLI that connects to the database (reads `DB_URL` from `go-api/.env`), prompts for username, email, and password, hashes the password with bcrypt, generates a UUID auth_token, inserts the user into the `users` table, and inserts a default `calorie_log_settings` row for that user (2300 cal budget, 150g protein, 250g carbs, 80g fat, type budgets: 400/400/1000/600). Usage: `go run ./cmd/create-user`. Add `golang.org/x/crypto` dependency via `go get`. Add usage instructions to `CLAUDE.md`.

- [x] **A.5 — Run migrations and create dev user**
  Run `go run ./cmd/migrate` from `go-api/` to apply all pending migrations. Then run `go run ./cmd/create-user` to create a dev user (which also seeds their calorie_log_settings). Order: migrations first (creates the tables), CLI second (inserts data).

### Phase B: Go API — Auth Middleware & Config

- [x] **B.1 — Fix Vite proxy port mismatch**
  In `web-client/vite.config.ts`, change the proxy target from `http://localhost:3001` to `http://localhost:3000`. Also update `CLAUDE.md` to reflect the correct proxy target.

- [x] **B.2 — Add POST /api/login endpoint**
  In `go-api/main.go`: add a `login` handler registered outside the auth middleware group. Accepts JSON body `{ "username": "...", "password": "..." }`. Looks up the user by username, verifies the password against the stored bcrypt hash using `bcrypt.CompareHashAndPassword`. If valid, returns `{ "token": user.auth_token, "user_id": user.id }`. Returns 401 if credentials are invalid. Register as `router.POST("/api/login", handler.login)`.

- [x] **B.3 — Add auth middleware to the Go API**
  In `go-api/main.go`: add an `authMiddleware` function that reads the `Authorization: Bearer <token>` header, looks up the token in the `users` table, and sets `user_id` on the Gin context via `c.Set("user_id", userId)`. Return 401 if token is missing or invalid. Apply this middleware to a `/api` route group. Move existing habit routes under this group as well.

- [x] **B.4 — Add route prefix `/api` to all authenticated routes**
  Currently routes are registered as `/habits`. Change them to `/api/habits` by using a Gin route group: `api := router.Group("/api")` with auth middleware, then register all routes on `api`. The login route stays outside the group (no auth required). This aligns with the Vite proxy which forwards `/api/*` requests.

- [x] **B.5 — Establish API error response pattern**
  In `go-api/main.go`: define an `apiError` helper function that returns a consistent JSON error shape: `{ "error": "message" }` with the appropriate HTTP status code. Use this in all handlers instead of bare `fmt.Printf`. Pattern: `c.JSON(http.StatusBadRequest, gin.H{"error": "item_name is required"})`. Apply to the login and auth middleware handlers. All subsequent Phase C handlers should follow this pattern.

### Phase C: Go API — Calorie Log Endpoints

- [x] **C.1 — Add calorie log item structs**
  In `go-api/main.go`: define `calorieLogItem` struct with json/db tags matching the `calorie_log_items` table. Define `calorieLogSettings` struct matching `calorie_log_settings`. Define a `dailySummary` response struct with fields: `date`, `calorieBudget`, `caloriesFood`, `caloriesExercise`, `netCalories`, `caloriesLeft`, `proteinG`, `carbsG`, `fatG`, `items` ([]calorieLogItem), `settings` (calorieLogSettings).

- [x] **C.2 — GET /api/calorie-log/daily?date=YYYY-MM-DD**
  Add handler `getDailySummary` to `go-api/main.go`. Query `calorie_log_items` for the given date and user_id (from auth context). Query `calorie_log_settings` for the user. Compute summary totals (food calories, exercise calories, net, remaining, macro totals). Return the `dailySummary` struct as JSON. If no date param, default to today.

- [x] **C.3 — POST /api/calorie-log/items**
  Add handler `createCalorieLogItem` to `go-api/main.go`. Accept JSON body matching the item fields (item_name, type, qty, uom, calories, protein_g, carbs_g, fat_g, date). Insert into `calorie_log_items` with the user_id from auth context. Return the created item with its generated `id`.

- [x] **C.4 — PUT /api/calorie-log/items/:id**
  Add handler `updateCalorieLogItem` to `go-api/main.go`. Accept JSON body with updatable fields. Update the row in `calorie_log_items` where `id` matches and `user_id` matches (auth guard). Set `updated_at` to now(). Return the updated item.

- [x] **C.5 — DELETE /api/calorie-log/items/:id**
  Add handler `deleteCalorieLogItem` to `go-api/main.go`. Delete the row from `calorie_log_items` where `id` and `user_id` match. Return 204 on success, 404 if not found.

- [x] **C.6 — GET /api/user/settings and PUT /api/user/settings**
  Add handlers `getUserSettings` and `updateUserSettings` to `go-api/main.go`. GET returns the `calorie_log_settings` row for the authenticated user. PUT accepts JSON body with budget fields and upserts the row. Return the settings.

### Phase D: Web Client — Foundation & App Shell

- [x] **D.1 — Install react-router and set up routing**
  Run `npm install react-router` in `web-client/`. Create `web-client/src/router.tsx` with routes: `/` redirects to `/calorie-log`, `/calorie-log` renders the CalorieLog page, `/habits` renders the existing habits page (move current App.tsx content). Update `web-client/src/App.tsx` to render the router.

- [x] **D.2 — Create the app shell layout component**
  Create `web-client/src/components/AppShell.tsx`. This is the sidebar + header + content layout that wraps all pages. Sidebar with "Stride" branding, nav links for "Calorie Log" and "Habits" (active state based on current route). Sticky header bar with hamburger toggle (mobile), page title, and profile avatar button (top-right). Mobile: sidebar is an overlay. Desktop (lg:): sidebar is fixed. Use Tailwind classes matching the mockup.

- [x] **D.3 — Create profile dropdown component**
  Create `web-client/src/components/ProfileDropdown.tsx`. Avatar button shows user initial. Click toggles a dropdown with "Settings" and "Sign out" options. Click outside closes it. Settings is a placeholder link for now. Sign out clears the auth token. Match mockup styling.

- [x] **D.4 — Create API service layer**
  Create `web-client/src/api.ts`. Export functions: `login(username, password)`, `fetchDailySummary(date: string)`, `createCalorieLogItem(item)`, `updateCalorieLogItem(id, fields)`, `deleteCalorieLogItem(id)`, `fetchUserSettings()`, `updateUserSettings(settings)`. All calls go to `/api/...` with `Authorization: Bearer <token>` header. Token stored in localStorage. Handle 401 by redirecting to the login page.

- [x] **D.5 — Create login page**
  Create `web-client/src/pages/Login.tsx`. Simple form with username and password fields and a "Sign in" button. Calls `POST /api/login`, stores the returned token in localStorage, redirects to `/calorie-log`. Shows error message on invalid credentials. Add `/login` route to the router. If no token in localStorage, redirect all routes to `/login`.

### Phase E: Web Client — Daily View Components

- [ ] **E.1 — Create the CalorieLog page component**
  Create `web-client/src/pages/CalorieLog.tsx`. This is the main page component. It fetches `dailySummary` on mount (and when date changes). Manages state for: current date, items, settings, bottom sheet open/close, context menu state. Renders the sub-components below. Uses the `max-w-3xl mx-auto` container from the mockup.

- [ ] **E.2 — Create DateHeader component**
  Create `web-client/src/components/calorie-log/DateHeader.tsx`. Left/right arrows, "Today"/"Yesterday" or formatted date, sub-label with full date. Props: `date`, `onDateChange`. Match mockup layout.

- [ ] **E.3 — Create DailySummary component (ring + stats + meal budget table)**
  Create `web-client/src/components/calorie-log/DailySummary.tsx`. Compact horizontal layout from the table mockup: SVG ring (smaller, left side), calorie stats grid (eaten/exercise/budget), macro row (P/C/F with targets), per-meal budget table (right side, hidden on mobile). Props: summary data + settings. Ring color: green under budget, red over.

- [ ] **E.4 — Create ItemTable component with MealSection rows**
  Create `web-client/src/components/calorie-log/ItemTable.tsx`. Renders the `<table>` with sticky header (Item, Qty, Unit, Cal, P, C, F — responsive with combined P/C/F column on mobile). Groups items by type into meal sections. Each section has: colored left-border header row, item data rows, "+ Add" row. Net total footer row. Props: items array, event handlers for add/edit/delete.

- [ ] **E.5 — Create InlineAddRow component**
  Create `web-client/src/components/calorie-log/InlineAddRow.tsx`. The "+ Add" button that expands to show name + calories inputs + Add button + "···" link to open bottom sheet. Props: meal type, onAdd callback, onOpenSheet callback. Animated expand/collapse.

- [ ] **E.6 — Create AddItemSheet (bottom sheet) component**
  Create `web-client/src/components/calorie-log/AddItemSheet.tsx`. Slides up from bottom with backdrop. Form fields: item name, type selector (segmented buttons), qty, unit dropdown, calories, protein, carbs, fat. Save button. Supports two modes: "Log Item" (create) and "Edit Item" (pre-filled, updates existing). Props: open state, initial values, onSave, onClose.

- [ ] **E.7 — Create FloatingActionButton component**
  Create `web-client/src/components/calorie-log/FloatingActionButton.tsx`. Fixed-position (+) button, bottom-right. onClick opens the bottom sheet in create mode. Styled to match mockup (indigo, shadow, responsive positioning).

### Phase F: Web Client — Inline Edit & Context Menu

- [ ] **F.1 — Add double-click inline editing to ItemTable**
  In `web-client/src/components/calorie-log/ItemTable.tsx`: add `onDoubleClick` handler to editable `<td>` cells (name, qty, unit, cal, P, C, F). On double-click, replace cell content with an `<input>`. Enter commits (calls `updateCalorieLogItem` API), Escape cancels, Tab moves to next editable cell. Green flash on successful save. Track editing state (which cell is active).

- [ ] **F.2 — Add right-click context menu to item rows**
  Create `web-client/src/components/calorie-log/ContextMenu.tsx`. Fixed-positioned menu shown on right-click of an item row. Options: "Edit item..." (opens bottom sheet pre-filled), "Duplicate" (calls create API with same data), separator, "Delete" (calls delete API, fade-out animation). Click outside or Escape closes. Position near cursor, kept on screen.

- [ ] **F.3 — Add mobile touch support for edit/delete**
  Right-click and double-click don't exist on mobile. In `web-client/src/components/calorie-log/ItemTable.tsx`: add a `···` action button to each item row (visible on mobile, hidden on desktop with `sm:hidden`). Tapping it opens the same context menu (positioned near the button). On desktop, the `···` button is hidden and right-click is the primary trigger. This ensures edit/duplicate/delete are accessible on touch devices.

- [ ] **F.4 — Wire up edit, duplicate, and delete actions**
  In `web-client/src/pages/CalorieLog.tsx`: implement handlers for `onEditInModal` (open sheet with item data, save calls PUT), `onDuplicate` (POST with same fields, insert into list), `onDelete` (DELETE call, remove from list with animation). Optimistic UI updates — update local state immediately, revert on API error.

### Phase G: Polish & Integration Testing

- [ ] **G.1 — End-to-end smoke test**
  Start the Go API (`go run .` in `go-api/`) and Vite dev server (`npm run dev` in `web-client/`). Verify: page loads with seeded data, date navigation works, inline quick-add creates an item, bottom sheet creates an item with macros, double-click edits a cell, right-click context menu works (edit modal, duplicate, delete), summary ring and macro bars update after changes, profile dropdown shows. Fix any issues found.

- [ ] **G.2 — Build check and lint**
  Run `npm run build` and `npm run lint` in `web-client/`. Fix any TypeScript errors or lint warnings. Ensure production build works.
