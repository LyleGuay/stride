# Journal UX Improvements — LYL-41

## Goal

Implement two sets of journal UX improvements designed in `design/features/journal-ux-improvements/`. First: a calendar date picker on the Daily tab so the user can jump directly to any past date without tapping ← repeatedly — the calendar shows mood-colored dots for days that have entries. Second: a full redesign of the Summary tab with new time range selectors (Week/Month/6M/1yr), a bar chart replacing the line chart for Mental State, a dark tooltip on bar click (matching calorie log style), clickable emotion/type bars that drill into matching days, and a simplified stats row.

---

## Phase A: Backend — Calendar Endpoint

- [x] **A.1 — Add `getJournalCalendar` handler to `go-api/journal.go`**

  New endpoint: `GET /api/journal/calendar?month=YYYY-MM`

  Returns one row per day in the month that has at least one entry:
  ```json
  [{ "date": "2026-04-03", "entry_count": 3, "avg_score": 4.2 }]
  ```

  `avg_score` is computed using the same tag→score mapping already in `getJournalSummary`. Days with no scoring tags return `avg_score: null`. Days with no entries are omitted entirely — the frontend treats absence as no dot.

  The `tags` column is a PostgreSQL array (`journal_tag[]`), so the query must `unnest(tags)` before joining to the score mapping. Query shape:
  ```sql
  SELECT entry_date::text AS date,
         COUNT(*) AS entry_count,
         AVG(score) FILTER (WHERE score > 0) AS avg_score
  FROM journal_entries
       CROSS JOIN LATERAL unnest(tags) AS t(tag)
       JOIN (VALUES ('happy',4), ('excited',5), ...) AS scores(tag, score)
         ON scores.tag = t.tag::text
  WHERE user_id = $1
    AND date_trunc('month', entry_date) = date_trunc('month', $2::date)
  GROUP BY entry_date
  ORDER BY entry_date
  ```

  Add Go response struct `journalCalendarDay` and handler `getJournalCalendar` in `go-api/journal.go`.

  - **Go integration tests:** `go-api/journal_test.go` — add a test that seeds a month with entries (some with emotion tags, some without), calls `GET /api/journal/calendar?month=YYYY-MM`, and verifies: only days with entries appear, `avg_score` is null for days with no scoring tags, `entry_count` is correct.
  - **Manual tests:** Call `GET /api/journal/calendar?month=2026-04` and verify days with entries appear, days without do not, `avg_score` is absent when no emotion tags.

- [x] **A.2 — Register the calendar route in `go-api/handler.go`**

  Add `r.GET("/journal/calendar", h.getJournalCalendar)` in the authenticated route group alongside the existing journal routes (lines ~114–119).

---

## Phase B: Backend — Summary Endpoint Redesign

- [x] **B.1 — Update range values and add `ref_date` param to `getJournalSummary` in `go-api/journal.go`**

  **Old ranges:** `1m | 6m | ytd | all`
  **New ranges:** `week | month | 6m | 1yr`

  - `week`: the Mon–Sun week containing `ref_date` (default: today)
  - `month`: the calendar month containing `ref_date` (default: today)
  - `6m`: trailing 26 ISO weeks from today (no `ref_date` used)
  - `1yr`: trailing 52 ISO weeks from today (no `ref_date` used)

  Add `ref_date` query param (string `YYYY-MM-DD`, default today). Resolve all date arithmetic server-side to avoid client timezone issues.

- [x] **B.2 — Rewrite `mental_state_points` to `mental_state_bars` in the summary response**

  Replace the existing `mentalStatePoint` struct (date + score) with a richer bar struct:
  ```go
  type mentalStateBar struct {
      Label      string   `json:"label"`       // "Mon", "1", "W12"
      Date       string   `json:"date"`         // YYYY-MM-DD (day or ISO week-start Monday)
      Score      *float64 `json:"score"`        // null if no scoring tags
      EntryCount int      `json:"entry_count"`
      Emotions   []string `json:"emotions"`     // distinct emotion/condition tags for the tooltip
  }
  ```

  For `week`/`month`, each bar is one calendar day — group by `entry_date`. For `6m`/`1yr`, each bar is one ISO week — group by `date_trunc('week', entry_date)`. In both cases, collect distinct scoring tags via `ARRAY_AGG(DISTINCT tag)` after unnesting (same unnest pattern as A.1).

  Update `journalSummaryResponse` struct: replace `MentalStatePoints` with `MentalStateBars []mentalStateBar`, and add `TotalEntries int` and `DaysLogged int`.

  - **Go integration tests:** `go-api/journal_test.go` — add tests for: (a) week range returns exactly 7 bars (Mon–Sun), with null score for days with no entries; (b) 6m range returns 26 bars; (c) bars for days with emotion tags have non-null `score` and non-empty `emotions`.

