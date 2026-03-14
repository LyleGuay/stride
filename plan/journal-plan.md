# Journal Feature

## Goal

Build a personal journal integrated into Stride where the user can log timestamped entries tagged with emotions and entry types. The UI follows the timeline mockup in `design/features/journal/journal-timeline.html`: a card-based timeline with colored left accent bars (based on emotions), a time gutter on desktop, and time inline on mobile. The feature has two views — **Daily** (timeline for a selected date) and **Summary** (mental-state trend chart, top emotions, entry-type frequency over a date range). A lightweight habit-linking flow is also included: after logging a habit level, the user can tap "Add a note →" to open the journal entry sheet pre-filled with that habit.

---

## Phases

### Phase A: Database Migration

- [x] **A.1 — Create `journal_entries` table**
  Create `go-api/db/migrations/2026-03-10-001-journal.sql` with:
  - `journal_tag` ENUM combining all tag values:
    - Emotions: `happy, excited, motivated, energized, calm, content, grateful, neutral, bored, unmotivated, anxious, overwhelmed, low, sad, angry, frustrated, depressed`
    - Entry types: `thoughts, idea, venting, open_loop, reminder, life_update, feelings`
  - `journal_entries(id, user_id, entry_date, entry_time, body, tags journal_tag[] NOT NULL DEFAULT '{}', habit_id → habits.id ON DELETE SET NULL, created_at, updated_at)`
  - GIN index on `tags` for future tag-based search: `CREATE INDEX ON journal_entries USING GIN (tags)`
  - Index on `(user_id, entry_date)` for the daily list query.
  - **Manual test:** Run `go run ./cmd/migrate` and verify the table and enum type exist in the DB with `\d journal_entries`.

---

### Phase B: Go API

- [x] **B.1 — Create `go-api/journal.go` with CRUD handlers**
  Implement five handlers on `*Handler`:
  - `getJournalEntries` — `GET /api/journal?date=YYYY-MM-DD`. If `date` is missing or not a valid `YYYY-MM-DD` string, return 400 `{"error": "invalid date"}`. Queries `journal_entries` LEFT JOIN `habits` for the given date + user. Returns `[]JournalEntry`.
  - `createJournalEntry` — `POST /api/journal`. Sets `entry_time` to `NOW()` server-side (not client-supplied). Inserts entry row. Returns the created entry.
  - `updateJournalEntry` — `PUT /api/journal/:id`. Verifies ownership. Updates only the fields present in the request body (follow the existing partial-update convention used by other handlers). Returns updated entry.
  - `deleteJournalEntry` — `DELETE /api/journal/:id`. Verifies ownership, deletes row.
  - `getJournalSummary` — `GET /api/journal/summary?range=1m|6m|ytd|all`. If `range` is missing or not one of the four valid values, return 400 `{"error": "invalid range"}` (same pattern as other validated query params). Queries all entries in the date window; for mental-state scoring, filters `tags` to known emotion values and computes per-date average score (excited=5, happy/motivated/energized/calm/content/grateful=4, neutral=3, bored/unmotivated/anxious/overwhelmed/low=2, sad/angry/frustrated/depressed=1); counts each emotion tag and entry-type tag across the range. Returns `JournalSummaryResponse`.

  Go response struct:
  ```go
  type JournalEntry struct {
    ID        int      `json:"id"`
    EntryDate string   `json:"entry_date"`
    EntryTime string   `json:"entry_time"`
    Body      string   `json:"body"`
    Tags      []string `json:"tags"`
    HabitID   *int     `json:"habit_id"`
    HabitName *string  `json:"habit_name"`
    CreatedAt string   `json:"created_at"`
  }
  ```

