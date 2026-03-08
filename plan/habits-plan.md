# Habits Feature

## Goal

Build a full habit tracker module in Stride. Users define daily and weekly habits with 1–3 levels of completion (L1 = bare minimum, L2/L3 = stretch goals). Each day they tap a habit circle to cycle through levels, see their streak and consistency stats, and review weekly progress in a separate tab. The feature lives at `/habits` in the sidebar. Includes particle burst + audio feedback on level-up, and a full-screen celebration effect when all habits reach the same level in a single session.

---

## Data Model Decisions

- **`habits` table:** Level labels are inline (`level1_label`, `level2_label`, `level3_label`) — max 3 levels is a fixed product constraint, not a dynamic list. A separate levels table adds joins for no benefit.
- **`habit_logs` table:** Sparse model — no row means not completed. One row per `(user_id, habit_id, date)` with a `level` column (1–3). Upserting with level 0 deletes the row (reset).

---

## Phases

### Phase A: Database & Go API

- [x] **A.1 — DB migrations: `habits` and `habit_logs` tables**

  Create `go-api/db/migrations/2026-03-07-001-habits.sql`:

  ```sql
  CREATE TYPE habit_frequency AS ENUM ('daily', 'weekly');

  CREATE TABLE habits (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    emoji         TEXT,
    color         TEXT,
    frequency     habit_frequency NOT NULL DEFAULT 'daily',
    weekly_target INTEGER,                      -- NULL for daily; 1–7 for weekly
    level1_label  TEXT NOT NULL,
    level2_label  TEXT,
    level3_label  TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    archived_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE habit_logs (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date       DATE NOT NULL,
    level      SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, habit_id, date)
  );
  ```

  - **Manual test:** Run `go run ./cmd/migrate` — migration applies cleanly; re-running is a no-op.

- [x] **A.2 — Go models + streak computation (`go-api/habits.go`, `go-api/models.go`)**

  Add `habit` and `habitLog` structs to `go-api/models.go` with `db:` tags matching the schema.

  Add `computeHabitStreak(logs []habitLog, freq string, weeklyTarget int, today time.Time) (current, longest int)` in `go-api/habits.go`:
  - **Daily:** Walk backwards from today (or yesterday if today has no log); count consecutive days with a log row. Stop on the first gap.
  - **Weekly:** Walk backwards in week buckets (Mon–Sun); count consecutive weeks where `COUNT(logs in week) >= weeklyTarget`. Stop on the first week that misses.
  - Returns `(currentStreak, longestStreak)`.

  - **Unit tests:** `go-api/habits_test.go` covering:
    - Unbroken N-day daily streak
    - Single gap breaks daily streak
    - Today not yet logged — yesterday's log still counts (streak continues)
    - Weekly: completions hit target → streak increments
    - Weekly: below target → streak breaks
    - Longest streak tracked correctly across multiple runs of streaks

- [x] **A.3 — Habit CRUD endpoints (`go-api/habits.go`)**

  Register in `go-api/main.go`:
  ```
  GET    /api/habits              → listHabits(date query param)
  POST   /api/habits              → createHabit
  PATCH  /api/habits/:id          → updateHabit
  POST   /api/habits/:id/archive  → archiveHabit
  DELETE /api/habits/:id          → deleteHabit (cascades to habit_logs)
  ```

  `GET /api/habits?date=YYYY-MM-DD`: LEFT JOIN `habit_logs` for the requested date, compute `current_streak`, `longest_streak`, `consistency_30d` (%), and `avg_level_30d` for each habit. Returns `[]HabitWithLog`.

  `POST /api/habits`: Validate name + level1_label required; weekly_target required and 1–7 when frequency = weekly. Inserts and returns the created habit.

  `PATCH /api/habits/:id`: Verify habit belongs to `user_id`. Update provided fields only (dynamic SET clause). Returns updated habit.

  `POST /api/habits/:id/archive`: Sets `archived_at = NOW()`. `DELETE /api/habits/:id`: Hard delete (logs cascade).

- [x] **A.4 — Habit log upsert endpoint (`go-api/habits.go`)**

  ```
  PUT /api/habit-logs   body: { habit_id, date, level }
  ```

  - Verify the habit belongs to `user_id` before writing (prevents cross-user writes).
  - If `level == 0`: `DELETE FROM habit_logs WHERE user_id=@u AND habit_id=@h AND date=@d`. Returns `null`.
  - If `level` 1–3: `INSERT ... ON CONFLICT (user_id, habit_id, date) DO UPDATE SET level=@level, updated_at=NOW()`. Returns the upserted `habitLog`.