- [x] **B.3 — Add `getJournalTagDays` handler to `go-api/journal.go`**

  New endpoint: `GET /api/journal/tag-days?tag=happy&range=week&ref_date=2026-04-03`

  Returns days in the range that have the given tag, ordered newest first:
  ```json
  [{ "date": "Apr 3", "entry_count": 3, "preview": "Good sleep, feeling energized..." }]
  ```

  `preview` is the first 80 chars of the `body` of the earliest entry that day. This endpoint is fetched lazily (only when the user taps an emotion/type bar), so latency is acceptable.

  Register route in `go-api/handler.go`: `r.GET("/journal/tag-days", h.getJournalTagDays)`

  - **Go integration tests:** `go-api/journal_test.go` — seed entries across two weeks with mixed tags; call with `tag=happy&range=week&ref_date=<this week>` and verify only days in that week with the happy tag are returned; verify `preview` is truncated to 80 chars.
  - **Manual tests:** Call with `tag=happy&range=week` — only days in the current week with the happy tag appear; verify preview text.

---

## Phase C: Frontend — Types, API, Hooks

- [x] **C.1 — Consolidate emoji/color constants in `web-client/src/components/journal/journalColors.ts`**

  Currently the file has four separate maps: `EMOTION_COLORS`, `EMOTION_EMOJIS`, `CONDITION_COLORS`, `CONDITION_EMOJIS`. Consolidate into a single `TAG_META` map so there is one place to look up both the emoji and color for any tag:

  ```typescript
  // TAG_META is the single source of truth for emoji + color per journal tag.
  // Used everywhere a tag needs visual representation: chips, bar charts, tooltips, calendar dots.
  export const TAG_META: Partial<Record<JournalTag, { emoji: string; color: string }>> = {
    happy:        { emoji: '😊', color: '#4ade80' },
    excited:      { emoji: '🤩', color: '#fbbf24' },
    // ... all emotion and condition tags
  }
  ```

  Keep `ENTRY_TYPE_EMOJIS` separate (entry types have no color, only an emoji). Keep `tagLabel`, `emotionGradient`, and the scoring logic unchanged.

  Update all existing consumers of the old maps (`SummaryTab.tsx`, `EntryCard.tsx`, `AddEntrySheet.tsx`, any other component that imports `EMOTION_COLORS` or `EMOTION_EMOJIS` directly) to use `TAG_META[tag]?.emoji` and `TAG_META[tag]?.color` instead.

  - **Vitest tests:** Update `web-client/src/components/journal/journalColors.test.ts` to cover `TAG_META` lookups for a representative sample of emotion and condition tags.

- [x] **C.2 — Update shared types in `packages/shared/src/types.ts`**

  - Add `JournalCalendarDay` interface:
    ```typescript
    interface JournalCalendarDay {
      date: string           // YYYY-MM-DD
      entry_count: number
      avg_score: number | null
    }
    ```
  - Add `JournalMentalStateBar` interface:
    ```typescript
    interface JournalMentalStateBar {
      label: string
      date: string
      score: number | null
      entry_count: number
      emotions: JournalTag[]
    }
    ```
  - Add `JournalTagDay` interface:
    ```typescript
    interface JournalTagDay {
      date: string           // human-readable display string from server, e.g. "Apr 3"
      entry_count: number
      preview: string
    }
    ```
  - Update `JournalSummaryResponse`: replace `mental_state_points` with `mental_state_bars: JournalMentalStateBar[]`; add `total_entries: number` and `days_logged: number`.
  - Add `JournalSummaryRange` type alias: `'week' | 'month' | '6m' | '1yr'`

