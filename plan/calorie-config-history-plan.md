# Calorie Config History + Accurate Weight Impact Calculation

## Goal

The Progress tab's "Estimated Weight Impact" currently uses today's TDEE and today's calorie budget uniformly across all historical dates. This produces wildly inaccurate estimates for longer ranges (e.g. 6 months) because (1) the user's budget and activity level may have changed and (2) their TDEE was different when they weighed more/less.

This plan introduces a `calorie_config_history` table that records historical calorie budget and activity level snapshots whenever the user changes those settings. The progress endpoint is updated to resolve per-day budget and activity level from this history, compute per-day TDEE using historical weight (from `weight_log`) and age-at-date (from DOB), and return a proper `estimated_weight_change_lbs` field to the frontend. A one-time SQL script imports the user's historical budget data from the legacy CSV.

---

## Naming Decisions

**Table:** `calorie_config_history`
- Follows existing `calorie_log_*` domain prefix pattern loosely; `_history` suffix is clear.

**Key column:** `valid_until DATE`
- Semantically: "this config is in effect up to and including this date."
- When the user changes their budget today, we store a record with `valid_until = yesterday`.
- To find the config for date `D`: find the row with the smallest `valid_until >= D`.
- If no such row exists (i.e. `D` is after all history records), the **current `calorie_log_user_settings`** apply — current settings are implicitly valid from the day after the last history record through today and beyond.

**`activity_level`:** nullable — if null, inherit from current settings.
**`calorie_budget`:** NOT NULL — always explicitly recorded.

---

## Phases

### Phase A: Schema and History Recording

- [x] **A.1 — Create `calorie_config_history` table migration**

  Create `go-api/db/2026-03-07-001-calorie-config-history.sql`:

  ```sql
  CREATE TABLE calorie_config_history (
    id             SERIAL PRIMARY KEY,
    user_id        INT NOT NULL REFERENCES users(id),
    valid_until    DATE NOT NULL,
    calorie_budget INT NOT NULL,
    activity_level VARCHAR(20),     -- nullable; NULL = inherit from current settings
    created_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, valid_until)
  );

  CREATE INDEX calorie_config_history_user_date
    ON calorie_config_history (user_id, valid_until);
  ```

  Run via `go run ./cmd/migrate` in `go-api/`.

- [x] **A.2 — Add Go struct for `calorie_config_history`**

  In `go-api/models.go`, add:

  ```go
  // calorieConfigHistory records a historical calorie budget and activity level snapshot.
  // When the user changes their budget or activity level, the previous values are written
  // here with valid_until = yesterday. The progress endpoint uses these to resolve per-day
  // config rather than applying today's settings uniformly across all historical dates.
  type calorieConfigHistory struct {
    ID            int        `json:"id"             db:"id"`
    UserID        int        `json:"user_id"        db:"user_id"`
    ValidUntil    DateOnly   `json:"valid_until"    db:"valid_until"`
    CalorieBudget int        `json:"calorie_budget" db:"calorie_budget"`
    ActivityLevel *string    `json:"activity_level" db:"activity_level"`
    CreatedAt     *time.Time `json:"created_at"     db:"created_at"`
  }
  ```

- [x] **A.3 — Write history record when budget or activity level changes**

  In `go-api/user_settings.go`, inside `patchUserSettings`, before the UPDATE executes:

  1. Check if the incoming patch contains `calorie_budget` or `activity_level`.
  2. If yes, compare new value against current settings. If either differs:
     - Compute `yesterday = time.Now().UTC().Truncate(24*time.Hour).AddDate(0, 0, -1)`
     - Upsert a `calorie_config_history` row with `valid_until = yesterday`, current `calorie_budget`, and current `activity_level` from settings.
     - Use `ON CONFLICT (user_id, valid_until) DO UPDATE SET calorie_budget = EXCLUDED.calorie_budget, activity_level = EXCLUDED.activity_level` — handles the case where the user changes settings twice in the same day.

  Only insert history for `calorie_budget` and `activity_level` changes. Other settings (macros, meal budgets, weight, etc.) are not historically tracked.

  - **Unit tests:** Add `go-api/user_settings_test.go`. Test that patching `calorie_budget` with a new value inserts a history record with `valid_until = yesterday` and the old budget. Test that patching an unrelated field (e.g. `protein_target_g`) does not insert a history record. Use `net/http/httptest` against a test DB.

