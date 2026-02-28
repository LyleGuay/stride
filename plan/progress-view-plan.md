# Progress View — Calorie Log

## Goal

Add a **Progress** tab to the calorie log (alongside the existing Daily and Weekly tabs) that shows calorie trends, budget adherence, and weight history over time. A preset range control (This Month / This Year / All Time) drives a bar chart that auto-groups bars by day, week, or month depending on range size. A weight trend line chart requires a new `weight_log` table and CRUD endpoints. Stats (avg daily net, days on budget, estimated weight impact) update dynamically with the selected range.

---

## Phases

### Phase A: DB + Go API

- [x] **A.1 — Create weight_log migration**
  Create `db/2026-02-28-001-weight-log.sql`:
  ```sql
  CREATE TABLE weight_log (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       DATE NOT NULL,
    weight_lbs DECIMAL(5,1) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, date)
  );
  ```
  The `UNIQUE (user_id, date)` constraint enables upsert via `ON CONFLICT DO UPDATE`. Run with `cd go-api && go run ./cmd/migrate`.

- [x] **A.2 — Add Go models for weight log and progress**
  Add to `go-api/models.go`:
  - `weightEntry` struct (maps to `weight_log` table: `id`, `user_id`, `date DateOnly`, `weight_lbs float64`, `created_at`)
  - `progressStats` struct: `days_tracked`, `days_on_budget`, `avg_calories_food`, `avg_calories_exercise`, `avg_net_calories`, `total_calories_left`
  - `progressResponse` struct: `Days []weekDaySummary` + `Stats progressStats`

- [x] **A.3 — Implement weight log handlers in `go-api/weight_log.go`**
  New file with three handlers:
  - `getWeightLog` — `GET /api/weight-log?start=YYYY-MM-DD&end=YYYY-MM-DD`. Both params required, validate format. Query `weight_log` for user in range ordered by date ASC. Return `[]weightEntry` (empty array if none).
  - `upsertWeightEntry` — `POST /api/weight-log`. Body: `{ date, weight_lbs }`. Always store in lbs. Validate date format and weight > 0. `INSERT ... ON CONFLICT (user_id, date) DO UPDATE SET weight_lbs = EXCLUDED.weight_lbs`. Return 201 with the upserted entry.
  - `updateWeightEntry` — `PUT /api/weight-log/:id`. Body: `{ date?, weight_lbs? }`. Partial update via COALESCE (same pattern as `updateCalorieLogItem`). Return the updated `weightEntry`.
  - `deleteWeightEntry` — `DELETE /api/weight-log/:id`. Delete by `id AND user_id` (ownership). Return 204, or 404 if not found.

- [x] **A.4 — Implement `getProgress` handler in `go-api/calorie_log.go`**
  Add `getProgress` — `GET /api/calorie-log/progress?start=YYYY-MM-DD&end=YYYY-MM-DD`. Both params required. Fetch user's `calorie_budget` from settings. Run same GROUP BY query as `getWeekSummary` but with `start`/`end` and no gap-filling (only return days with data). Compute `progressStats` from rows: `days_tracked = len(rows)`, `days_on_budget = count where net_calories <= calorie_budget`, averages and `total_calories_left`. Return `progressResponse{Days, Stats}`.

  Also add a `getEarliestLogDate` handler (or inline it in `getProgress`): `GET /api/calorie-log/earliest-date` — returns `{ "date": "YYYY-MM-DD" }` using `SELECT MIN(date) FROM calorie_log_items WHERE user_id = @userID`. Used by the frontend to compute the "All Time" range start. Returns `null` date if no items exist.

- [x] **A.5 — Register new routes in `go-api/handler.go`**
  Add to the protected route group:
  ```go
  protected.GET("/calorie-log/progress",       h.getProgress)
  protected.GET("/calorie-log/earliest-date",  h.getEarliestLogDate)
  protected.GET("/weight-log",                 h.getWeightLog)
  protected.POST("/weight-log",                h.upsertWeightEntry)
  protected.PUT("/weight-log/:id",             h.updateWeightEntry)
  protected.DELETE("/weight-log/:id",          h.deleteWeightEntry)
  ```

---

### Phase B: Shared Types + Web Client API

- [x] **B.1 — Add shared TypeScript types**
  Add to `packages/shared/src/types.ts`:
  - `WeightEntry` interface: `id`, `user_id`, `date`, `weight_lbs`, `created_at`
  - `ProgressStats` interface: `days_tracked`, `days_on_budget`, `avg_calories_food`, `avg_calories_exercise`, `avg_net_calories`, `total_calories_left`
  - `ProgressResponse` interface: `days: WeekDaySummary[]`, `stats: ProgressStats`

  Export all three from `packages/shared/src/index.ts`.

- [x] **B.2 — Add API functions to `web-client/src/api.ts`**
  Add five functions:
  - `fetchProgress(start, end): Promise<ProgressResponse>` — `GET /api/calorie-log/progress`
  - `fetchWeightLog(start, end): Promise<WeightEntry[]>` — `GET /api/weight-log`
  - `upsertWeightEntry(date, weightLbs): Promise<WeightEntry>` — `POST /api/weight-log` (always lbs)
  - `updateWeightEntry(id, fields): Promise<WeightEntry>` — `PUT /api/weight-log/:id`
  - `deleteWeightEntry(id): Promise<void>` — `DELETE /api/weight-log/:id`