- [x] **C.3 — Update API helpers in `web-client/src/api.ts`**

  - Add `fetchJournalCalendar(month: string): Promise<JournalCalendarDay[]>` — `GET /api/journal/calendar?month=${month}`
  - Update `fetchJournalSummary` signature to `(range: JournalSummaryRange, refDate?: string)` — appends `&ref_date=YYYY-MM-DD` when provided
  - Add `fetchJournalTagDays(tag: string, range: JournalSummaryRange, refDate?: string): Promise<JournalTagDay[]>` — `GET /api/journal/tag-days`

- [x] **C.4 — Create `useJournalCalendar` hook in `web-client/src/hooks/useJournalCalendar.ts`**

  Manages a per-month cache of calendar data. The cache is a `useRef<Map<string, JournalCalendarDay[]>>` (keyed `YYYY-MM`) so it survives re-renders without triggering them. Loading state is tracked separately per month in a `useState<Set<string>>`.

  **Note on Promise vs state:** Returning a `Promise` from a hook is avoided here — instead the hook exposes a `loadMonth(month: string)` imperative function that triggers a fetch and stores the result in state, plus `getMonthData(month: string)` that returns the cached array or `null` synchronously. `JournalDatePicker` calls `loadMonth` on mount and on month navigation, then reads `getMonthData` to render dots.

  ```typescript
  function useJournalCalendar(): {
    loadMonth: (month: string) => void           // triggers fetch if not cached
    getMonthData: (month: string) => JournalCalendarDay[] | null  // returns cache or null
    isLoading: (month: string) => boolean
    invalidate: (month: string) => void          // clears cache entry, next loadMonth refetches
  }
  ```

  - **Vitest tests:** `web-client/src/hooks/useJournalCalendar.test.ts` — use MSW to mock `GET /api/journal/calendar`. Test: (a) calling `loadMonth` twice for the same month only triggers one fetch, (b) `invalidate` followed by `loadMonth` triggers a second fetch, (c) `getMonthData` returns null before the fetch completes and the cached array after.

- [x] **C.5 — Update `useJournalSummary` hook in `web-client/src/hooks/useJournalSummary.ts`**

  Update to accept `range: JournalSummaryRange` and optional `refDate: string`. Re-fetch when either changes.

  - **Vitest tests:** Update `web-client/src/hooks/useJournalSummary.test.ts` — verify re-fetch fires when `refDate` changes independently of `range`, and that the hook returns the updated `mental_state_bars` shape.

---

## Phase D: Frontend — Calendar Date Picker

- [x] **D.1 — Create `JournalDatePicker` component in `web-client/src/components/journal/JournalDatePicker.tsx`**

  A self-contained calendar popover:
  - **Props:**
    ```typescript
    interface JournalDatePickerProps {
      selectedDate: string                                  // YYYY-MM-DD
      onSelect: (date: string) => void
      onClose: () => void
      loadMonth: (month: string) => void                   // from useJournalCalendar
      getMonthData: (month: string) => JournalCalendarDay[] | null
      isLoadingMonth: (month: string) => boolean
    }
    ```
  - Internal state: `displayMonth: string` (YYYY-MM, starts at month of `selectedDate`). On mount and whenever `displayMonth` changes, calls `loadMonth(displayMonth)`.
  - Renders a Mon–Sun 7-column month grid. Each day cell: date number + optional mood dot. Dot color derived from `avg_score` via the same breakpoints used elsewhere: green-400 (≥ 4), violet-400 (2–3), red-400 (≤ 1), gray-300 (entries but no score). No dot = no entries.
  - Selected date: indigo ring. Today: subtle gray ring. Future dates: text-gray-300, not tappable.
  - Tapping a valid past/present day calls `onSelect(date)` then `onClose()`.
  - Color legend row at bottom (green/violet/red/gray dots with labels).
  - **Manual tests:** Open calendar, confirm today is ringed, a day with entries has a correctly-colored dot, future days do not respond to tap, ← → changes the displayed month and loads new data.

- [x] **D.2 — Create `JournalDateHeader` component in `web-client/src/components/journal/JournalDateHeader.tsx`**

  Replaces `calorie-log/DateHeader` in the journal context. Keeps the same prev/next arrow capsule layout but changes the date label area:
  - The center label is a `<button>` showing the date text + a small calendar icon (same icon used in the mockup — `M6.75 3v2.25...` calendar path).
  - Clicking the button toggles a `pickerOpen` boolean in local state.
  - When `pickerOpen`: renders `JournalDatePicker` in an absolutely-positioned popover anchored below the header; a transparent full-screen overlay behind it closes the picker on click-outside.
  - Receives `loadMonth`, `getMonthData`, `isLoadingMonth` as props (passed down from `JournalPage` which owns `useJournalCalendar()`).
  - `calorie-log/DateHeader` is left unchanged.