---

### Phase B: Per-Day Config Resolution in the Progress Endpoint

- [x] **B.1 — Add `configForDate` helper to `go-api/calorie_log.go`**

  ```go
  // configForDate returns the calorie_budget and activity_level effective on the given
  // date by scanning the history slice (sorted ascending by valid_until).
  // Falls back to current settings if no history covers the date.
  func configForDate(
    history []calorieConfigHistory,
    settings *calorieLogUserSettings,
    dateStr string,
  ) (calorieBudget int, activityLevel string) {
    for _, h := range history {
      if h.ValidUntil.Format("2006-01-02") >= dateStr {
        al := ""
        if h.ActivityLevel != nil {
          al = *h.ActivityLevel
        } else if settings.ActivityLevel != nil {
          al = *settings.ActivityLevel
        }
        return h.CalorieBudget, al
      }
    }
    // No history covers this date — use current settings
    al := ""
    if settings.ActivityLevel != nil {
      al = *settings.ActivityLevel
    }
    return settings.CalorieBudget, al
  }
  ```

- [x] **B.2 — Add `tdeeForDay` and `weightAtOrBefore` helpers to `go-api/tdee.go`**

  ```go
  // tdeeForDay computes TDEE for a specific historical date using an explicit weight
  // and an activity level string. Uses current profile (height, sex, DOB) but overrides
  // weight and computes age from DOB at asOfDate rather than today.
  // Returns (tdee, ok) — ok=false if any required profile field is nil.
  func tdeeForDay(s *calorieLogUserSettings, weightLBS float64, activityLevel string, asOfDate time.Time) (float64, bool) {
    if s.Sex == nil || s.DateOfBirth == nil || s.HeightCM == nil {
      return 0, false
    }
    mult, found := activityMultipliers[activityLevel]
    if !found {
      return 0, false
    }
    age := asOfDate.Year() - s.DateOfBirth.Year()
    if asOfDate.Before(s.DateOfBirth.AddDate(age, 0, 0)) {
      age--
    }
    if age < 0 || age > 130 {
      return 0, false
    }
    weightKG := weightLBS / 2.20462
    bmrF := 10*weightKG + 6.25**s.HeightCM - 5*float64(age)
    if *s.Sex == "male" {
      bmrF += 5
    } else {
      bmrF -= 161
    }
    return bmrF * mult, true
  }

  // weightAtOrBefore returns the most recent weight_lbs from entries with date <= dateStr.
  // Falls back to fallback if no qualifying entry exists.
  func weightAtOrBefore(entries []weightEntry, dateStr string, fallback float64) float64 {
    best := fallback
    for _, e := range entries {
      if e.Date.Format("2006-01-02") <= dateStr {
        best = e.WeightLBS
      }
    }
    return best
  }
  ```

  - **Unit tests:** Add to `go-api/tdee_test.go`:
    - `tdeeForDay`: verify output matches expected TDEE for a known weight/date/profile (compare to hand-calculated Mifflin-St Jeor result).
    - `weightAtOrBefore`: verify it returns the most recent entry ≤ date, returns fallback when none qualify, returns most recent when multiple qualify.
    - `configForDate`: verify it returns the correct history record for dates within range, falls back to current settings for dates after last history record.