- [x] **B.2 — Register journal routes in `go-api/main.go`**
  Note: Gin matches literal path segments before named params, so `GET /journal/summary` must be registered *before* any `GET /journal/:id` route (there isn't one currently, but keep this in mind if one is added later).
  Under the existing auth middleware group, add:
  ```go
  api.GET("/journal", h.getJournalEntries)
  api.POST("/journal", h.createJournalEntry)
  api.PUT("/journal/:id", h.updateJournalEntry)
  api.DELETE("/journal/:id", h.deleteJournalEntry)
  api.GET("/journal/summary", h.getJournalSummary)
  ```
  - **Manual test:** Use curl/Postman to add an entry, fetch it by date, edit it, delete it. Verify tags round-trip correctly.

- [x] **B.3 — Unit test for mental-state score computation in `go-api/journal_test.go`**
  Extract the tag → score mapping into a package-level function `mentalStateScore(tag string) int` (called by `getJournalSummary`). Write a table-driven unit test covering:
  - Each of the 17 emotion tags maps to the documented score
  - Entry-type tags (e.g. `thoughts`) return 0 (skipped in scoring)
  - An unrecognized value returns 0
  - Per-date average correctly computes across mixed emotion tags

---

### Phase C: Shared Types & API Layer

- [x] **C.1 — Add journal types to `packages/shared/src/types.ts`**
  ```typescript
  // All emotion tags — used for coloring and mental-state scoring
  export const EMOTION_TAGS = new Set([
    'happy', 'excited', 'motivated', 'energized', 'calm', 'content', 'grateful',
    'neutral', 'bored', 'unmotivated', 'anxious', 'overwhelmed', 'low',
    'sad', 'angry', 'frustrated', 'depressed',
  ] as const)

  // All entry-type tags — rendered as plain chips, no color
  export const ENTRY_TYPE_TAGS = new Set([
    'thoughts', 'idea', 'venting', 'open_loop', 'reminder', 'life_update', 'feelings',
  ] as const)

  export type JournalTag =
    'happy' | 'excited' | 'motivated' | 'energized' | 'calm' | 'content' | 'grateful' |
    'neutral' | 'bored' | 'unmotivated' | 'anxious' | 'overwhelmed' | 'low' |
    'sad' | 'angry' | 'frustrated' | 'depressed' |
    'thoughts' | 'idea' | 'venting' | 'open_loop' | 'reminder' | 'life_update' | 'feelings'

  export interface JournalEntry {
    id: number
    entry_date: string        // YYYY-MM-DD
    entry_time: string        // HH:MM
    body: string
    tags: JournalTag[]
    habit_id: number | null
    habit_name: string | null
    created_at: string
  }

  export interface JournalSummaryResponse {
    mental_state_points: { date: string; score: number }[]
    top_emotions: { tag: JournalTag; count: number }[]
    entry_type_counts: { tag: JournalTag; count: number }[]
  }

  export type CreateJournalEntryInput = {
    entry_date: string
    // entry_time is set server-side to NOW() — not sent by the client
    body: string
    tags: JournalTag[]
    habit_id?: number | null
  }

  export type UpdateJournalEntryInput = Partial<CreateJournalEntryInput>
  ```

- [x] **C.2 — Add journal API functions to `web-client/src/api.ts`**
  ```typescript
  export async function fetchJournalEntries(date: string): Promise<JournalEntry[]>
  export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry>
  export async function updateJournalEntry(id: number, input: UpdateJournalEntryInput): Promise<JournalEntry>
  export async function deleteJournalEntry(id: number): Promise<void>
  export async function fetchJournalSummary(range: '1m' | '6m' | 'ytd' | 'all'): Promise<JournalSummaryResponse>
  ```
  All go through the existing `request<T>()` wrapper.

- [x] **C.3 — Install `react-markdown` for markdown rendering**
  ```bash
  cd web-client && npm install react-markdown
  ```
  `react-markdown` renders markdown body text in `EntryCard` (read view) and the preview toggle in `AddEntrySheet`. No remark plugins needed initially — default renderer is sufficient.

- [x] **C.4 — Create `web-client/src/hooks/useJournalEntries.ts`**
  Same pattern as `useHabits.ts`:
  - State: `entries: JournalEntry[]`, `loading: boolean`, `error: string | null`
  - `reload()` increments a counter to trigger refetch
  - `useEffect` depends on `[date, reloadCount]`
  - No optimistic updates needed.
  - **Vitest tests (`useJournalEntries.test.ts`)** using `msw` + `renderHook`:
    - Sets `loading: true` while fetching, `false` after
    - Populates `entries` on success
    - Sets `error` on non-2xx response
    - Re-fetches when `date` changes
    - Re-fetches when `reload()` is called

- [x] **C.5 — Create `web-client/src/hooks/useJournalSummary.ts`**
  - State: `summary: JournalSummaryResponse | null`, `loading: boolean`, `error: string | null`
  - Accepts `range: '1m' | '6m' | 'ytd' | 'all'`
  - `useEffect` depends on `[range]` — re-fetches automatically on range change
  - **Vitest tests (`useJournalSummary.test.ts`)** using `msw` + `renderHook`:
    - Populates `summary` on success
    - Sets `error` on non-2xx response
    - Re-fetches when `range` changes

---

### Phase D: Tag Color Utilities

- [x] **D.1 — Create `web-client/src/components/journal/journalColors.ts`**
  ```typescript
  // Human-readable display labels for tags that need formatting (snake_case values)
  export const TAG_LABELS: Partial<Record<JournalTag, string>> = {
    open_loop:   'Open Loop',
    life_update: 'Life Update',
    // all other tags display as title-cased versions of their value (e.g. 'happy' → 'Happy')
  }

  // Returns the display label for a tag, falling back to title-casing the value.
  export function tagLabel(tag: JournalTag): string

  // Colors for emotion tags only — entry-type tags have no color
  export const EMOTION_COLORS: Partial<Record<JournalTag, string>> = {
    excited:    '#fbbf24',  // amber-400
    happy:      '#4ade80',  // green-400
    motivated:  '#4ade80',
    energized:  '#2dd4bf',  // teal-400
    calm:       '#67e8f9',  // cyan-300
    content:    '#86efac',  // green-300
    grateful:   '#a7f3d0',  // emerald-200
    neutral:    '#94a3b8',  // slate-400
    bored:      '#93c5fd',  // blue-300
    unmotivated:'#cbd5e1',  // slate-300
    anxious:    '#a78bfa',  // violet-400
    overwhelmed:'#c084fc',  // purple-400
    low:        '#a78bfa',
    sad:        '#fb7185',  // rose-400
    angry:      '#f87171',  // red-400
    frustrated: '#fb923c',  // orange-400
    depressed:  '#818cf8',  // indigo-400
  }

  // Returns a CSS background value for the card accent bar.
  // Filters tags to emotion tags only, then:
  // single emotion → solid hex. Multiple → linear-gradient(to bottom, ...).
  // Falls back to slate-200 if no emotion tags present.
  export function emotionGradient(tags: JournalTag[]): string
  ```
  - **Vitest tests (`journalColors.test.ts`):**
    - `emotionGradient(['happy'])` returns the solid hex (no gradient syntax)
    - `emotionGradient(['happy', 'thoughts'])` ignores `thoughts` and returns happy's solid hex
    - `emotionGradient(['happy', 'anxious'])` contains both color values
    - `emotionGradient(['thoughts'])` returns the fallback color (no emotion tags)
    - Every emotion tag has a defined non-empty color in `EMOTION_COLORS`
    - `tagLabel('open_loop')` returns `'Open Loop'`
    - `tagLabel('life_update')` returns `'Life Update'`
    - `tagLabel('happy')` returns `'Happy'` (title-case fallback)

- [x] **D.2 — Vitest component tests for `AddEntrySheet` (`AddEntrySheet.test.tsx`)** *(implement alongside E.3)*
  Using `@testing-library/react`:
  - **Validation:** Submitting with empty body shows a validation error; submit button is blocked
  - **Tag toggle:** Clicking a tag chip selects it; clicking again deselects it
  - **Create mode:** When `editEntry` is undefined, all fields are blank
  - **Edit mode:** When `editEntry` is provided, body and tags pre-fill from the entry
  - **Habit badge:** When `habitName` prop is set, a "Linked: {habitName}" badge is visible and read-only

---

### Phase E: Daily Timeline UI

- [x] **E.1 — Create `web-client/src/components/journal/EntryCard.tsx`**
  Single timeline entry card matching the `journal-timeline.html` pattern:
  - Outer `div` with `position: relative`, `borderRadius: 12`, `overflow: hidden`, and a `box-shadow`
  - Absolutely-positioned accent bar: `position: absolute; left: 0; top: 0; bottom: 0; width: 5px`, background set via `emotionGradient(entry.tags)`
  - Body content padded 14px left to clear the accent bar
  - **Body rendered as markdown** using `<ReactMarkdown>` (from `react-markdown`) — entries are stored as raw markdown and rendered in read view. Apply minimal prose styles (bold, italic, lists) inline or via a small CSS class. Do not use `@tailwindcss/typography`; keep styles scoped to the card body.
  - Tags rendered in two groups below body: emotion tags (colored dot + label using `EMOTION_COLORS`) and entry-type tags (plain chips, no color)
  - Habit link badge (`habit_name`) if `habit_id` is set
  - `···` context menu button (inline, top-right) → Edit / Delete
  - Mobile time label (`.card-time-mobile`) shown at top of card body on mobile, hidden on desktop via CSS media query (`@media (min-width: 640px)`)

- [x] **E.2 — Create `web-client/src/components/journal/DailyTimeline.tsx`**
  Props: `entries: JournalEntry[]`, `onEdit: (e: JournalEntry) => void`, `onDelete: (id: number) => void`, `onAdd: () => void`
  - **Desktop layout (≥640px):** flex row — 52px right-aligned time gutter + 2px vertical rule (gradient fade top/bottom) + card with 14px left padding. Use plain CSS classes, NOT Tailwind `sm:flex` (avoids the `hidden`/`sm:flex` override issue documented in the mockup).
  - **Mobile layout:** stacked cards only; no gutter, no rule.
  - "Add entry" button pinned at the bottom of the list (matches second FAB in mockup).
  - Empty state: centered icon + "No entries for this day" message.

- [x] **E.3 — Create `web-client/src/components/journal/AddEntrySheet.tsx`**
  Bottom sheet (mobile) / centered modal (desktop) — same structural pattern as `AddItemSheet.tsx`:
  - `open` controlled via `style="display:none"` / `element.style.display = 'flex'` (not Tailwind class toggling)
  - Fields:
    - **Markdown body editor:** `<textarea>` for writing raw markdown + a "Preview" toggle button that swaps to a `<ReactMarkdown>` render of the current text. The textarea is the default state; preview is opt-in.
    - Tag chip grid: all tags in a single grid, split into two labeled sections ("How are you feeling?" for emotions, "Entry type" for entry types). Tags are optional — no validation requirement.
  - Edit mode: pre-fills all fields from `editEntry?: JournalEntry` prop; validated on open via `useEffect([open, editEntry])`
  - `habitId?: number` + `habitName?: string` props: if set, shows a read-only "Linked: {habitName}" badge; `habit_id` is included in the submit payload
  - Validation: body non-empty only
  - `onSave(input: CreateJournalEntryInput | UpdateJournalEntryInput)` callback — parent handles the API call
  - **Manual tests:**
    - Verify sheet slides up from bottom on mobile, appears as a modal on desktop
    - Verify markdown textarea → Preview toggle renders body correctly
    - Verify tag chip toggles on/off correctly
    - Verify save is blocked when body is empty (validation error shown)
    - Verify save succeeds with no tags selected

- [x] **E.4 — Create `web-client/src/pages/JournalPage.tsx`**
  Top-level page component (note: lives in `pages/`, not `components/journal/`, matching `HabitsPage.tsx` / `CalorieLog.tsx` convention):
  - Sticky header (h-14): app logo area + "Journal" title + Daily / Summary tab pills
  - Daily tab: date navigator (← Today →) + `useJournalEntries(selectedDate)` + `DailyTimeline`
  - Summary tab: `<SummaryTab />` (Phase F)
  - FAB bottom-right (stride-600, pencil icon) opens `AddEntrySheet` in create mode for the current date
  - `AddEntrySheet` with `editEntry` set for edit mode; on save calls create/update API then `reload()`
  - Delete: show a confirmation dialog ("Delete this entry?") before calling `deleteJournalEntry(id)`. On confirm, call `deleteJournalEntry(id)` then `reload()`. Use a simple inline confirm pattern (e.g. a small modal or browser `confirm()` — decide during implementation; keep it consistent with any existing delete confirmation patterns in the app).
  - **Manual tests:**
    - Verify date navigator changes day and re-fetches entries
    - Verify ← is disabled on Today (or wraps — decide during implementation)
    - Verify tab switch between Daily and Summary is instant (no loading flicker)
    - Verify delete confirmation prompt appears before an entry is removed

- [x] **E.5 — Wire routing and navigation**
  - `web-client/src/router.tsx`: import `JournalPage` from `'./pages/JournalPage'`, add `<Route path="journal" element={<JournalPage />} />` inside the `RequireAuth` group, between Habits and Recipes routes.
  - `web-client/src/components/AppShell.tsx`: add a Journal nav link between Habits and Recipes using a notebook icon (e.g. `BookOpen` from lucide-react if already available, otherwise inline SVG).
  - **Manual test:** Journal link appears in sidebar; navigates to `/journal`.

---

### Phase F: Summary Tab

- [x] **F.1 — Create `web-client/src/components/journal/SummaryTab.tsx`**
  - Range selector buttons: 1M / 6M / YTD / All (same pill pattern as `ProgressView.tsx`)
  - Uses `useJournalSummary(range)` hook (C.5); range state lives in this component
  - Three stacked SVG charts (~200px tall each), each with a heading:

  **1. Mental State Over Time**
  Polyline chart, Y-axis 1–5. Colors the line using a `<linearGradient>` with one stop per data point at the correct x-position percentage (same technique as the mental state chart in `journal-timeline.html`). Dots colored by the score (green=4-5, violet=2-3, red=1). Shows "No entries yet" when empty.

  **2. Top Emotions**
  Horizontal bar chart. Each bar colored with `EMOTION_COLORS[tag]`. Bars sorted by count desc. Max-width relative to highest count.

  **3. Entry Types**
  Horizontal bar chart. Fixed color (stride-600 `#4f46e5`). Same layout as top emotions chart.

  - **Manual tests:**
    - Switch ranges and verify chart updates
    - Verify empty state renders for a range with no entries

---

### Phase G: Habit Linking

- [x] **G.1 — Add "Add a note" affordance to `web-client/src/components/habits/HabitCard.tsx`**
  - Add `onAddJournalNote?: (habitId: number) => void` to `HabitCardProps`.
  - After a successful level log (level > 0, `onLogLevel` called), show a small "Add a note →" button below the habit card for ~5 seconds. Auto-hides after timeout; also dismisses on click.
  - On click: calls `onAddJournalNote(habit.id)` and dismisses.
  - `useState<boolean>` for `showNotePrompt`; `useEffect` with `setTimeout` for auto-hide.
  - **Manual tests:**
    - Log a habit at level 1+ — "Add a note →" appears briefly below the card
    - Clicking it opens the journal sheet with the habit pre-filled
    - It disappears on its own after ~5s if not clicked

- [x] **G.2 — Wire journal sheet from `web-client/src/pages/HabitsPage.tsx`**
  - Add `journalSheetOpen: boolean`, `linkedHabitId: number | null`, `linkedHabitName: string | null` state.
  - `onAddJournalNote(habitId)`: find the habit by id from `habits` state, set linked habit state, open journal sheet.
  - Render `<AddEntrySheet>` (import from `components/journal`) with `habitId`, `habitName`, `open`, `onClose`, `onSave`.
  - On save: call `createJournalEntry(input)`.
  - Pass `onAddJournalNote` down to each `HabitCard` via `HabitsPage`.

---

### Phase H: E2E Tests

- [x] **H.1 — Create `e2e/tests/journal.spec.ts`**
  Cover these flows (both `Desktop Chrome` and `Mobile Chrome` Pixel 7 projects):
  - **Add entry:** Open journal → FAB → fill body + select a tag → save → verify card appears in timeline with correct tag chip.
  - **Add entry (no tags):** Fill body only → save → verify card appears with no tag chips.
  - **Edit entry:** Click `···` → Edit → change body → save → reload page → verify change persists.
  - **Delete entry:** Click `···` → Delete → confirm in dialog → verify entry is removed from timeline.
  - **Date navigation:** Navigate to yesterday → verify today's entries are not shown.
  - **Manual tests (mobile):**
    - Verify time gutter is hidden and time appears inside card on Pixel 7 viewport
    - Verify bottom sheet slides up from bottom (not center modal) on mobile
  - **Manual tests (habit linking):**
    - Log a habit → tap "Add a note →" → verify journal sheet opens with habit badge pre-filled
    - Save the entry → verify it appears in the journal timeline for today with the habit badge visible

---

## Deferred (not in this plan)

- AI-assisted tag suggestion from free text
- Search across journal entries by tag or text
- Calorie item → journal entry linking
- Surfacing recent journal entries on the Habits or Calorie Log daily view
