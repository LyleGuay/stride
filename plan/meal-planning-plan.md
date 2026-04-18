# Meal Planning

## Goal

Add a Meal Planning module to Stride that lets the user plan meals (breakfast, lunch, dinner, snacks) for any week. Plan entries support three types: food items (manual or AI-suggested), takeout (with a calorie cap and optional constraints), and recipes (with serving scaling). Planned entries appear as "ghost rows" in the Calorie Logger's daily view — faded, dashed-border rows with a Log button that turns the plan item into a real calorie log entry.

The design is documented in `design/features/meal-planning/meal-planning.md`.

## Rules

- Meal plan entries live on specific dates (no parent "meal plan" container), matching the calorie log's date-based model.
- Adding from Favorites creates a `food` type entry — the Favorites tab is only shown in the add sheet, not the edit sheet.
- AI suggest for meal plan entries reuses the existing `POST /api/calorie-log/suggest` endpoint (same data shape).
- Recipe macros/calories are snapshotted at save time (not recomputed from live recipe).
- Logging a `food` or `recipe` plan entry opens a quantity-scaling modal. Logging a `takeout` entry opens the standard `AddItemSheet` pre-filled with the restaurant name and a plan-context banner; actual calories are entered by the user.

---

## Phase A: Database

- [x] **A.1 — Migration: `meal_plan_entries` table**
  Create `db/migrations/YYYY-MM-DD-001-meal-plan-entries.sql`. Define two new enums and the `meal_plan_entries` table:
  ```sql
  CREATE TYPE meal_plan_entry_type AS ENUM ('food', 'takeout', 'recipe');

  -- Separate from calorie_log_item_type — meal planning never has 'exercise'.
  CREATE TYPE meal_plan_meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

  CREATE TABLE meal_plan_entries (
    id           SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id),
    date         DATE NOT NULL,
    meal_type    meal_plan_meal_type NOT NULL,
    entry_type   meal_plan_entry_type NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,

    -- food type fields (also used when instantiated from a favorite)
    item_name    TEXT,
    qty          NUMERIC(10,2),
    uom          calorie_log_item_uom,
    calories     INT,
    protein_g    NUMERIC(6,1),
    carbs_g      NUMERIC(6,1),
    fat_g        NUMERIC(6,1),

    -- recipe type fields (calories/macros snapshotted from recipe × servings at save time)
    recipe_id    INT REFERENCES recipes(id) ON DELETE SET NULL,
    servings     NUMERIC(6,2),

    -- takeout type fields
    takeout_name   TEXT,
    calorie_limit  INT,
    no_snacks      BOOLEAN NOT NULL DEFAULT false,
    no_sides       BOOLEAN NOT NULL DEFAULT false,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX meal_plan_entries_user_date ON meal_plan_entries (user_id, date);
  ```
  - **Manual tests:** Run `go run ./cmd/migrate` from `go-api/` and confirm the table and enum exist with `\d meal_plan_entries` in psql.

- [x] **A.2 — Migration: add `meal_plan_entry_id` to `calorie_log_items`**
  Create `db/migrations/YYYY-MM-DD-002-calorie-log-meal-plan-entry-id.sql`:
  ```sql
  ALTER TABLE calorie_log_items
    ADD COLUMN meal_plan_entry_id INT REFERENCES meal_plan_entries(id) ON DELETE SET NULL;
  ```
  Mirrors the existing `recipe_id` column pattern.
  - **Manual tests:** Confirm column is nullable and FK constraint is present.

---

## Phase B: Shared Types & Constants