- [x] **A.5 — Weekly progress + habit detail log endpoints (`go-api/habits.go`)**

  ```
  GET /api/habits/week?week_start=YYYY-MM-DD   → []HabitWeekEntry
  GET /api/habits/:id/logs?from=YYYY-MM-DD&to=YYYY-MM-DD  → []HabitLog
  ```

  `week` endpoint: Returns all non-archived habits with their logs for the 7-day window. Used by the Progress tab.

  `logs` endpoint: Returns all logs for a single habit in a date range. Used by the Habit Detail heatmap (90-day window).

---

### Phase B: Shared Types & API Client

- [x] **B.1 — TypeScript types (`packages/shared/src/types.ts`)**

  Add:
  ```ts
  export interface Habit {
    id: number
    user_id: number
    name: string
    emoji: string | null
    color: string | null
    frequency: 'daily' | 'weekly'
    weekly_target: number | null
    level1_label: string
    level2_label: string | null
    level3_label: string | null
    sort_order: number
    archived_at: string | null
    created_at: string
    updated_at: string
  }

  export interface HabitLog {
    id: number
    user_id: number
    habit_id: number
    date: string      // YYYY-MM-DD
    level: 1 | 2 | 3
  }

  // Returned by GET /api/habits?date=
  export interface HabitWithLog extends Habit {
    log: HabitLog | null   // the requested date's log entry
    current_streak: number
    longest_streak: number
    consistency_30d: number  // 0–100
    avg_level_30d: number
  }

  // Returned by GET /api/habits/week
  export interface HabitWeekEntry {
    habit: Habit
    logs: HabitLog[]
  }

  export type CreateHabitInput = Omit<Habit, 'id' | 'user_id' | 'archived_at' | 'created_at' | 'updated_at'>
  export type UpdateHabitInput = Partial<CreateHabitInput>
  ```

- [x] **B.2 — API functions (`web-client/src/api.ts`)**

  Add:
  ```ts
  fetchHabits(date: string): Promise<HabitWithLog[]>
  createHabit(input: CreateHabitInput): Promise<Habit>
  updateHabit(id: number, input: UpdateHabitInput): Promise<Habit>
  archiveHabit(id: number): Promise<void>
  deleteHabit(id: number): Promise<void>
  upsertHabitLog(habitId: number, date: string, level: 0 | 1 | 2 | 3): Promise<HabitLog | null>
  fetchHabitsWeek(weekStart: string): Promise<HabitWeekEntry[]>
  fetchHabitLogs(habitId: number, from: string, to: string): Promise<HabitLog[]>
  ```