- [x] **B.3 — Update `getProgress` to use per-day config and compute `estimated_weight_change_lbs`**

  In `go-api/calorie_log.go`, `getProgress` handler:

  1. After fetching settings, also fetch:
     - Config history: `SELECT * FROM calorie_config_history WHERE user_id = @userID AND valid_until >= @start ORDER BY valid_until ASC` — only records relevant to the range and after.
       - Actually: fetch all records with `valid_until >= start` (the first qualifying record covers anything at or after start). Don't need records before start since those would only apply to dates before the range.
       - Wait — need to also catch the record that covers dates before start but whose `valid_until` might be before start. Re-think: fetch all history ordered ascending; `configForDate` finds first with `valid_until >= date`. So we need all records where `valid_until >= firstDayInRange`. Simplest: `WHERE user_id = @userID ORDER BY valid_until ASC` with no date filter — the table is tiny for a single user.
     - Weight entries: `SELECT * FROM weight_log WHERE user_id = @userID AND date <= @end ORDER BY date ASC` — all weight up to range end (no lower bound, to find the weight "in effect" at range start even if logged before it).

  2. In the per-day loop, for each `row`:
     ```go
     budget, actLevel := configForDate(history, settings, row.Date)
     asOf, _ := time.Parse("2006-01-02", row.Date)
     w := weightAtOrBefore(weightEntries, row.Date, fallbackWeight)
     dayTDEE, tdeeOK := tdeeForDay(settings, w, actLevel, asOf)
     ```
     Use `budget` (not `settings.CalorieBudget`) for `CalorieBudget`, `CaloriesLeft`.

  3. After the loop, compute and set `stats.EstimatedWeightChangeLbs` if `tdeeAvailable`.

- [x] **B.4 — Update `progressStats` struct in `go-api/models.go`**

  ```go
  type progressStats struct {
    DaysTracked              int      `json:"days_tracked"`
    DaysOnBudget             int      `json:"days_on_budget"`
    AvgCaloriesFood          int      `json:"avg_calories_food"`
    AvgCaloriesExercise      int      `json:"avg_calories_exercise"`
    AvgNetCalories           int      `json:"avg_net_calories"`
    TotalCaloriesLeft        int      `json:"total_calories_left"`
    EstimatedWeightChangeLbs *float64 `json:"estimated_weight_change_lbs,omitempty"`
  }
  ```

---

### Phase C: Frontend Integration

- [x] **C.1 — Update `ProgressStats` type in `packages/shared/src/types.ts`**

  ```ts
  export interface ProgressStats {
    days_tracked: number
    days_on_budget: number
    avg_calories_food: number
    avg_calories_exercise: number
    avg_net_calories: number
    total_calories_left: number
    estimated_weight_change_lbs?: number  // present when TDEE profile is complete
  }
  ```

- [x] **C.2 — Use `estimated_weight_change_lbs` in `ProgressView.tsx`**

  Locate the weight impact computation in `web-client/src/components/calorie-log/ProgressView.tsx`. Replace:

  ```ts
  const weightChange = stats ? -(stats.total_calories_left / 3500) : 0
  ```

  With:

  ```ts
  // Prefer backend TDEE-based estimate (uses per-day historical weight + age + config).
  // Fall back to budget-based approximation if TDEE profile is incomplete.
  const weightChange = stats != null
    ? (stats.estimated_weight_change_lbs != null
        ? stats.estimated_weight_change_lbs
        : -(stats.total_calories_left / 3500))
    : 0
  ```

  No display changes needed — sign convention is the same (positive = gaining, negative = losing).

---

### Phase D: Historical Data Import

- [x] **D.1 — Create one-time import SQL script**

  Create `go-api/db/misc/import-calorie-budget-history.sql`.

  The script imports historical budget periods extracted from `docs/legacy-calorie-log-data/Calorie Log - Day Summaries.csv`. The CSV has columns: `DATE,CALORIE BUDGET,...`. Multiple rows exist per date; data spans 2024-02-24 to early 2026.

  **Algorithm used to produce the INSERT values:**
  1. Deduplicate rows by date, taking the `CALORIE BUDGET` value.
  2. Group days by ISO week (Mon–Sun), keyed by that week's Monday.
  3. For each week: compute the average budget across all days in the week, then round to the nearest 100 (e.g. 2443 → 2400, 2457 → 2500).
  4. Walk weeks in chronological order. When the rounded budget changes from the previous week, emit a history record. `valid_until` = Monday of the new week minus 1 day (Sunday — the last day the old budget applied).
  5. Skip the final run if its rounded budget matches the current `calorie_budget` in settings (2300) — those weeks are covered by current settings.

  - **Manual test:** After running the script, query `SELECT * FROM calorie_config_history ORDER BY valid_until ASC` and spot-check a few dates against the CSV. Open the Progress tab for the 1Y or All range and verify the weight impact number becomes more plausible.

