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

- [ ] **A.1 — Create `calorie_config_history` table migration**

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

- [ ] **A.2 — Add Go struct for `calorie_config_history`**

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

- [ ] **A.3 — Write history record when budget or activity level changes**

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

- [ ] **B.1 — Add `configForDate` helper to `go-api/calorie_log.go`**

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

- [ ] **B.2 — Add `tdeeForDay` and `weightAtOrBefore` helpers to `go-api/tdee.go`**

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

- [ ] **B.3 — Update `getProgress` to use per-day config and compute `estimated_weight_change_lbs`**

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

- [ ] **B.4 — Update `progressStats` struct in `go-api/models.go`**

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

- [ ] **C.1 — Update `ProgressStats` type in `packages/shared/src/types.ts`**

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

- [ ] **C.2 — Use `estimated_weight_change_lbs` in `ProgressView.tsx`**

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

- [ ] **D.1 — Create one-time import SQL script**

  Create `go-api/db/seed/import-calorie-budget-history.sql`.

  The script imports historical budget periods extracted from `docs/legacy-calorie-log-data/Calorie Log - Day Summaries.csv`. The CSV has columns: `DATE,CALORIE BUDGET,...`. Multiple rows exist per date (duplicate date rows have the same budget); the data spans 2024-02-24 to early 2026.

  **Algorithm used to produce the INSERT values:**
  1. Deduplicate rows by date, taking the `CALORIE BUDGET` value (same for all rows of a date).
  2. Sort chronologically.
  3. Identify "runs" of consecutive days with the same budget.
  4. For each run: `valid_until` = last date of that run.
  5. Skip the final run if it matches the current `calorie_budget` in `calorie_log_user_settings` (it would never be queried — current settings act as the default).

  **Script structure:**
  ```sql
  -- One-time import of historical calorie budget periods from legacy spreadsheet.
  -- Run once: psql $DB_URL -f import-calorie-budget-history.sql
  -- Assumes user_id = 1. Adjust if needed.
  -- activity_level is NULL — will inherit from current settings at query time.

  INSERT INTO calorie_config_history (user_id, valid_until, calorie_budget, activity_level)
  VALUES
    (1, '2024-02-24', 2200, NULL),
    (1, '...', ..., NULL),
    -- ... one row per distinct budget period
  ON CONFLICT (user_id, valid_until) DO NOTHING;
  ```

  The actual INSERT values will be computed by analyzing the CSV. Note: the CSV budget fluctuates frequently (often week to week) so there will be many records — each is a distinct `valid_until` date, the last day before the budget changes.

  - **Manual test:** After running the script, query `SELECT * FROM calorie_config_history ORDER BY valid_until ASC` and spot-check a few dates against the CSV. Open the Progress tab for the 1Y or All range and verify the weight impact number becomes more plausible (e.g. for a period where the budget was 2300/day and the user was close to budget, the weight impact should be near 0 or a small loss).

---

## Files Created / Modified

| File | Action |
|------|--------|
| `go-api/db/2026-03-07-001-calorie-config-history.sql` | CREATE — schema migration |
| `go-api/db/seed/import-calorie-budget-history.sql` | CREATE — one-time import script |
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
4. **Run import script:** `psql $DB_URL -f db/seed/import-calorie-budget-history.sql` — N rows inserted.
5. **Frontend build:** `npm run build` in `web-client/` — no TypeScript errors.
6. **Manual — history recording:** Change calorie budget in Settings. Query `calorie_config_history` — one new row with `valid_until = yesterday` and the old budget.
7. **Manual — Progress tab:** Open Progress → All Time range. Verify estimated weight change is plausible (should roughly correlate with observed weight change in the Weight chart).
8. **Manual — Weekly tab:** Estimated Weight Impact card should now show a more consistent value when budget has changed over the period shown.