- [x] **B.3 — `useHabits` hook + tests**

  Create `web-client/src/hooks/useHabits.ts`:
  ```ts
  function useHabits(date: string): {
    habits: HabitWithLog[]
    loading: boolean
    error: string
    reload: () => void
    logLevel: (habitId: number, level: 0 | 1 | 2 | 3) => Promise<void>
  }
  ```

  `logLevel` updates local state optimistically (mutate the matching habit's `.log` field immediately, then call `upsertHabitLog`). On error, roll back and show a toast. Avoids a full refetch on every tap — important for snappy feel.

  - **Vitest tests:** `web-client/src/hooks/useHabits.test.ts` (MSW for network mocking):
    - Fetches habits on mount; sets `loading` correctly
    - `logLevel(id, 2)` sends PUT and updates matching habit's log in state
    - API error during `logLevel` rolls back optimistic update
    - Date change triggers re-fetch

---

### Phase C: Routing & Navigation

- [x] **C.1 — Add `/habits` route + sidebar nav item**

  In `web-client/src/router.tsx`: add `<Route path="habits" element={<HabitsPage />} />` and `<Route path="habits/:id" element={<HabitDetail />} />` inside the authenticated group.

  In `web-client/src/components/AppShell.tsx`: add a "Habits" sidebar nav item (circle-check icon, `stroke-width="2"`) between Calorie Log and Recipes. Apply the same active style (`bg-stride-50 text-stride-700 font-medium`) using `useMatch('/habits*')`.

  Update `CLAUDE.md` Architecture section to document the new routes and tables.

---

### Phase D: Today Tab UI

- [x] **D.1 — `HabitCard.tsx` — expandable habit row**

  Create `web-client/src/components/habits/HabitCard.tsx`.

  Props: `habit: HabitWithLog`, `date: string`, `onLogLevel: (level: 0|1|2|3) => void`, `onEdit: () => void`, `onArchive: () => void`, `onDelete: () => void`, `onViewDetail: () => void`.

  **Collapsed:** 44px level circle (tap advances level) + emoji + name + level badge (`L1`/`L2`/`L3 ✦`) + status line (label of current level, or "Not logged yet") + next-level hint (`→ L2: Go outside 15+ min`) + `···` overflow button + chevron.

  **Expanded:** Level list (each level with colored dot, label, `current` or `← next` indicator) + stats row (Consistency % | 🔥 Streak | Avg level).

  Level circle colors: indigo `#4f46e5` (L1), emerald `#10b981` (L2), amber `#f59e0b` (L3). Empty: gray bg + gray border. L3 gets a subtle box-shadow ring glow.

  Long-press circle (500ms) resets to 0 after a `window.confirm`. On mobile, use `onTouchStart`/`onTouchEnd` timing to detect long press; on desktop, `onMouseDown`/`onMouseUp`.

  For weekly habits, collapsed status shows `2 / 3× this week` instead of a level label when unlogged.

  - **Vitest tests:** `HabitCard.test.tsx`:
    - Renders level badge for a logged habit
    - Clicking circle calls `onLogLevel` with incremented level
    - At max level, clicking circle calls `onLogLevel(0)` to reset
    - Long press triggers reset confirm flow
    - Chevron click toggles expanded section

- [x] **D.2 — `AddHabitSheet.tsx` — create/edit form**

  Create `web-client/src/components/habits/AddHabitSheet.tsx`.

  Bottom sheet on mobile (slides up from bottom with drag handle), modal-style on desktop (`sm:` breakpoint). Same animation pattern as `AddItemSheet.tsx`.

  Fields:
  - Emoji button (opens a simple grid of 20 common emojis, or free-text input)
  - Name text input (required)
  - Frequency: Daily / Weekly tab switcher
    - Weekly: stepper `"__ times per week"` (1–7)
  - Levels: L1 always shown. Toggles to reveal L2 and L3 text inputs. Each input is the level label (e.g. "Go outside 15+ min").
  - Color accent: 6 preset color swatches (indigo, emerald, amber, rose, sky, purple)

  Edit mode: pre-fill all fields. "Delete Habit" button at bottom (red, requires `window.confirm`).

  - **Vitest tests:** `AddHabitSheet.test.tsx`:
    - Submit without name shows validation error
    - Submit without L1 label shows validation error
    - Selecting Weekly shows the times-per-week stepper
    - Edit mode pre-fills name, frequency, and level labels
    - Delete button only appears in edit mode

- [x] **D.3 — `HabitsPage.tsx` — Today tab**

  Create `web-client/src/pages/HabitsPage.tsx`.

  **Sticky header:** "Habits" title + Today/Progress tabs (same border-b-[3px] pattern as CalorieLog) + settings gear (navigates to add-habit sheet or future settings).

  **Today sub-header:**
  - Desktop (`lg:` only): 7-day week strip inside a `bg-gray-100 rounded-full` capsule. Each day is a tappable button — past and today are active; future days are visually faded + disabled. Selected day gets a `ring-2 ring-stride-500` highlight. Prev/Next week arrows on the sides. Navigating to a past week defaults the selected day to Sunday.
  - Mobile (always visible): compact date display (`"Sat, Mar 7"`) with `←` / `→` arrows to step one day at a time. No week strip — too cramped.

  **Past-day banner:** When selected date ≠ today, show amber `"[Day, Date] · editing past log"` banner at top of habit list.

  **Habit list:** Daily section header + `HabitCard` for each daily habit. Weekly section header + `HabitCard` for each weekly habit. Both sections only shown if they have habits. Empty state (no habits at all): centered illustration + "Add your first habit" prompt.

  **FAB:** `+` button `fixed bottom-6 right-6`, opens `AddHabitSheet` in create mode.

  Wire up `useHabits(selectedDate)`. Pass `logLevel` to each `HabitCard`'s `onLogLevel`. After level changes, check the celebration condition (see Phase E).

  - **Manual tests (Android physical device):**
    - Tap circle → level advances; scale-down animation plays
    - Long-press circle → confirm dialog appears; cancelling leaves level unchanged
    - Sheet keyboard-avoidance: typing habit name doesn't hide the save button
    - Mobile date arrows step day by day correctly

  - **E2E tests:** `e2e/tests/habits.spec.ts` and `e2e/tests/habits-mobile.spec.ts`:
    - Create habit → appears in Today list with correct name and empty circle
    - Tap circle on a habit → circle fills with L1 color; streak shows "🔥 1"
    - Navigate to yesterday → amber banner visible; tap circle → dot fills in week strip
    - Archive habit via `···` menu → habit disappears from Today list; no error

---

### Phase E: Particle & Sound Effects

- [x] **E.1 — `habitEffects.ts` — polished particle system + audio**

  Create `web-client/src/utils/habitEffects.ts`. This module manages a singleton canvas and `AudioContext`.

  **Canvas:**
  - Full-screen `position: fixed` canvas with `pointer-events: none; z-index: 9999` appended to `<body>` once on first use.
  - Scale by `window.devicePixelRatio` so particles are crisp on HiDPI screens.
  - Resize handler keeps canvas dimensions current.

  **Particle shapes (randomised per particle):**
  - Circle (60% of particles) — `arc()` fill
  - Small square (25%) — `fillRect()` with slight random rotation
  - 4-pointed sparkle cross (15%) — drawn as two thin rotated rectangles; used more on L3

  **Physics:**
  - Outward velocity from origin; slight upward bias (`vy -= 1` at spawn)
  - Velocity decay: `vx *= 0.96; vy *= 0.96` per frame (exponential, feels snappier than linear)
  - Gravity: `vy += 0.2` per frame
  - Alpha: linear fade at `0.032/frame`; particles removed at `alpha < 0.01`

  **Level aesthetics:**
  - L1 (indigo): solid particles, no glow
  - L2 (emerald): solid particles, no glow
  - L3 (amber/gold): `ctx.shadowBlur = 8; ctx.shadowColor = '#f59e0b'` for a gold glow

  **`spawnBurst(originEl: HTMLElement, level: 1|2|3, count = 24)`:**
  Gets element's `getBoundingClientRect()` center and spawns `count` particles radiating outward. Called from `HabitCard` after circle tap.

  **`spawnCelebration(originEl: HTMLElement, level: 1|2|3)`:**
  Spawns 80 particles in a fountain pattern — most shoot upward (angle range: -150° to -30° from horizontal) with higher initial speed, then spread under gravity. A secondary ring of 20 particles fans sideways for width. Creates a fireworks-fountain feel from the day pill.

  **Audio (`AudioContext` singleton, lazy-init on first gesture):**
  - Single habit check (`playCheckSound(level: 1|2|3)`): two-note rising interval via two `OscillatorNode`s. Pitches per level:
    - L1: C5 (523 Hz) + G5 (784 Hz)
    - L2: E5 (659 Hz) + B5 (988 Hz)
    - L3: A5 (880 Hz) + E6 (1319 Hz)
    Each note: `sine` oscillator, attack 5ms, decay 250ms via `GainNode.exponentialRampToValueAtTime`. Notes offset by 60ms.
  - Celebration (`playCelebrationSound(level: 1|2|3)`): ascending 4-note arpeggio, notes staggered 90ms apart, with a short `DelayNode` (0.15s, feedback 0.3) for a natural reverb trail. Timbre: blend of `sine` + `triangle` oscillators for warmth.
  - Mute flag: `localStorage.getItem('habits_mute')`. If `'1'`, skip all audio. (A mute toggle can be added to the settings gear later.)

  **Exports:**
  ```ts
  export function spawnBurst(el: HTMLElement, level: 1|2|3): void
  export function spawnCelebration(el: HTMLElement, level: 1|2|3): void
  export function playCheckSound(level: 1|2|3): void
  export function playCelebrationSound(level: 1|2|3): void
  ```

  **Integration in `HabitsPage.tsx`:**
  After `logLevel` resolves with `newLevel > 0`, call `spawnBurst(circleEl, newLevel)` and `playCheckSound(newLevel)`. Then check if all habits share the same non-zero level; if so and not already celebrated for that level today (track in a `useRef<Set<number>>`), call `spawnCelebration(dayPillEl, level)` and `playCelebrationSound(level)`. Reset the ref when selected date changes.

  - **Manual tests:** Open the Today view in a browser; check each level produces distinct colours and sounds; verify no particles when resetting to 0; verify celebration fires exactly once per level per day.

---

### Phase F: Progress Tab & Habit Detail

- [x] **F.1 — `ProgressTab.tsx` — weekly progress view**

  Create `web-client/src/components/habits/ProgressTab.tsx`.

  **Week navigator:** `bg-gray-100 rounded-full` capsule with prev/next arrows and week range label (e.g. "3–9 Mar") + "now" badge for current week. Always visible (not desktop-only). Uses `shiftWeek` date utility.

  **Weekly summary card:** Per-day colored bar row (Mon–Sun); bar color = highest level logged across all habits that day (gray if nothing logged, dashed if future). Stats below: Days on track (N/total) | Completion % | Avg level. "In progress" badge on current week.

  **Habit list cards:** emoji + name; dot strip — daily habits show 7 coloured squares (Mon–Sun), weekly habits show exactly `weekly_target` slots filled left-to-right by chronological completions with the weekday letter beneath each filled slot; right side shows days logged / streak / avg level for the week; `···` menu (edit/archive/delete); chevron to expand.

  **Expanded habit:** Streak | Longest | 30-day % | Avg level stats row + level breakdown bars + mini 8-week heatmap (14×8 grid of coloured squares) + "View full history →" link to `/habits/:id`.

  Uses `fetchHabitsWeek(weekStart)` — reload when week navigator changes.

  - **E2E tests** (add to `e2e/tests/habits.spec.ts`):
    - Switch to Progress tab → weekly summary card is visible
    - Click a habit card → expanded section shows streak and consistency numbers
    - Navigate to previous week → week label updates; "in progress" badge disappears

- [x] **F.2 — `HabitDetail.tsx` — full history page**

  Create `web-client/src/pages/HabitDetail.tsx` at route `/habits/:id`.

  **Header:** `←` breadcrumb back to `/habits`, habit emoji + name, pencil edit button (opens `AddHabitSheet` in edit mode).

  **Stats row:** Current streak | Longest streak | 30-day completion % | Avg level (last 30 days). Four equal-width cells.

  **Levels card:** Plain list — each level's colored numbered dot + label. No current/next indicators; this is a definition view, not a live state view.

  **Level breakdown:** Horizontal bar chart showing percentage of completions at L1 / L2 / L3 over the last 30 days. Each row: colored dot + count + bar + percentage.

  **Heatmap (last 13 weeks):** 7-column × 13-row grid of 14px rounded squares. Columns = Mon–Sun (day letter header). Rows = weeks (oldest top, newest bottom). Colors: `#e5e7eb` miss/unlogged, `#4f46e5` L1, `#10b981` L2, `#f59e0b` L3. Legend row: Miss | L1 | L2 | L3. Month label on leftmost cell of each new month.

  **Recent log:** Last 14 days — date + day name + level badge (or "—" if not logged). Scrollable list.

  Fetches via `fetchHabits(today)` (for stats/streak) + `fetchHabitLogs(id, from, to)` (for heatmap + recent log).

  - **Manual tests:**
    - Navigate to habit detail from Progress tab "View full history →" link
    - Heatmap colors match the levels actually logged
    - Edit button opens pre-filled sheet; saving reflects updated name in header
    - On Android: heatmap does not clip horizontally (use `overflow-x: auto` if needed)

---

## File Map

| File | Phase | New / Modified |
|------|-------|----------------|
| `go-api/db/migrations/2026-03-07-001-habits.sql` | A.1 | New |
| `go-api/models.go` | A.2 | Modified |
| `go-api/habits.go` | A.2–A.5 | New |
| `go-api/habits_test.go` | A.2 | New |
| `go-api/main.go` | A.3 | Modified (route registration) |
| `packages/shared/src/types.ts` | B.1 | Modified |
| `web-client/src/api.ts` | B.2 | Modified |
| `web-client/src/hooks/useHabits.ts` | B.3 | New |
| `web-client/src/hooks/useHabits.test.ts` | B.3 | New |
| `web-client/src/router.tsx` | C.1 | Modified |
| `web-client/src/components/AppShell.tsx` | C.1 | Modified |
| `web-client/src/components/habits/HabitCard.tsx` | D.1 | New |
| `web-client/src/components/habits/HabitCard.test.tsx` | D.1 | New |
| `web-client/src/components/habits/AddHabitSheet.tsx` | D.2 | New |
| `web-client/src/components/habits/AddHabitSheet.test.tsx` | D.2 | New |
| `web-client/src/pages/HabitsPage.tsx` | D.3 | New |
| `web-client/src/utils/habitEffects.ts` | E.1 | New |
| `web-client/src/components/habits/ProgressTab.tsx` | F.1 | New |
| `web-client/src/pages/HabitDetail.tsx` | F.2 | New |
| `e2e/tests/habits.spec.ts` | D.3, F.1 | New |
| `e2e/tests/habits-mobile.spec.ts` | D.3 | New |
| `CLAUDE.md` | C.1 | Modified (routes + tables) |