- [x] **D.3 — Update `JournalPage.tsx` to use `JournalDateHeader` and wire cache invalidation**

  - Replace `import DateHeader from '../components/calorie-log/DateHeader'` with `JournalDateHeader`.
  - Call `useJournalCalendar()` at the page level and pass `loadMonth`, `getMonthData`, `isLoadingMonth` as props to `JournalDateHeader`.
  - Add a shared `invalidateCurrentMonth` helper and call it alongside `reload()` on every mutation:
    ```typescript
    const { loadMonth, getMonthData, isLoadingMonth, invalidate } = useJournalCalendar()
    const invalidateCurrentMonth = () => invalidate(date.slice(0, 7))

    const handleSaved = () => { reload(); invalidateCurrentMonth() }
    const handleDelete = async (id: number) => {
      await deleteJournalEntry(id)
      reload()
      invalidateCurrentMonth()
    }
    ```
  - **Manual tests:** Create an entry → open calendar → the day has a dot. Delete it → reopen calendar → dot is gone. Navigate months in the picker → each month's data loads.

---

## Phase E: Frontend — Summary Tab Redesign

- [x] **E.1 — Add `onNavigateToDay` prop to `SummaryTab` in `web-client/src/components/journal/SummaryTab.tsx`**

  `SummaryTab` currently has no way to switch to the Daily tab or change the active date — both are owned by `JournalPage`. Add:
  ```typescript
  interface SummaryTabProps {
    onNavigateToDay: (date: string) => void   // switches tab to 'daily' and sets date
  }
  ```

  In `JournalPage.tsx`, pass a handler:
  ```typescript
  <SummaryTab onNavigateToDay={(d) => { setTab('daily'); setDate(d) }} />
  ```

  This prop is used by the "Go to day →" button in the bar tooltip (E.3) and the "View →" links in the drill-down panel (E.4).

- [x] **E.2 — Create `MentalStateBarChart` component in `web-client/src/components/journal/MentalStateBarChart.tsx`**

  Extracted SVG bar chart, replaces the `MentalStateChart` polyline currently inside `SummaryTab.tsx`:
  - **Props:** `bars: JournalMentalStateBar[]`, `range: JournalSummaryRange`, `onBarClick: (bar: JournalMentalStateBar, barCenterPct: number) => void`
  - Bar height proportional to score (1–5). Color: green-400 (≥ 4), violet-400 (2–3), red-400 (≤ 1), gray-200 stub (null, min 4px so the x-axis slot stays visible).
  - X-axis labels: all 7 for `week`, every 5th for `month`, every 4th for `6m`/`1yr`.
  - The wrapping `div` is `overflow-x-auto`. SVG `minWidth`: 300px (`week`), 400px (`month`), 520px (`6m`), 720px (`1yr`).
  - `onBarClick` receives the bar data plus `barCenterPct` (0–100) — the bar's center as a percentage of the SVG viewBox width, used by the parent to position the tooltip correctly.
  - **Vitest component tests:** `MentalStateBarChart.test.tsx` — verify: correct number of `<rect>` elements rendered, no-data bars present with gray fill, clicking a data bar calls `onBarClick` with the correct bar object.

