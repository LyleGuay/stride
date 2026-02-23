# Code Review

**Date:** 2026-02-22
**Scope:** `go-api/` and `web-client/src/`
**Context:** Hobby project, solo dev; preparing for unit testing and CI.

Severity scale: **CRITICAL** (broken/data loss) · **HIGH** (security/significant bugs) · **MEDIUM** (code quality/potential bugs) · **LOW** (style/minor improvements)

---

## go-api

### Structure

#### `[MEDIUM]` Everything lives in one 900-line `main.go`

All domain structs, DB helpers, TDEE logic, auth handlers, calorie log handlers, habits handlers, and server setup are in a single file. It's readable today, but it will become hard to navigate as more features land — and it will make unit testing harder because you can't import individual pieces in isolation.

The simplest step is to split by concern into multiple files within `package main` (no new packages needed, no refactor of signatures):

```
go-api/
  main.go            ← server setup, main(), route registration only
  handler.go         ← Handler struct + getDBPool
  models.go          ← all domain structs + DateOnly
  auth.go            ← login, authMiddleware
  calorie_log.go     ← getDailySummary, getWeekSummary, createCalorieLogItem, etc.
  user_settings.go   ← getUserSettings, patchUserSettings
  tdee.go            ← computeTDEE, currentMonday
  habits.go          ← getHabits, postHabit
```

This is the idiomatic Go approach for a small service — keep everything in one package but distribute it across files by responsibility.

#### `[MEDIUM]` TDEE population is copy-pasted in three handlers

`main.go:379–384, 637–642, 790–795`

The same 5-line block that calls `computeTDEE` and assigns the four computed pointer fields appears verbatim in `getDailySummary`, `getUserSettings`, and `patchUserSettings`. Extract it into a helper:

```go
// populateComputedTDEE fills the computed-only fields on s from the user's profile.
// No-ops if any required profile field is missing.
func populateComputedTDEE(s *calorieLogUserSettings) {
    if bmr, tdee, budget, pace, ok := computeTDEE(s); ok {
        s.ComputedBMR    = &bmr
        s.ComputedTDEE   = &tdee
        s.ComputedBudget = &budget
        s.PaceLbsPerWeek = &pace
    }
}
```

When you add a fourth handler that reads settings, you won't have to remember to copy the block again.

#### `[LOW]` `multipliers` map in `computeTDEE` is rebuilt on every call

`main.go:241–247`

The activity level multiplier map is declared inside the function body, so Go allocates and initialises it on every single call. Declare it as a package-level `var` (or `const`-style `var` with a named type) so it's allocated once:

```go
var activityMultipliers = map[string]float64{
    "sedentary":   1.2,
    "light":       1.375,
    "moderate":    1.55,
    "active":      1.725,
    "very_active": 1.9,
}
```

This also makes it the natural single source of truth when you add input validation (see validation findings).

#### `[LOW]` Route registration is entangled with server setup in `main()`

`main.go:856–873`

All route registrations (`api.GET(...)`, `api.POST(...)`, etc.) are inline inside `main()` alongside connection pool setup, static file embedding, and port binding. As the route count grows this will become a wall of text. Move route registration to a method on `Handler`:

```go
func (h *Handler) registerRoutes(router *gin.Engine) {
    router.POST("/api/login", h.login)
    api := router.Group("/api", h.authMiddleware())
    api.GET("/calorie-log/daily", h.getDailySummary)
    // ...
}
```

`main()` then becomes a clean 20-line setup function.

#### `[LOW]` Inline request body structs can't be reused or tested

Handlers like `createCalorieLogItem` and `patchUserSettings` declare their request bodies as anonymous inline structs:

```go
var body struct {
    ItemName string `json:"item_name"`
    // ...
}
```

This is fine for small handlers, but named types (e.g., `createCalorieLogItemRequest`) can be referenced in tests, documented, and reused if the same shape is needed elsewhere. Worth naming at least the larger ones (`patchUserSettingsRequest` has 20 fields).

---

### CRITICAL

#### `[CRITICAL]` habits endpoints are non-functional