- [x] **B.1 — Add `MealPlanEntry` types to `packages/shared/src/types.ts`**
  Append after the existing `CalorieLogFavorite` block:
  ```typescript
  // MealPlanEntry mirrors the meal_plan_entries DB row.
  // Only the fields relevant to entry_type are populated; the rest are null.
  export interface MealPlanEntry {
    id: number
    user_id: number
    date: string                          // YYYY-MM-DD
    meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
    entry_type: 'food' | 'takeout' | 'recipe'
    sort_order: number
    // food fields
    item_name: string | null
    qty: number | null
    uom: string | null
    calories: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    // recipe fields
    recipe_id: number | null
    servings: number | null
    // takeout fields
    takeout_name: string | null
    calorie_limit: number | null
    no_snacks: boolean
    no_sides: boolean
    created_at: string
    updated_at: string
  }

  // CreateMealPlanEntryInput is the body for POST /api/meal-plan/entries.
  export interface CreateMealPlanEntryInput {
    date: string
    meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
    entry_type: 'food' | 'takeout' | 'recipe'
    sort_order?: number
    item_name?: string | null
    qty?: number | null
    uom?: string | null
    calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fat_g?: number | null
    recipe_id?: number | null
    servings?: number | null
    takeout_name?: string | null
    calorie_limit?: number | null
    no_snacks?: boolean
    no_sides?: boolean
  }

  // UpdateMealPlanEntryInput is the body for PUT /api/meal-plan/entries/:id.
  export type UpdateMealPlanEntryInput = Partial<CreateMealPlanEntryInput>

  // CopyWeekInput is the body for POST /api/meal-plan/copy-week.
  export interface CopyWeekInput {
    source_week: string   // YYYY-MM-DD (Monday)
    target_week: string   // YYYY-MM-DD (Monday)
    days: number[]        // 0=Mon … 6=Sun
    meal_types: ('breakfast' | 'lunch' | 'dinner' | 'snack')[]
  }
  ```
  Also add `meal_plan_entry_id: number | null` to the `CalorieLogItem` interface (after `recipe_id`).

- [x] **B.2 — Add `MEAL_PLAN_MEAL_TYPES` to `packages/shared/src/constants.ts`**
  ```typescript
  // MEAL_PLAN_MEAL_TYPES is the ordered list of meal types shown in the meal planning grid.
  // Exercise is excluded — meal planning only covers food meal slots.
  export const MEAL_PLAN_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
  export type MealPlanMealType = typeof MEAL_PLAN_MEAL_TYPES[number]
  ```
  - **Unit tests:** No logic to test — but verify the shared package still builds after changes: `cd packages/shared && npm run build`.

---

## Phase C: Backend API

- [x] **C.1 — `go-api/meal_plan.go`: CRUD handlers**
  Create `go-api/meal_plan.go` with a Go struct `mealPlanEntryRow` mirroring the DB schema, and the following handler methods on `*Handler`:
  - `getMealPlanEntries(c *gin.Context)` — `GET /api/meal-plan/entries`
    - Accepts `date=YYYY-MM-DD` (single day) OR `week_start=YYYY-MM-DD` (returns Mon–Sun)
    - Returns `[]MealPlanEntry` scoped to `user_id`, ordered by `date ASC, meal_type, sort_order`
  - `createMealPlanEntry(c *gin.Context)` — `POST /api/meal-plan/entries`
    - Validates that meal_type is not 'exercise'. Validates that required fields for the given `entry_type` are present (e.g. takeout requires `takeout_name`).
    - Inserts and returns the created row.
  - `updateMealPlanEntry(c *gin.Context)` — `PUT /api/meal-plan/entries/:id`
    - Verifies the entry belongs to the authenticated user before updating.
    - Returns updated row.
  - `deleteMealPlanEntry(c *gin.Context)` — `DELETE /api/meal-plan/entries/:id`
    - Verifies ownership. Returns 204 on success.

  Follow the existing patterns in `go-api/calorie_log.go`: use `queryOne[T]` / `queryMany[T]` helpers, `pgx.NamedArgs`, `pgxscan.RowToStructByName`.

  - **Manual tests:** Use curl or a REST client to test all four endpoints against a local server.