---

### Phase E: Historical Budget and TDEE in Daily and Weekly Endpoints

Both `getDailySummary` and `getWeekSummary` currently apply today's `calorie_budget` uniformly across all dates. They should resolve the historically correct budget (and compute historically accurate TDEE) using the same `configForDate` / `weightAtOrBefore` / `tdeeForDay` helpers from Phase B.

- [x] **E.1 — Update `getDailySummary` to use historical budget and TDEE**

  In `go-api/calorie_log.go`, after fetching settings:

  1. Fetch config history (`SELECT * FROM calorie_config_history WHERE user_id = @userID ORDER BY valid_until ASC`) and weight log entries up to the requested date (`SELECT * FROM weight_log WHERE user_id = @userID AND date <= @date ORDER BY date ASC`).
  2. Use `configForDate` to resolve the historical `calorieBudget` and `activityLevel` for the date.
  3. Use `weightAtOrBefore` to resolve the historical weight.
  4. Override `settings.CalorieBudget` with the historical budget before computing totals.
  5. Compute TDEE at that date using `tdeeForDay(settings, historicalWeight, activityLevel, asOfDate)`. If ok, set `settings.ComputedTDEE = &tdee` directly — this makes the frontend's daily weight impact display (the "Estimated" pace under the per-meal table) historically accurate.
  6. Use the overridden `settings.CalorieBudget` for `CalorieBudget` and `CaloriesLeft` in the `dailySummary` response.

  No frontend changes needed — the response shape is unchanged; the frontend already reads `calorie_budget` and `computed_tdee` from the nested settings.

  - **Manual tests:** Navigate to a past date where the budget was different (e.g., a date in Dec 2024). Verify the ring and budget numbers reflect the historical budget, not today's.

- [x] **E.2 — Update `getWeekSummary` to use per-day historical budgets and compute weekly weight impact**

  In `go-api/calorie_log.go`:

  1. Wrap the response in a new struct:
     ```go
     // weekSummaryResponse is the response for GET /api/calorie-log/week-summary.
     type weekSummaryResponse struct {
       Days                     []weekDaySummary `json:"days"`
       EstimatedWeightChangeLbs *float64         `json:"estimated_weight_change_lbs,omitempty"`
     }
     ```
     Add this to `go-api/models.go`.

  2. After fetching settings, fetch config history (all, ASC) and weight log entries up to weekEnd.

  3. In the 7-day loop, for each day:
     - Use `configForDate` for the day's `CalorieBudget` and `activityLevel`.
     - Use `weightAtOrBefore` for the day's weight.
     - Compute `dayTDEE` via `tdeeForDay`; accumulate daily deficit (`dayTDEE - net`) into `totalDeficit`.

  4. After the loop, if all days had valid TDEE: `estimated_weight_change_lbs = totalDeficit / 3500`.

  5. Return `weekSummaryResponse{Days: result, EstimatedWeightChangeLbs: &wc}`.

- [x] **E.3 — Update frontend to handle new week summary response shape**

  The week endpoint now returns `{ days: [...], estimated_weight_change_lbs?: number }` instead of a bare array.

  1. **`packages/shared/src/types.ts`** — add:
     ```ts
     export interface WeekSummaryResponse {
       days: WeekDaySummary[]
       estimated_weight_change_lbs?: number
     }
     ```

  2. **`web-client/src/api.ts`** — update `fetchWeekSummary` return type from `WeekDaySummary[]` to `WeekSummaryResponse`.

  3. **`web-client/src/pages/CalorieLog.tsx`** — update to destructure `weekSummary.days` and pass `weekSummary.estimated_weight_change_lbs` as a new prop to `WeeklySummary`.

  4. **`web-client/src/components/calorie-log/WeeklySummary.tsx`** — add `estimatedWeightChangeLbs?: number` to props; use it in the Estimated Weight Impact card instead of computing locally from `settings.computed_tdee`. Fall back to the local computation when the prop is absent.

  - **Frontend build check:** `npm run build` in `web-client/` — no TypeScript errors.