`main.go:800–818`

Remove habit related code. not used currently.

---

### HIGH

#### `[HIGH]` Login is vulnerable to username enumeration via timing

`main.go:287–298`

If the username doesn't exist, the handler returns immediately (fast). If it does exist, bcrypt runs (slow, ~100ms). An attacker can enumerate valid usernames by measuring response times. Fix by always running bcrypt against either the real hash or a pre-computed dummy hash, regardless of whether the user was found:

```go
dummyHash := "$2a$10$..." // bcrypt of any string, computed at startup
hash := dummyHash
userFound := err == nil
if userFound {
    hash = u.Password
}
bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password))
if !userFound {
    apiError(c, http.StatusUnauthorized, "invalid credentials")
    return
}
```

#### `[HIGH]` `create-user` CLI silently ignores read errors

`cmd/create-user/main.go:34,38,42`

All three `ReadString` calls discard the error with `_`. If the user hits Ctrl+D or an I/O error occurs, the program continues with an empty string and produces a cryptic database error. Check and handle the error after each read.

---

### MEDIUM

#### `[MEDIUM]` No validation on `createCalorieLogItem` request body

`main.go:498–546`

Beyond checking that `item_name` and `type` are non-empty, the handler does no validation. The database will reject some of these but with a generic 500:

- `type` is not checked against the valid enum values (`breakfast`, `lunch`, `dinner`, `snack`, `exercise`) — reject with a 400 and list the valid values.
- `calories` can be negative or zero.
- `qty` can be negative.
- `protein_g`, `carbs_g`, `fat_g` can be negative.

#### `[MEDIUM]` `date` query parameter is not validated

`main.go:333`

The `date` param is passed to the DB without checking that it's a valid `YYYY-MM-DD` string. An invalid value silently returns no rows. Parse it with `time.Parse("2006-01-02", dateStr)` and return a 400 on failure. Same applies to any date used in filter queries.

#### `[MEDIUM]` `activity_level` is not validated before saving

`main.go:737–739`

`computeTDEE` has a hardcoded map of five valid levels. `patchUserSettings` allows any string through to the database. If an invalid value is saved, all future TDEE auto-budget calculations silently return `ok=false`, breaking the feature with no feedback to the user. Validate against the same set of keys before writing.

#### `[MEDIUM]` Repetitive if-blocks in `patchUserSettings`

`main.go:681–760`

Twenty nearly-identical blocks check for nil and build a SET clause. This pattern is error-prone (copy-paste mistakes, easy to miss a field), hard to diff, and will grow with the settings schema. Consider a helper or a loop over a field-mapping struct. The current implementation is functionally correct but brittle.

#### `[MEDIUM]` Budget auto-update silently swallows errors

`main.go:778–786`

After the main PATCH, a second UPDATE writes the auto-computed budget. If that second write fails, `err` is discarded (`if err == nil { s = updated }`). The response returns the old budget value with no indication the auto-budget didn't save. At minimum, log the error; consider returning a partial-success indicator.

#### `[MEDIUM]` `rows.Scan` error ignored in migrate

`cmd/migrate/main.go:48`

`rows.Scan(&name)` discards its error. A scan failure silently skips the row, meaning a previously-applied migration could be re-run. Check and handle the error.

---

### LOW

#### `[LOW]` Auth tokens are stored in plaintext

`main.go:51, authMiddleware`

UUIDs are stored verbatim in the `users` table. If the database is compromised, all tokens are immediately valid. Hashing (SHA-256 is sufficient for random tokens) before storage means a DB dump doesn't yield live tokens. Low urgency for a solo hobby app, but worth doing before opening to other users.

#### `[LOW]` Auth tokens never expire

`authMiddleware`

There's no `created_at` or expiry on tokens. A leaked token is valid forever. Consider adding an `expires_at` column or a simple "issued within N days" check.

I think JWT would be best for this? just set expiry on JWT.

#### `[LOW]` `currentMonday()` uses direct day arithmetic across month boundaries

`main.go:408`~

```go
time.Date(now.Year(), now.Month(), now.Day()-weekday+1, ...)
```