---

### Phase C: ProgressView Component + CalorieLog Integration

- [ ] **C.1 — Create `ProgressView.tsx` with range selector and bar chart**
  Create `web-client/src/components/calorie-log/ProgressView.tsx`. Data is fetched by the parent and passed as props (`range`, `onRangeChange`, `progressData: ProgressResponse | null`, `weightEntries: WeightEntry[]`, `loading`, `error`, `onLogWeight`, `onDeleteWeight`).

  **Range selector**: pill segment control matching the existing Daily/Weekly tab style — 3 buttons: "This Month" / "This Year" / "All Time".

  **Bar chart card** (adapted from `WeeklySummary`'s SVG chart — reuse `scaleY`, grid line, and tooltip patterns):
  - Month → 1 bar per day (~30 bars)
  - Year → 1 bar per ISO week (~52 bars)
  - All Time → 1 bar per calendar month

  Bars colored green (on/under budget) or red (over budget). **No single budget reference line** (budget can change over time). Tooltip on click: label, net calories, vs-budget delta.

  **Bar grouping logic** — extract as pure functions at the top of the file (or `web-client/src/utils/progressGrouping.ts`):
  ```typescript
  interface ChartBar {
    label: string        // "15", "Wk 3", "Jan"
    totalFood: number
    totalExercise: number
    netCalories: number
    budget: number       // calorie_budget summed across tracked days in bucket
    trackedDays: number
    totalDays: number
  }
  function groupDays(days: WeekDaySummary[], range: 'month' | 'year' | 'all', start: string, end: string): ChartBar[]
  ```
  - Month: generate all calendar days in range, join against API data (missing → `trackedDays=0`).
  - Year: group by ISO week, sum days within each week.
  - All Time: group by calendar month, sum days within each month.

- [ ] **C.2 — Add weight trend chart, stats panel, FAB, and log-weight modal to `ProgressView.tsx`**
  **Weight card — Graph / Table tabs**: A small two-tab toggle ("Graph" / "Table") inside the weight card header switches between:

  - **Graph view**: SVG line chart with dots, connecting line, and light area fill. X = entry dates within the selected range, Y = weight. Display unit follows the user's `units` setting (lbs for imperial, kg for metric — convert from stored lbs for display only; always store and send lbs). If no entries in range: empty state + "Log your first weight entry" prompt. Each dot shows a tooltip on click (date + weight in the user's unit).

  - **Table view**: Scrollable list of weight entries for the selected range, one row per entry. Columns: Date, Weight (in user's unit). Each row has an **Edit** icon (opens the log-weight modal pre-filled) and a **Delete** icon (deletes with a confirmation or undo snackbar). Sorted by date descending.

  **Stats panel card**: 3-column grid with `avg_net_calories`, `days_tracked`, `days_on_budget (%)`. Below the grid: Estimated Weight Impact (`total_calories_left / 3500` lbs), same wording as WeeklySummary. Show a placeholder when no data.

  **Floating Action Button**: A FAB (same style as the calorie log FAB in `FloatingActionButton.tsx`) fixed to the bottom-right of the Progress tab. Tapping it opens the log-weight modal to create a new entry.

  **Log-weight modal** (`web-client/src/components/calorie-log/LogWeightSheet.tsx`, mirroring `AddItemSheet.tsx`):
  - Date field — defaults to today, editable
  - Weight field — numeric input; label and placeholder reflect the user's unit (lbs or kg); value is converted to lbs before calling `onSave`
  - Save button — calls `onLogWeight(date, weightInLbs)`, closes the modal
  - Cancel / close button
  - When opened from the Table edit action: pre-fills date and weight (converted to user's unit for display)

  State for modal open/close and the entry being edited is managed in `CalorieLog.tsx` alongside the other sheet states.

- [ ] **C.3 — Wire Progress tab into `web-client/src/pages/CalorieLog.tsx`**
  1. Extend tab type to `'daily' | 'weekly' | 'progress'`.
  2. Add state: `progressRange: 'month' | 'year' | 'all'`, `progressData`, `weightEntries`, `progressLoading`, `progressError`.
  3. Add `useEffect` that fetches when `tab === 'progress'` or `progressRange` changes:
     ```typescript
     const { start, end } = getRangeDates(progressRange)
     Promise.all([fetchProgress(start, end), fetchWeightLog(start, end)])
     ```
  4. Add `handleLogWeight` / `handleDeleteWeight` (call API, then refetch).
  5. Add "Progress" button to the segment control (making it 3 buttons).
  6. Render `<ProgressView />` when `tab === 'progress'`.

  **`getRangeDates` helper** (add inline to `CalorieLog.tsx`):
  - `'month'` → first day of current month → today
  - `'year'` → Jan 1 of current year → today
  - `'all'` → earliest logged date from `GET /api/calorie-log/earliest-date` → today (fetched once on mount and cached in state; falls back to today if no data)

  Fetch `earliestLogDate` once when the component mounts (not per range switch). The "All Time" button is disabled if `earliestLogDate` is null (no data yet).

- [ ] **C.4 — Unit tests: bar grouping logic**
  Create `web-client/src/utils/progressGrouping.test.ts` (Vitest). Test `groupDays`:
  - Month range: produces one bar per calendar day; days missing from API data have `trackedDays=0`
  - Year range: produces ~52 week bars; each bar correctly sums its days' food/exercise
  - All Time range: produces monthly bars covering the correct date ranges
  - Bars for buckets with no data at all have `netCalories=0` and `trackedDays=0`
  - A bar spanning the month boundary is attributed to the month of its start date

- [ ] **C.5 — Unit tests: `getRangeDates` helper**
  Add tests in `web-client/src/utils/progressGrouping.test.ts` (or a dedicated `getRangeDates.test.ts`). Verify:
  - `'month'` returns the first day of the current month through today
  - `'year'` returns Jan 1 of the current year through today
  - `'all'` returns `2020-01-01` through today
  - All returned dates are valid `YYYY-MM-DD` strings

- [ ] **C.6 — Component tests: `ProgressView` and `LogWeightSheet` non-trivial behaviour**
  Create `web-client/src/components/calorie-log/__tests__/ProgressView.test.tsx` (`@testing-library/react`). Test with mocked props:
  - Switching range selector calls `onRangeChange` with the correct value
  - Loading state renders a spinner and no chart
  - Empty state (no data, no weight entries) renders the correct placeholder messages
  - Stats panel shows "—" / placeholder when `progressData` is null

  Create `web-client/src/components/calorie-log/__tests__/LogWeightSheet.test.tsx`:
  - Sheet renders when `open={true}`, is absent from DOM when `open={false}`
  - Date field defaults to today's date on open
  - Save button calls `onSave` with the entered date and weight **converted to lbs** (e.g. entering 80 kg → `onSave` called with ~176.4 lbs)
  - Save button is disabled when weight field is empty or zero
  - Close/cancel button calls `onClose` without calling `onSave`
  - When opened with an existing entry (edit mode), date and weight fields are pre-filled in the user's display unit

- [ ] **C.7 — E2E test: Progress tab happy path**
  Add a test in `e2e/` (Playwright). Steps:
  1. Log in and navigate to the Calorie Log page
  2. Click the **Progress** tab — verify it becomes active and the range selector is visible
  3. Verify "This Month" is selected by default and the bar chart renders
  4. Click "This Year" — verify the range selector updates (chart re-renders; no assertion on bar count needed)
  5. Click the FAB — verify the log-weight modal opens with today's date pre-filled; enter a weight value and submit — verify the weight chart shows a dot
  6. Click "All Time" — verify the range selector updates without error

---

## Testing Summary

| Layer | File | What it covers |
|-------|------|----------------|
| Unit | `web-client/src/utils/progressGrouping.test.ts` | `groupDays` bucketing logic for all three range modes; edge cases (empty data, boundary dates) |
| Unit | same file or `getRangeDates.test.ts` | `getRangeDates` returns correct `start`/`end` strings for each preset |
| Component | `web-client/src/components/calorie-log/__tests__/ProgressView.test.tsx` | Range selector interaction, loading/empty states |
| Component | `web-client/src/components/calorie-log/__tests__/LogWeightSheet.test.tsx` | Open/close, date default, save validation, callback contracts |
| E2E | `e2e/progress.spec.ts` | Full happy path: tab navigation, range switching, logging a weight entry |

**Manual verification checklist** (run after implementation, before merging):
- [ ] "This Month" shows one bar per day; green = under budget, red = over budget
- [ ] Hovering/clicking a bar shows a tooltip with net calories and vs-budget delta
- [ ] "This Year" groups bars by week (~52 bars); "All Time" groups by month
- [ ] FAB is visible on the Progress tab and hidden on Daily/Weekly tabs
- [ ] Tapping the FAB opens the log-weight modal with today's date pre-filled
- [ ] Changing the date field and submitting logs for the selected date
- [ ] Logging a weight entry creates a dot on the weight chart; logging again for the same date updates the existing entry (upsert)
- [ ] Closing the modal without saving makes no API call
- [ ] Weight card "Table" tab shows logged entries for the selected range; "Graph" tab shows the line chart
- [ ] Edit icon in Table view opens the modal pre-filled with the entry's date and weight (in the user's unit)
- [ ] Delete icon in Table view removes the entry; chart and table both update
- [ ] Metric user (units = kg): weight chart Y-axis and table show kg; lbs user sees lbs; stored values are always lbs
- [ ] Stats panel (Avg Daily Net, Days Tracked, Days on Budget) updates when switching ranges
- [ ] Estimated Weight Impact changes sign correctly (positive = ahead of pace, negative = behind)
- [ ] No data state: new account / empty range shows placeholder messages, not blank space or errors
- [ ] Navigating away and back to Progress retains the selected range