- [x] **E.3 — Rewrite range selector, sub-navigator, and bar tooltip in `SummaryTab.tsx`**

  **Range selector:** Replace `'1m' | '6m' | 'ytd' | 'all'` pills with `'week' | 'month' | '6m' | '1yr'`. Update `useJournalSummary` call accordingly.

  **Sub-navigator** (visible only for `week` and `month`): same pill capsule style as calorie log weekly nav. State:
  - `refDate: string` (YYYY-MM-DD, defaults to today)
  - `week`: ← shifts `refDate` back 7 days (`shiftWeek` util from `utils/dates`), → forward 7 days
  - `month`: ← moves `refDate` to the 1st of the previous month, → to the 1st of the next month
  - Label: format as "Mar 30 – Apr 5, 2026" (week) or "April 2026" (month)

  **Bar tooltip** (dark overlay, HTML not SVG so it isn't clipped by `overflow-x-auto`):
  - State: `tooltipBar: JournalMentalStateBar | null` and `tooltipPct: number`
  - Positioned via `left: clamp(14%, tooltipPct%, 86%)` — same clamping approach as calorie log
  - Dark bg: `bg-gray-800 rounded-lg p-2.5 shadow-lg w-40`
  - Content:
    - Date label: `text-[10px] text-gray-400`
    - "Entries" row: `flex justify-between text-[10px]`, label gray-400, value white
    - "Score" row: same layout; value colored using `TAG_META` score breakpoints (green/violet/red)
    - Emotion emojis row: map `bar.emotions` through `TAG_META[tag]?.emoji`. Show up to 4 as `bg-gray-700 rounded-md w-7 h-7` pills; if more than 4 show a `+N` pill in the same style
    - "Go to day →" blue button: calls `onNavigateToDay(bar.date)` and closes tooltip
  - For `6m`/`1yr` bars: clicking jumps to Week view for that bar's week Monday — set `range = 'week'` and `refDate = bar.date` — instead of showing the tooltip
  - Click-outside: transparent overlay behind tooltip, clicking it sets `tooltipBar = null`

  - **Manual tests:** Click a bar → tooltip shows correct date, entry count, score with right color, emojis. Click a bar with >4 emotions → `+N` pill shows. Click outside → tooltip dismisses. Click a 6M bar → range switches to Week with correct week loaded.

- [x] **E.4 — Add clickable emotion/type bars with drill-down in `SummaryTab.tsx`**

  State: `activeDrillTag: string | null` and `drillDays: JournalTagDay[]` and `drillLoading: boolean`.

  On clicking an emotion or type bar:
  1. If `activeDrillTag === tag`, close the panel (set to null).
  2. Otherwise: set `activeDrillTag = tag`, set `drillLoading = true`, call `fetchJournalTagDays(tag, range, refDate)` imperatively (not via a hook — this is a user-triggered lazy fetch, not a reactive load), then set `drillDays` and `drillLoading = false`.

  Drill-down panel renders below the card that was tapped (not a modal):
  - Header: `{TAG_META[tag]?.emoji ?? ENTRY_TYPE_EMOJIS[tag]} {tagLabel(tag)} — {totalCount} entries across {drillDays.length} days` + × close button
  - While `drillLoading`: small inline spinner
  - Day rows: date string, entry count, preview text, "View →" button that calls `onNavigateToDay`
  - `HBar` component gets `cursor-pointer` styling and a right-chevron hint on hover

  - **Manual tests:** Tap "Happy" bar → panel expands with matching days. Tap "View →" → switches to Daily tab with that date. Tap another emotion bar → first panel closes, new one opens. Tap same bar again → panel toggles closed.

- [x] **E.5 — Update stats row in `SummaryTab.tsx`**

  Replace the three-card row (Days Journalled, Streak, Avg Entries/Day) with two cards:
  - "Days logged" → `summary.days_logged`
  - "Total entries" → `summary.total_entries`

---

## Phase F: E2E and Polish

- [x] **F.1 — Playwright E2E: calendar date picker** (`e2e/tests/journal-calendar.spec.ts`)

  - Login → Journal Daily tab
  - Click the date label → calendar popover appears, today's cell is visible
  - Click a past date that has entries → calendar closes, timeline shows entries for that date
  - Create an entry → reopen calendar → the day now has a mood dot
  - Run against both Desktop Chrome and Mobile Chrome projects

- [x] **F.2 — Playwright E2E: summary tab** (`e2e/tests/journal-summary.spec.ts`)

  - Login → Journal → Summary tab
  - Default Week view: bar chart renders, sub-navigator shows current week
  - Switch to Month → sub-navigator updates to month label
  - Switch to 6M → sub-navigator disappears
  - Click a bar with entries → dark tooltip appears containing the date text
  - Click "Go to day →" → Daily tab is active, timeline shows entries for that date

- [x] **F.3 — Build + lint**

  Run `npm run build && npm run lint` in `web-client/`. Fix any type errors from the updated `JournalSummaryResponse` shape, changed hook signatures, and refactored `TAG_META` imports.