Subtracting days directly from `now.Day()` can produce day 0 or negative days. Go's `time.Date` normalizes these, but it's easier to reason about and less surprising to use `now.AddDate(0, 0, -(weekday-1)).Truncate(24 * time.Hour)`.

#### `[LOW]` TDEE values are truncated, not rounded

`main.go:270`

`int(bmrF)` truncates; `int(math.Round(bmrF))` rounds. For a calorie budget, consistently rounding is more correct and avoids always-under-reporting.

#### `[LOW]` Age calculation has no bounds check

`main.go:225–229`

If `date_of_birth` is in the future (user error or bad data), `age` becomes negative and `computeTDEE` proceeds with a negative age. Guard `age < 0 || age > 130` and return `ok=false`.

#### `[LOW]` No bounds on calorie/macro targets in `patchUserSettings`

`main.go:652–760`

Users can save `calorie_budget: -5000`, `weight_lbs: -150`, `height_cm: 0`, etc. The database accepts them and `computeTDEE` will produce nonsense. Add basic sanity checks (positive values, reasonable ranges) before writing.

#### `[LOW]` `habit.Id` should be `habit.ID`

`main.go:74`

remote habit related code and types.

#### `[LOW]` `.env` parse errors are masked

`main.go:847–850`

`godotenv.Load()` errors are logged as "No .env file found" regardless of whether the file was missing or malformed. A malformed `.env` silently uses whatever env vars happen to be set. Distinguish the two cases and fatal on a parse error.

#### `[LOW]` Error messages are too generic

Various handlers return messages like `"failed to fetch items"` or `"failed to create item"`. These don't distinguish between a constraint violation, a not-found case, or an internal DB error. Not urgent, but will make debugging harder as the API grows.

---

## web-client

### Structure

#### `[MEDIUM]` Types and API functions are coupled in `api.ts`

`src/api.ts`

All shared types (`CalorieLogItem`, `DailySummary`, `CalorieLogUserSettings`, etc.) live in the same file as the fetch functions. Any file that needs just a type still imports the entire API layer. As the app adds more modules, this coupling becomes a problem — types should be importable without pulling in fetch logic.

Extract types to `src/types.ts` (or `src/types/calorie-log.ts` when there are multiple domains). `api.ts` then imports from `types.ts`, and components can choose to import from either.

#### `[MEDIUM]` `WeeklySummary` fetches its own data; `DailySummary` receives props — inconsistent pattern

`src/components/calorie-log/WeeklySummary.tsx:6–7`
`src/components/calorie-log/DailySummary.tsx:6–8`