- [x] **E.4 — Update weekly bar chart to use per-bar budget tick marks**

  In `web-client/src/components/calorie-log/WeeklySummary.tsx`:

  1. Update `dataMax` to include all per-day budgets so the scale is correct when budgets vary across the week:
     ```ts
     const dataMax = Math.max(1, ...days.map(d => d.net_calories), ...days.map(d => d.calorie_budget))
     ```
     Remove the now-unused `budgetLineY` variable.

  2. Remove the single full-width dashed budget reference line (`{budget > 0 && (...)}` block).

  3. Inside the per-day `<g>` loop, after the bar `<rect>`, draw a tick mark at each day's budget height:
     ```tsx
     {day.calorie_budget > 0 && (
       <line
         x1={bx - 3} y1={Y_BOT - scaleY(day.calorie_budget)}
         x2={bx + BAR_W + 3} y2={Y_BOT - scaleY(day.calorie_budget)}
         stroke="#2563eb" strokeWidth={2} opacity={0.8}
       />
     )}
     ```

  4. Update the legend entry from `Budget ({budget.toLocaleString()})` to just `Budget` (no number, since it may vary per day).

  5. In the tooltip (`tooltipIdx` overlay), replace the "vs. budget" row (which shows `calories_left` as a signed delta) with a plain "Budget" row showing `day.calorie_budget`:
     ```tsx
     <div className="flex justify-between text-[10px] mb-2">
       <span className="text-gray-400">Budget</span>
       <span className="text-white font-semibold">{day.calorie_budget.toLocaleString()}</span>
     </div>
     ```
     Also bump tooltip text from `text-[10px]` to `text-[10px] sm:text-xs` (date label) and value text from `text-white font-semibold` to include `sm:text-sm` for bigger numbers on desktop. Widen the tooltip container from `width: 128` to `width: 140` on desktop using an inline `style` or a wider fixed width.

- [x] **E.5 — Bigger tooltip text in Progress calorie bar chart on desktop**

  The Progress view calorie bar chart tooltip is SVG-based (unlike the weekly HTML overlay). In `web-client/src/components/calorie-log/ProgressView.tsx`, convert the SVG tooltip (`<g>` with `<rect>` + `<text>` elements, lines ~502–524) to an HTML overlay positioned with `position: absolute` — the same pattern used in `WeeklySummary.tsx`.

  The HTML overlay approach allows Tailwind responsive classes (`text-[10px] sm:text-xs sm:text-sm`) to scale text on desktop without affecting mobile.

  Steps:
  1. Wrap the `<svg>` in a `<div className="relative">`.
  2. Remove the SVG `<g>` tooltip block.
  3. Render an HTML tooltip `<div>` outside the `<svg>` (but inside the `relative` wrapper) when `tooltipIdx >= 0`, positioned using `left` as a percentage of the SVG viewBox width (same clamping logic as WeeklySummary).
  4. Use `text-[10px] sm:text-xs` for labels and `text-xs sm:text-sm` for values.

---

### Phase F: E2E Tests

- [x] **F.1 — E2E: progress tab shows estimated weight impact value**

  In `e2e/tests/progress.spec.ts`, add a test that verifies the Period Summary card displays a numeric estimated weight impact when the user has data. The test asserts that the `Estimated Weight Impact from Calorie Balance` section renders an `lbs` value (matching `/[+-]?\d+\.\d+ lbs/`) — proving the backend is computing and returning `estimated_weight_change_lbs` end-to-end.

  ```ts
  test('Period Summary shows estimated weight impact when data exists', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress' }).click()
    await expect(page.getByText('Period Summary')).toBeVisible()

    // Switch to All-time range to maximize chance of data being present
    await page.getByRole('button', { name: 'All' }).click()

    // Estimated weight impact figure should be present (a ±X.XX lbs value)
    const impactValue = page.locator('text=/[+-]?\\d+\\.\\d+ lbs/').first()
    await expect(impactValue).toBeVisible()
  })
  ```