- [x] **C.2 — `go-api/meal_plan.go`: copy-week handler**
  Add `copyMealPlanWeek(c *gin.Context)` — `POST /api/meal-plan/copy-week`:
  - Accepts `CopyWeekInput` (source_week, target_week, days[], meal_types[]).
  - Fetches all entries from `source_week` (Mon–Sun) matching the requested days and meal_types.
  - Bulk-inserts copies into `target_week` (shifting each entry's date by the week offset). Existing entries in the target range are NOT deleted — copies are added alongside them.
  - Returns the newly inserted entries as `[]MealPlanEntry`.
  - **Manual tests:** Copy a partially-populated week; verify entries appear in the target week with correct dates.

- [x] **C.3 — `go-api/main.go`: register meal plan routes**
  Inside `registerRoutes`, add to the authenticated group:
  ```go
  api.GET("/meal-plan/entries", h.getMealPlanEntries)
  api.POST("/meal-plan/entries", h.createMealPlanEntry)
  api.PUT("/meal-plan/entries/:id", h.updateMealPlanEntry)
  api.DELETE("/meal-plan/entries/:id", h.deleteMealPlanEntry)
  api.POST("/meal-plan/copy-week", h.copyMealPlanWeek)
  ```

- [x] **C.4 — `go-api/calorie_log.go`: accept `meal_plan_entry_id` in create/update handlers**
  - In `createCalorieLogItemRequest` struct, add `MealPlanEntryID *int \`json:"meal_plan_entry_id"\``.
  - In the `createCalorieLogItem` INSERT statement and `updateCalorieLogItem` UPDATE statement, pass `meal_plan_entry_id` through. Null is fine — existing items are unaffected.
  - **Manual tests:** POST a new calorie log item with `meal_plan_entry_id` set; confirm the column is populated in the DB.

---

## Phase D: Frontend — Meal Planning Page

- [x] **D.1 — `web-client/src/api.ts`: add meal plan API functions**
  Following the existing patterns (fetch + token from localStorage):
  ```typescript
  fetchMealPlanEntries(params: { date: string } | { week_start: string }): Promise<MealPlanEntry[]>
  createMealPlanEntry(input: CreateMealPlanEntryInput): Promise<MealPlanEntry>
  updateMealPlanEntry(id: number, input: UpdateMealPlanEntryInput): Promise<MealPlanEntry>
  deleteMealPlanEntry(id: number): Promise<void>
  copyMealPlanWeek(input: CopyWeekInput): Promise<MealPlanEntry[]>
  ```
  Also update `createCalorieLogItem` to accept an optional `meal_plan_entry_id?: number | null` in its input type.

- [x] **D.2 — `web-client/src/hooks/useMealPlanWeek.ts`: data hook**
  Create `web-client/src/hooks/useMealPlanWeek.ts`. Accepts a `weekStart: string` (Monday YYYY-MM-DD). Fetches entries on mount and on weekStart change. Exposes:
  ```typescript
  {
    entries: MealPlanEntry[]
    loading: boolean
    error: string | null
    addEntry: (input: CreateMealPlanEntryInput) => Promise<void>
    updateEntry: (id: number, input: UpdateMealPlanEntryInput) => Promise<void>
    deleteEntry: (id: number) => Promise<void>
    copyFromLastWeek: (input: CopyWeekInput) => Promise<void>
    refetch: () => void
  }
  ```
  Groups entries by `date + meal_type` for easy cell lookup. All mutations optimistically update local state and refetch on error.

  - **Vitest tests:** Add `web-client/src/hooks/useMealPlanWeek.test.ts`. Use `msw` to mock the GET and POST endpoints. Test: entries are grouped by date+meal_type; `addEntry` appends to the correct cell; `deleteEntry` removes from local state; loading/error states are set correctly.

- [x] **D.3 — `web-client/src/components/meal-plan/MealPlanEntrySheet.tsx`: add/edit entry sheet**
  Create `web-client/src/components/meal-plan/MealPlanEntrySheet.tsx`. This is the bottom sheet / centered modal (same responsive pattern as `AddItemSheet.tsx`) for creating or editing a meal plan entry.

  **Props:**
  ```typescript
  {
    open: boolean
    onClose: () => void
    day: string           // YYYY-MM-DD
    mealType: MealPlanMealType
    entry?: MealPlanEntry  // present = edit mode
    onSave: (input: CreateMealPlanEntryInput | UpdateMealPlanEntryInput) => Promise<void>
  }
  ```

  **Tabs:**
  - `Food` — item name + AI suggest (reuse `SuggestionStrip` with `useSuggestion` hook, same 600ms debounce as `AddItemSheet`) + qty + uom + calories + macros (optional)
  - `Takeout` — restaurant name + calorie limit + constraints (`no_snacks`, `no_sides`)
  - `Recipe` — recipe picker (GET /api/recipes list) + servings input + computed preview (calories × servings). If the selected recipe has `calories === null`, show an inline warning: "This recipe has no nutrition data. Add calories to the recipe before planning with it." and disable the Save button.
  - `Favorites` — **add tab only** (hidden when `entry` prop is provided). Searchable list from `CalorieLogFavorite[]`. Selecting one switches to the Food tab pre-filled with the favorite's data.

  The sheet title should be `"Add to [MealType] · [Day]"` (add mode) or `"Edit · [MealType] · [Day]"` (edit mode). In edit mode, the tab that matches `entry.entry_type` is pre-selected and read-only switching is fine.

  - **Vitest tests:** Add `web-client/src/components/meal-plan/MealPlanEntrySheet.test.tsx`. Test: Favorites tab visible in add mode, hidden in edit mode; switching to Recipe tab and selecting a recipe populates the calories preview; Takeout tab renders only no_snacks + no_sides constraints (not "no dessert").

- [x] **D.4 — `web-client/src/components/meal-plan/WeeklyGrid.tsx`: main grid component**
  Create `web-client/src/components/meal-plan/WeeklyGrid.tsx`. Renders the full week view — responsive between desktop grid (7 columns × 4 rows) and mobile single-day view (day tab strip).

  **Desktop grid:**
  - Column headers: day name + date + daily calorie total (summed from entries for that day)
  - Today's column gets `bg-stride-50/30` tint and a blue dot indicator in the header
  - Row headers (Breakfast/Lunch/Dinner/Snacks) with color swatch + macro-expand chevron
  - Each cell: stacked entry cards + Add button
  - Entry cards: show type badge (violet for recipe, amber for takeout, none for food) + calories
  - `···` context menu on hover → Edit / Delete
  - Takeout "no snacks" constraint: snack cell for that day shows a warning note instead of an Add button

  **Mobile day view (below `sm` breakpoint):**
  - Compact pill tab strip `M T W T F S S` (today gets a blue dot badge)
  - Selected day label + daily calorie total below tabs
  - Four vertical meal sections with entry cards
  - FAB opens `MealPlanEntrySheet`

  Accepts `entries`, `onAdd`, `onEdit`, `onDelete`, `weekStart` props from `MealPlanPage`.

  **Copy Week modal:** Include `CopyWeekModal` as a local component in the same file — a centered dialog with a 7×4 checkbox grid (days × meals), all checked by default, with "Deselect all" toggle. Confirm triggers `onCopyWeek`.

  - **Manual tests:**
    - Desktop: sticky column headers scroll with the grid; row label column is sticky left; today column is highlighted; `···` menu opens Edit/Delete; clicking Add in a cell opens sheet with day + meal pre-set
    - Mobile: day tab strip, today dot, switching days, FAB opens sheet; week summary chip expands/collapses

- [x] **D.5 — `web-client/src/pages/MealPlanPage.tsx`: page wrapper**
  Create `web-client/src/pages/MealPlanPage.tsx`. Manages week navigation state (`weekStart` via `getMondayOf` / `shiftWeek` from `packages/shared`). Renders:
  - Sticky module header with week navigator (same `← Apr 14 – Apr 20 →` capsule as the calorie log's `DateHeader`) and "Copy from last week" button
  - Week summary strip (total planned calories + macros)
  - `WeeklyGrid` with data from `useMealPlanWeek`

  State lives here; `WeeklyGrid` is a pure presentational component.

- [x] **D.6 — Routing and navigation: add Meal Planning to the app**
  - `web-client/src/router.tsx`: add `{ path: '/meal-plan', element: <RequireAuth><MealPlanPage /></RequireAuth> }`.
  - `web-client/src/components/AppShell.tsx`: add "Meal Planning" nav item between Calorie Log and Habits, using a calendar icon (same style as existing nav items, active state `bg-stride-50 text-stride-700 font-medium`).
  - **Manual tests:** Navigate to `/meal-plan`; confirm the sidebar item highlights correctly and the page loads.

---

## Phase E: Calorie Log Ghost Row Integration

- [x] **E.1 — `web-client/src/hooks/useMealPlanDay.ts`: day-level hook**
  Create `web-client/src/hooks/useMealPlanDay.ts`. Accepts `date: string`. Calls `fetchMealPlanEntries({ date })`. Exposes `entries: MealPlanEntry[]` and `loading: boolean`. Used by the calorie log daily view to know what's planned for the current date.

  - **Vitest tests:** Add `web-client/src/hooks/useMealPlanDay.test.ts`. Test: empty result when no entries exist; entries reload when date prop changes.

- [x] **E.2 — `web-client/src/components/meal-plan/MealPlanGhostRow.tsx`: ghost row component**
  Create `web-client/src/components/meal-plan/MealPlanGhostRow.tsx`. Renders a single unlogged plan entry as a ghost row inside the calorie log's meal section.

  **Visual design (must match `ItemTable.tsx` row dimensions and spacing):**
  - Same left-border color as real logged items (`border-l-orange-400` for breakfast, etc.)
  - Dashed outer border (`border border-dashed border-gray-300`)
  - 65% opacity (`opacity-65`)
  - Calendar icon (indigo, `w-3.5 h-3.5`) to the left of the item name
  - For `food`/`recipe` entries: show item name + planned calories (`~380 kcal`)
  - For `takeout` entries: show restaurant name + amber badge (`≤1100 kcal`) + constraint text (`No sides`)
  - `Log` button (`bg-stride-600` pill, right side) that triggers the appropriate logging flow

  **Props:** `entry: MealPlanEntry`, `onLog: (entry: MealPlanEntry) => void`

  - **Vitest tests:** Add `web-client/src/components/meal-plan/MealPlanGhostRow.test.tsx`. Test: food entry renders name + calories; takeout entry renders amber badge and constraints; Log button calls `onLog`; component doesn't render when the entry has already been logged (this is enforced by the parent — test that at the parent level instead).

- [x] **E.3 — `web-client/src/components/meal-plan/LogFromPlanSheet.tsx`: quantity modal for food/recipe logging**
  Create `web-client/src/components/meal-plan/LogFromPlanSheet.tsx`. Opens when the user taps "Log" on a `food` or `recipe` ghost row.

  **Behavior:**
  - Bottom sheet on mobile / centered modal on desktop — use the same responsive wrapper pattern as `AddItemSheet.tsx` (slide-up on mobile, scale-in centered modal on `sm:`)
  - Shows item name (read-only label, not editable)
  - Indigo "Pre-filled from today's meal plan" banner
  - Quantity stepper: `−` / number display / `+` buttons. Step size 1 for whole units, 0.25 for partial. Adjusting qty auto-recomputes calories (`Math.round(baseCalories * qty / baseQty)`)
  - Calories field (number input, pre-filled from computed value, editable — user can override)
  - "Save Entry" button → calls `createCalorieLogItem` with `meal_plan_entry_id` set, then calls `onLogged()`

  **Props:**
  ```typescript
  {
    open: boolean
    onClose: () => void
    entry: MealPlanEntry
    defaultMealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
    onLogged: () => void  // triggers refetch of daily summary + meal plan entries
  }
  ```

  - **Vitest tests:** Add `web-client/src/components/meal-plan/LogFromPlanSheet.test.tsx`. Test: adjusting qty updates displayed calories correctly; submitting calls createCalorieLogItem with correct meal_plan_entry_id; Save button is disabled while request is in flight.

- [x] **E.4 — `web-client/src/components/calorie-log/AddItemSheet.tsx`: takeout ghost row logging support**
  Two small changes to the existing `AddItemSheet`:
  1. Add an optional `mealPlanContext` prop:
     ```typescript
     mealPlanContext?: {
       entryId: number
       takeoutName: string
       calorieLimit: number
       noSnacks: boolean
       noSides: boolean
     }
     ```
  2. When `mealPlanContext` is provided:
     - Pre-fill `item_name` with `takeoutName`
     - Show the amber context banner below the header: `"From meal plan: [name] · ≤[limit] kcal · [constraints]"`
     - On save, include `meal_plan_entry_id: mealPlanContext.entryId` in the create payload

  No other behavior changes — the user still enters actual calories themselves.

  - **Vitest tests:** Add a test to the existing `AddItemSheet.test.tsx` (or create it if it doesn't exist): when `mealPlanContext` is provided, the amber banner is rendered with the correct text; `meal_plan_entry_id` is included in the submitted payload.

- [x] **E.5 — `web-client/src/pages/CalorieLog.tsx`: integrate ghost rows**
  In the daily view:
  1. Call `useMealPlanDay(date)` alongside the existing `useDailySummary` hook.
  2. Compute `loggedEntryIds`: a `Set<number>` of `meal_plan_entry_id` values from the current day's `CalorieLogItem[]` (filter out nulls).
  3. Pass `planEntries: MealPlanEntry[]` and `loggedEntryIds: Set<number>` as props to `ItemTable`. Inside `ItemTable`, at the bottom of each meal-type section (after real logged items, before the "+ Add" button), render a `MealPlanGhostRow` for each entry in `planEntries` where `entry.meal_type === section.type && !loggedEntryIds.has(entry.id)`.
  4. Wire the `onLog` callback:
     - If `entry.entry_type === 'food' || 'recipe'` → open `LogFromPlanSheet`
     - If `entry.entry_type === 'takeout'` → open `AddItemSheet` with `mealPlanContext` set
  5. After successful logging, refetch both `useDailySummary` and `useMealPlanDay`.

  Ghost rows are appended after real logged items within each meal section, before the "+ Add" button.

  - **Manual tests:**
    - Create a plan entry for today via the Meal Planning page.
    - Open Calorie Log → ghost row appears in the correct meal section with the calendar icon.
    - Log a food entry via the qty modal → ghost disappears, real item appears with the calendar icon indicator.
    - Log a takeout entry → AddItemSheet opens pre-filled with the amber banner; save → ghost disappears.
    - Navigate to a different date → ghost rows disappear (no plan for that date).
    - Delete the meal plan entry from the Meal Planning page → ghost row disappears from the calorie log immediately on next page visit (or on manual refetch).

  - **Playwright E2E tests:** Add `e2e/tests/meal-plan.spec.ts` with two specs:

    **Spec 1 — Food entry ghost row:**
    - Navigate to `/meal-plan`; create a food entry for today's breakfast (e.g. "Oatmeal", 350 kcal)
    - Navigate to `/calorie-log`; verify ghost row appears under Breakfast with "Oatmeal" and "~350 kcal"
    - Click Log; confirm qty modal opens with name and calories pre-filled; submit
    - Verify ghost row is gone and a real logged item with the calendar icon appears
    - Verify the calorie ring total has increased by 350

    **Spec 2 — Takeout entry ghost row:**
    - Navigate to `/meal-plan`; create a takeout entry for today's dinner ("Sushi", ≤900 kcal, No sides)
    - Navigate to `/calorie-log`; verify ghost row appears under Dinner with the amber "≤900 kcal" badge and "No sides" text
    - Click Log; confirm `AddItemSheet` opens (not the qty modal) with "Sushi" pre-filled and the amber plan context banner visible
    - Enter 850 as actual calories; submit
    - Verify ghost row is gone and real item appears with calendar icon

    Add `Mobile Chrome` project variant in `e2e/playwright.config.ts` (Pixel 7 viewport) for both specs to catch responsive breakpoint issues.

---

## Phase F: Calorie Log Regression E2E

These tests cover existing calorie log flows that are most likely to break from Phase E changes (ghost row injection into `ItemTable`, `meal_plan_entry_id` added to create payload, `AddItemSheet` changes). Add them to `e2e/tests/calorie-log.spec.ts`. They should be written before Phase E lands so they serve as a safety net.

- [x] **F.1 — Add item via FAB**
  The most-used path; tests the full create flow and that the DOM is still correct after `ItemTable` receives the new `planEntries` prop.
  - Open `/calorie-log` for today
  - Click FAB → `AddItemSheet` opens
  - Fill "Chicken breast", type Lunch, qty 200, unit g, 220 kcal
  - Save → item appears in the Lunch section with correct name and calorie count
  - Verify net calorie total in the ring has increased by 220
  - **Mobile Chrome:** repeat on Pixel 7 viewport — sheet slides up, form is usable, item appears

- [x] **F.2 — Edit item via context menu**
  Tests that inline editing still works after `ItemTable` prop changes.
  - Log an item (any method)
  - Right-click (or tap `···`) → Edit → change calories from X to X+100 → Save
  - Verify the displayed calories and ring total both reflect the new value
  - Reload the page; verify the change persisted

- [x] **F.3 — Delete item**
  Tests the delete path and that totals update correctly — important because ghost rows adjacent to real rows could cause index/DOM confusion.
  - Log an item
  - Right-click → Delete → confirm removal from the section
  - Verify the calorie total decreases accordingly
  - Verify no ghost rows are affected (if there are any plan entries for the day, they remain)

- [x] **F.4 — Date navigation scopes items correctly**
  Ensures ghost rows from today don't bleed into other dates — a real risk since `useMealPlanDay` is keyed on the current date.
  - On today's view, log one item and note the total
  - Click the back arrow to navigate to yesterday → verify a different (or empty) item list, different total
  - Click forward back to today → original item and total are restored

---

## Implementation Notes

**Naming:** The DB table is `meal_plan_entries`. The Go struct is `MealPlanEntry`. The TypeScript type is `MealPlanEntry`. The URL namespace is `/api/meal-plan/entries`.

**Ghost row detection logic** (purely frontend): A plan entry is "unlogged" when no `CalorieLogItem` for the same date has `meal_plan_entry_id === entry.id`. No backend join required.

**AI suggest** in `MealPlanEntrySheet` reuses the existing `POST /api/calorie-log/suggest` endpoint and the `useSuggestion` hook unchanged. The meal type passed to the suggest call should be the `mealType` prop of the sheet.

**Recipe snapshot:** When `entry_type === 'recipe'`, the `createMealPlanEntry` handler in `go-api/meal_plan.go` should look up the recipe by `recipe_id` and reject with 400 if `recipe.calories IS NULL` (frontend also blocks this, but belt-and-suspenders). Otherwise scale calories/macros by `servings / recipe.servings` and store them in the food-type columns (`calories`, `protein_g`, etc.) at insert time. `recipe_id` is still stored for display purposes (recipe badge link). Null macro fields (protein/carbs/fat) are stored as-is — only calories is required.

**Sort order:** New entries are appended to their cell with `sort_order = MAX(sort_order) + 1` for that `(user_id, date, meal_type)` group. The backend computes this at insert time. No drag-to-reorder in this iteration.