`DailySummary` is a pure presentational component — it receives data via props from the `CalorieLog` page. `WeeklySummary` is a hybrid — it fetches its own data internally via `fetchWeekSummary`. This inconsistency makes data flow hard to reason about and will make both components harder to test (WeeklySummary needs a mocked network; DailySummary doesn't).

Pick one pattern and stick to it. The cleaner option for testing and future flexibility is to lift data fetching into the page: `CalorieLog` owns the fetch, passes data down as props to both summary components.

#### `[MEDIUM]` `today()` / `todayStr()` is duplicated — same function, different names

`src/pages/CalorieLog.tsx:24–27`
`src/components/calorie-log/WeeklySummary.tsx:17–20`

Identical implementations (local-time YYYY-MM-DD string), one called `today`, one called `todayStr`. The other date helpers in `WeeklySummary` (`getMondayOf`, `shiftWeek`, `formatWeekRange`, `dayLabel`) are also isolated there but would be useful elsewhere. These belong in a shared `src/utils/dates.ts`. As a bonus, this file becomes the obvious home for all date-formatting logic and can be unit tested in isolation.

#### `[LOW]` No `hooks/` directory — data-fetching logic is embedded in page components

`CalorieLog` has ~80 lines of state and effect logic (`loadSummary`, `useCallback`, handlers) mixed into the same component that renders the JSX. As more features land this pattern will produce large, hard-to-test page components.

Extracting data-fetching logic into a custom hook (e.g., `src/hooks/useDailySummary.ts`) keeps the page component focused on layout, makes the hook independently testable, and gives a natural place to add caching or optimistic updates later.

#### `[LOW]` No shared constants file

`src/components/calorie-log/AddItemSheet.tsx:10–11`
`src/components/calorie-log/InlineAddRow.tsx:9–10`

`ALL_UNITS` and `EXERCISE_UNITS` are copy-pasted in two files (already noted as a bug risk). There's no obvious shared location for values like these. A `src/constants.ts` (or co-located `src/components/calorie-log/constants.ts`) would resolve this and give a clear home for future additions like valid meal types.

#### `[LOW]` `App.tsx` is a redundant wrapper

`src/App.tsx`

The entire file is:
```tsx
export default function App() {
  return <Router />
}
```

It adds an indirection layer with no benefit. `main.tsx` can import and render `Router` directly. If a future app-level provider (context, theme, error boundary) is needed, `main.tsx` is the right place for it, not a pass-through component.

#### `[LOW]` `RequireAuth` is defined inside `router.tsx`

`src/router.tsx:12–16`

Fine for now, but if auth logic grows (redirect preservation, role checks, token refresh), it will be cleaner as its own file (`src/components/RequireAuth.tsx`). Worth moving before it gets more complex.

---

### HIGH

#### `[HIGH]` Auth token is stored in `localStorage` (XSS risk)

`src/api.ts`, `src/pages/Login.tsx`

Any injected script (via a future XSS vulnerability, a compromised third-party package, or a browser extension) can read `localStorage.token` and exfiltrate it. The secure alternative is to move auth to an `HttpOnly` cookie set by the server — JavaScript cannot read `HttpOnly` cookies at all. This is worth addressing before the app handles any sensitive data beyond one person's calorie log.

#### `[HIGH]` No error boundary

`src/main.tsx`

An unhandled render error in any component currently crashes the entire app with a blank screen. Wrap the router in a React error boundary to catch crashes, show a helpful message, and preserve navigation to recover.

---

### MEDIUM

#### `[MEDIUM]` Meal type is cast without validation

`src/pages/CalorieLog.tsx:75,95`

```typescript
type: type as CalorieLogItem['type']
```

If `type` holds a value not in the union (`breakfast | lunch | dinner | snack | exercise`), the cast succeeds silently and an invalid value is sent to the API. Validate against the known values before submitting.

#### `[MEDIUM]` Render-phase state updates in `AddItemSheet` are fragile

`src/components/calorie-log/AddItemSheet.tsx:48–74`

Setting state during render (comparing `open !== prevOpen` then calling `set*`) is a React 19 pattern but fragile — strict mode will double-invoke the render, and the logic is hard to follow. Use a `useEffect([open, editItem])` that resets the form when the sheet opens. This is cleaner and less likely to cause stale-state bugs.

#### `[MEDIUM]` 401 redirect loses router context

`src/api.ts:20–24`

```typescript
window.location.href = '/login'
```

Hard navigation causes a full page reload, losing all in-memory state and the current URL. Use React Router's `navigate('/login', { replace: true })` from a shared auth context instead. Also, the current URL should be preserved as a `?redirect=` param so the user lands back after re-auth.

#### `[MEDIUM]` No loading state on async actions (duplicate request risk)

Multiple files

Buttons that trigger `async` operations (add item, edit cell, delete item, save settings) don't disable themselves while the request is in flight. Fast taps or clicks can trigger duplicate API calls. Track a `pending` flag and disable/show a spinner during the request.

#### `[MEDIUM]` Closing the add/edit sheet discards unsaved form data silently

`src/components/calorie-log/AddItemSheet.tsx:98`

A tap outside the modal closes it immediately. If the user filled in half a form, that data is lost with no warning. Either prevent backdrop-close when the form is dirty, or show a confirmation.

---

### LOW

#### `[LOW]` `ALL_UNITS` and `EXERCISE_UNITS` are duplicated

`src/components/calorie-log/AddItemSheet.tsx:10–11`
`src/components/calorie-log/InlineAddRow.tsx:9–10`

Identical constant arrays defined in two files. Extract to a shared `src/constants.ts` (or `src/api.ts` alongside the types) so they can't drift.

#### `[LOW]` `DailySummary` meal totals typed too loosely

`src/components/calorie-log/DailySummary.tsx:12`

```typescript
const totals: Record<string, number> = { ... }
```

Should be `Record<CalorieLogItem['type'], number>` so TypeScript enforces that all meal types are present and flags typos in the keys.

#### `[LOW]` `Settings` component is ~700 lines

`src/pages/Settings.tsx`

Everything from profile form to budget plan to macro targets lives in one component. It's readable today but will become hard to test and maintain. Extracting `<ProfileForm>`, `<BudgetPlan>`, and `<MacroTargets>` into focused sub-components would make unit testing practical.

#### `[LOW]` `WeeklySummary` SVG is not memoized

`src/components/calorie-log/WeeklySummary.tsx`

The SVG chart re-renders on every tooltip hover or parent state change. Wrap the static SVG elements (grid lines, bars) in `useMemo` or `React.memo` to avoid redundant DOM work.

#### `[LOW]` Weak map key in `WeeklySummary` grid steps

`src/components/calorie-log/WeeklySummary.tsx:247`

`key={label}` where label is a display string like `"1k"`. If the grid is regenerated with the same labels, React won't detect a change. Use a stable index or a computed numeric value as the key.

#### `[LOW]` Inconsistent error handling across components

Some call sites use `.catch(() => setError('Failed'))`, others use `.catch(e => setError(e.message))`. Neither surfaces the full error context well. A consistent pattern — ideally a shared `useApiError` hook or a global toast — would reduce noise and improve debuggability.

#### `[LOW]` No retry on transient API failures

`src/api.ts`

A single network hiccup returns an error immediately. For a PWA on mobile (intermittent connectivity), one automatic retry on network error or 5xx would meaningfully improve reliability.

#### `[LOW]` PWA manifest may be missing icon assets

`vite.config.ts:30–45`

The PWA config references `pwa-192x192.png` and `pwa-512x512.png`. If those files don't exist in `public/`, the app will fail the PWA install criteria silently in production. Verify the files exist or remove the icon entries.

#### `[LOW]` `eslint.config.js` could enforce stricter rules

`eslint.config.js`

Given that tests and CI are coming, tightening ESLint now is cheap. Useful additions: `no-console` (warn), `@typescript-eslint/no-explicit-any`, and enforcing exhaustive switch checks on union types.

---

## Resolution Log

**Applied 2026-02-22** as part of the code-review fixes + testing setup plan.

### go-api — fixed

- **`[CRITICAL]`** Removed `getHabits`, `postHabit`, and the `habit` struct entirely.
- **`[HIGH]`** Login timing attack: always runs bcrypt against real hash or a pre-computed `dummyHash`, preventing username enumeration via timing.
- **`[HIGH]`** `create-user` CLI: all three `ReadString` calls now check and handle errors.
- **`[MEDIUM]`** Date query param validation: `getDailySummary` validates `YYYY-MM-DD` format before querying.
- **`[MEDIUM]`** Item type validation: `createCalorieLogItem` rejects unknown types with 400.
- **`[MEDIUM]`** `activity_level` validation: `patchUserSettings` rejects values not in `activityMultipliers` before writing.
- **`[MEDIUM]`** Budget auto-update error: logged instead of silently discarded.
- **`[MEDIUM]`** `rows.Scan` in migrate: error is now checked and fatal.
- **`[MEDIUM]`** `main.go` split into `models.go`, `handler.go`, `auth.go`, `tdee.go`, `calorie_log.go`, `user_settings.go`.
- **`[MEDIUM]`** TDEE population extracted into `populateComputedTDEE` helper; copy-paste removed.
- **`[LOW]`** `activityMultipliers` moved to package-level var in `tdee.go`.
- **`[LOW]`** Route registration moved to `registerRoutes` method on `Handler`.
- **`[LOW]`** Named `createCalorieLogItemRequest` and `patchUserSettingsRequest` structs.
- **`[LOW]`** `currentMonday()` now uses `AddDate` to handle month-boundary edge cases.
- **`[LOW]`** TDEE values now use `math.Round` instead of truncation.
- **`[LOW]`** Age bounds guard added to `computeTDEE` (`age < 0 || age > 130` → `ok=false`).
- **`[LOW]`** `.env` parse errors distinguished from missing-file errors; fatal on parse error.

### web-client — fixed

- **`[HIGH]`** Error boundary added (`ErrorBoundary.tsx`); wraps the router in `main.tsx`.
- **`[MEDIUM]`** Types extracted to `src/types.ts`; `api.ts` re-exports them for backward compat.
- **`[MEDIUM]`** `WeeklySummary` data fetching lifted into `CalorieLog.tsx`; component is now pure presentational.
- **`[MEDIUM]`** `today()`/`todayStr()` unified as `todayString()` in `src/utils/dates.ts`; all date helpers centralised there.
- **`[MEDIUM]`** `AddItemSheet` render-phase state replaced with `useEffect([open, editItem])`.
- **`[MEDIUM]`** Meal type cast guarded with `ITEM_TYPES.includes(...)` check before use.
- **`[LOW]`** `ALL_UNITS` and `EXERCISE_UNITS` deduplicated into `src/constants.ts`.
- **`[LOW]`** `DailySummary` meal totals tightened to `Record<CalorieLogItem['type'], number>`.
- **`[LOW]`** `App.tsx` (pass-through wrapper) deleted; `main.tsx` renders `Router` directly.
- **`[LOW]`** `RequireAuth` extracted to `src/components/RequireAuth.tsx`.
- **`[LOW]`** `useDailySummary` hook extracted to `src/hooks/useDailySummary.ts`.

### Tests + CI added

- **Go unit tests** (`go-api/tdee_test.go`): 11 tests covering `computeTDEE` and `currentMonday`.
- **Vitest unit tests** (`web-client/src/utils/dates.test.ts`, `src/hooks/useDailySummary.test.ts`): 17 tests.
- **Playwright E2E** (`e2e/`): auth flows + calorie log add-item flow; docker-compose.test.yml for isolated postgres.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): `go-test`, `web-test`, `e2e` jobs.