- [x] **F.2 — E2E: weekly estimated weight impact is displayed**

  In `e2e/tests/calorie-log.spec.ts` (or a new `weekly.spec.ts`), add a test that navigates to the Weekly tab and verifies the Estimated Weight Impact card renders a `lbs/wk` value. This proves the `estimated_weight_change_lbs` field from the new week response is consumed by the frontend.

  ```ts
  test('Weekly tab shows Estimated Weight Impact', async ({ page }) => {
    await page.getByRole('button', { name: 'Weekly' }).click()
    await expect(page.getByText('Estimated Weight Impact')).toBeVisible()

    // lbs/wk value should be rendered
    const paceValue = page.locator('text=/[+-]?\\d+\\.\\d+ lbs\\/wk/').first()
    await expect(paceValue).toBeVisible()
  })
  ```

- [x] **F.3 — E2E: settings budget change propagates to daily view**

  In `e2e/tests/calorie-log.spec.ts`, add a test that navigates to Settings, changes the calorie budget, returns to the Daily tab, and verifies the ring/header reflects the new budget. This tests the live (current-day) budget path end-to-end.

  ```ts
  test('changing calorie budget in settings is reflected in daily view', async ({ page }) => {
    // Navigate to Settings and update the budget
    await page.goto('/settings')
    const budgetInput = page.locator('input[name="calorie_budget"], input#calorie_budget')
    await budgetInput.fill('2150')
    await page.getByRole('button', { name: /save/i }).click()

    // Return to daily view — budget should be 2150
    await page.goto('/calorie-log')
    await expect(page.getByText('2,150')).toBeVisible()

    // Restore original budget (cleanup)
    await page.goto('/settings')
    await budgetInput.fill('2300')
    await page.getByRole('button', { name: /save/i }).click()
  })
  ```

  - **Note:** The exact selectors for the settings form inputs will need to match the actual Settings page implementation. Adjust if the input `name` or `id` differs.

---

## Files Created / Modified

| File | Action |
|------|--------|
| `go-api/db/2026-03-07-001-calorie-config-history.sql` | CREATE — schema migration |
| `go-api/db/misc/import-calorie-budget-history.sql` | CREATE — one-time import script |
| `go-api/models.go` | MODIFY — add `calorieConfigHistory` struct; add `EstimatedWeightChangeLbs` to `progressStats` |
| `go-api/user_settings.go` | MODIFY — write history record on budget/activity change |
| `go-api/calorie_log.go` | MODIFY — `getProgress` uses per-day config and computes TDEE-based weight change |
| `go-api/tdee.go` | MODIFY — add `tdeeForDay` and `weightAtOrBefore` helpers |
| `go-api/tdee_test.go` | MODIFY/CREATE — unit tests for new helpers |
| `go-api/user_settings_test.go` | CREATE — tests for history recording on patch |
| `packages/shared/src/types.ts` | MODIFY — add `estimated_weight_change_lbs?` to `ProgressStats` |
| `web-client/src/components/calorie-log/ProgressView.tsx` | MODIFY — use new field with budget-based fallback |

---

## Verification

1. **Go unit tests:** `go test ./...` in `go-api/` — all helpers pass.
2. **Go build:** `go build ./...` — no errors.
3. **Run migration:** `go run ./cmd/migrate` — `calorie_config_history` table created.
4. **Run import script:** `psql $DB_URL -f db/misc/import-calorie-budget-history.sql` — N rows inserted.
5. **Frontend build:** `npm run build` in `web-client/` — no TypeScript errors.
6. **Manual — history recording:** Change calorie budget in Settings. Query `calorie_config_history` — one new row with `valid_until = yesterday` and the old budget.
7. **Manual — Progress tab:** Open Progress → All Time range. Verify estimated weight change is plausible (should roughly correlate with observed weight change in the Weight chart).
8. **Manual — Weekly tab:** Estimated Weight Impact card should now show a more consistent value when budget has changed over the period shown.