---

## Left for later

- **`[HIGH]` Auth token in localStorage / JWT** — replace UUID token + localStorage with JWT (expiry, short-lived) and ideally HttpOnly cookie storage. See `auth.go` and `src/api.ts`. Deferred because it requires a schema migration and coordinated frontend change.
- **`[MEDIUM]` 401 redirect loses router context** — `window.location.href = '/login'` should use React Router `navigate` with a `?redirect=` param. Blocked on introducing a shared auth context.
- **`[MEDIUM]` No loading state on async actions** — buttons that trigger API calls (add, edit, delete, save settings) don't disable during the request, risking duplicate submissions.
- **`[MEDIUM]` Closing sheet discards unsaved data silently** — backdrop tap closes the form with no warning when dirty.
- **`[LOW]` No bounds on calorie/macro targets** — `patchUserSettings` accepts negative calories, zero height, etc. Add basic sanity checks.
- **`[LOW]` Settings component is ~700 lines** — split into `<ProfileForm>`, `<BudgetPlan>`, `<MacroTargets>` sub-components when tests for Settings are planned.
- **`[LOW]` WeeklySummary SVG memoization** — grid lines and bars re-render on tooltip hover; wrap in `useMemo`.
- **`[LOW]` No retry on transient API failures** — one automatic retry on network error or 5xx would help on mobile.
- **`[LOW]` `patchUserSettings` repetitive if-blocks** — functionally correct; refactor only when adding more settings fields makes the pattern unmanageable.
- **`[LOW]` ESLint strictness** — add `no-console`, `@typescript-eslint/no-explicit-any`, exhaustive switch checks.
- **`[LOW]` PWA icon assets** — verify `pwa-192x192.png` and `pwa-512x512.png` exist in `public/`.
