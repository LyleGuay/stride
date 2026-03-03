# Food Favorites & Quick Add

## Goal

Let users save frequently-logged items as favorites and re-add them in a few clicks. Right-clicking any item in the log → "Save as Favorite" captures it. In the inline add row (and Add Item modal), a `★` button in the name field opens a searchable favorites dropdown. The dropdown filters by default to the current meal section's type; a filter toggle lets users see all food favorites. Exercise sections always show only exercise favorites. A `×qty` control scales calories and macros proportionally before adding. A "Manage Favorites" modal (accessible from the dropdown footer) shows favorites in category tabs and supports deletion.

---

## Phases

### Phase A: Database migration

- [x] **A.1 — Create `db/2026-03-02-001-calorie-log-favorites.sql`**

  Create the `calorie_log_favorites` table. Reuse existing `calorie_log_item_type` and `calorie_log_item_uom` enums — no new enum types needed.

  ```sql
  CREATE TABLE "calorie_log_favorites" (
    "id"         SERIAL PRIMARY KEY,
    "user_id"    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "item_name"  TEXT NOT NULL,
    "type"       calorie_log_item_type NOT NULL,
    "qty"        NUMERIC(10,2) DEFAULT 1,
    "uom"        calorie_log_item_uom DEFAULT 'each',
    "calories"   INT NOT NULL,
    "protein_g"  NUMERIC(6,1),
    "carbs_g"    NUMERIC(6,1),
    "fat_g"      NUMERIC(6,1),
    "created_at" TIMESTAMPTZ DEFAULT now()
  );

  CREATE INDEX idx_calorie_log_favorites_user_id
    ON calorie_log_favorites (user_id);
  ```

  No unique constraint — users can save the same item multiple times. No `sort_order` — list order is `id DESC` (newest first). Run `go run ./cmd/migrate` to apply.

  - **Manual tests:** After applying, `\d calorie_log_favorites` in psql shows correct columns and FK constraint.

---

### Phase B: Go API

- [x] **B.1 — Add `calorieLogFavorite` model to `go-api/models.go`**

  Add two structs to `models.go`:

  ```go
  // calorieLogFavorite is a saved item template for quick re-logging.
  type calorieLogFavorite struct {
    ID        int      `json:"id"         db:"id"`
    UserID    int      `json:"user_id"    db:"user_id"`
    ItemName  string   `json:"item_name"  db:"item_name"`
    Type      string   `json:"type"       db:"type"`
    Qty       *float64 `json:"qty"        db:"qty"`
    Uom       *string  `json:"uom"        db:"uom"`
    Calories  int      `json:"calories"   db:"calories"`
    ProteinG  *float64 `json:"protein_g"  db:"protein_g"`
    CarbsG    *float64 `json:"carbs_g"    db:"carbs_g"`
    FatG      *float64 `json:"fat_g"      db:"fat_g"`
    CreatedAt string   `json:"created_at" db:"created_at"`
  }

  // createFavoriteRequest is the POST /api/calorie-log/favorites body.
  type createFavoriteRequest struct {
    ItemName string   `json:"item_name" binding:"required"`
    Type     string   `json:"type"      binding:"required"`
    Qty      *float64 `json:"qty"`
    Uom      *string  `json:"uom"`
    Calories int      `json:"calories"  binding:"required"`
    ProteinG *float64 `json:"protein_g"`
    CarbsG   *float64 `json:"carbs_g"`
    FatG     *float64 `json:"fat_g"`
  }
  ```

- [x] **B.2 — Create `go-api/favorites.go` with 3 handlers**

  Create `go-api/favorites.go`. Register routes in `go-api/handler.go` under the existing authenticated `api` group.

  **Routes to add to `registerRoutes` in `handler.go`:**
  ```go
  api.GET("/calorie-log/favorites",      h.listFavorites)
  api.POST("/calorie-log/favorites",     h.createFavorite)
  api.DELETE("/calorie-log/favorites/:id", h.deleteFavorite)
  ```

  **`listFavorites`** — returns all favorites for the current user, ordered newest first:
  ```sql
  SELECT * FROM calorie_log_favorites
  WHERE user_id = @userID
  ORDER BY id DESC
  ```
  Returns empty array (not null) when no favorites exist.

  **`createFavorite`** — binds `createFavoriteRequest`, inserts and returns the created row:
  ```sql
  INSERT INTO calorie_log_favorites
    (user_id, item_name, type, qty, uom, calories, protein_g, carbs_g, fat_g)
  VALUES (@userID, @itemName, @type, @qty, @uom, @calories, @proteinG, @carbsG, @fatG)
  RETURNING *
  ```
  Returns 201 with the created favorite.

  **`deleteFavorite`** — deletes by `id` scoped to `user_id`, returns 204. Check `RowsAffected() == 0` → 404 `"favorite not found"`.

  - **Manual tests:** `curl -X POST`, `GET`, `DELETE` against local server with valid auth token. Verify 404 on delete of nonexistent ID. Verify user isolation (can't delete another user's favorite).

---

### Phase C: Shared types + web API client

- [x] **C.1 — Add `CalorieLogFavorite` type to `packages/shared/src/types.ts`**

  Add the type (mirrors the Go struct). Export it from the shared package so both web and mobile clients can use it:

  ```ts
  export interface CalorieLogFavorite {
    id: number
    user_id: number
    item_name: string
    type: string
    qty: number | null
    uom: string | null
    calories: number
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    created_at: string
  }
  ```

- [x] **C.2 — Add favorites API functions to `web-client/src/api.ts`**

  Add three functions following the existing `request<T>` wrapper pattern, and re-export `CalorieLogFavorite` from the shared import block at the top:

  ```ts
  export type { CalorieLogFavorite } from '@stride/shared'

  export function fetchFavorites(): Promise<CalorieLogFavorite[]> {
    return request<CalorieLogFavorite[]>('/api/calorie-log/favorites') ?? []
  }

  export function createFavorite(fav: Omit<CalorieLogFavorite, 'id' | 'user_id' | 'created_at'>): Promise<CalorieLogFavorite> {
    return request<CalorieLogFavorite>('/api/calorie-log/favorites', { method: 'POST', body: JSON.stringify(fav) })
  }

  export function deleteFavorite(id: number): Promise<void> {
    return request<void>(`/api/calorie-log/favorites/${id}`, { method: 'DELETE' })
  }
  ```

---

### Phase D: FavoritesDropdown component

- [x] **D.1 — Create `web-client/src/components/calorie-log/FavoritesDropdown.tsx`**

  A self-contained dropdown used in both `InlineAddRow` and `AddItemSheet`. Renders as an absolutely-positioned panel (caller is responsible for z-index and positioning).

  **Props:**
  ```ts
  interface Props {
    favorites: CalorieLogFavorite[]
    mealType: string          // current section type (breakfast/lunch/etc. or exercise)
    onSelect: (fav: CalorieLogFavorite, scaledQty: number) => void
    onManage: () => void      // opens the ManageFavoritesModal
    onClose: () => void
  }
  ```

  **Internal state:** `search: string`, `filterToType: boolean` (default `true`).

  **Filtering logic:**
  - `isExercise = mealType === 'exercise'`
  - If `isExercise`: always show `type === 'exercise'` favorites. No filter toggle.
  - Otherwise: `filterToType ? type === mealType : type !== 'exercise'` (all food types when filter off).
  - Search filters by `item_name` (case-insensitive substring).

  **Serving scale:** Per-row `×qty` button expands an inline scale panel. Extract the scaling math as a named export for testing:
  ```ts
  // scaleFavorite scales a favorite's nutrition to a different serving quantity.
  export function scaleFavorite(fav: CalorieLogFavorite, qty: number) {
    const baseQty = fav.qty ?? 1
    const ratio = baseQty > 0 ? qty / baseQty : qty
    return {
      qty,
      uom: fav.uom,
      calories:  Math.round(fav.calories * ratio),
      protein_g: fav.protein_g != null ? Math.round(fav.protein_g * ratio * 10) / 10 : null,
      carbs_g:   fav.carbs_g   != null ? Math.round(fav.carbs_g   * ratio * 10) / 10 : null,
      fat_g:     fav.fat_g     != null ? Math.round(fav.fat_g     * ratio * 10) / 10 : null,
    }
  }
  ```

  **Layout:** search input + filter icon (hidden for exercise) → scrollable favorites list → "Manage Favorites…" link in footer.

  **Empty state:** "No favorites yet" or "No results" text when list is empty after filtering/search.

  **Click outside to close:** `useEffect` adds a `mousedown` listener on `document`; fires `onClose` when click is outside the component's `ref`. Remove on cleanup.

  - **Unit tests** — Create `web-client/src/components/calorie-log/__tests__/FavoritesDropdown.test.tsx`:
    - `scaleFavorite(fav, qty)` — scales correctly when qty differs from base, handles null macros, handles null/zero base qty without divide-by-zero
    - Filter logic — food section shows only food favorites (not exercise), exercise section shows only exercise favorites
    - Filter toggle — disabling `filterToType` shows all non-exercise favorites for a food section; toggle hidden for exercise section
    - Search — filters by substring, case-insensitive
    - Clicking a row calls `onSelect` with correct fav and default qty (1)
    - `×qty` expand → changing qty updates displayed calories live
    - "Manage Favorites…" calls `onManage`
  - **Manual tests:** Open the dropdown in a Breakfast section — only breakfast favorites show. Click the filter icon → all food favorites appear. Open in the Exercise section → only exercise favorites, no filter icon.

---

### Phase E: ManageFavoritesModal component

- [x] **E.1 — Create `web-client/src/components/calorie-log/ManageFavoritesModal.tsx`**

  A modal dialog (same `fixed inset-0 bg-black/40` backdrop pattern as `AddItemSheet`). Five tabs: Breakfast, Lunch, Dinner, Snack, Exercise. Each tab shows a list of favorites of that type. Each row: item name + cal/macros summary + trash icon button.

  **Props:**
  ```ts
  interface Props {
    open: boolean
    favorites: CalorieLogFavorite[]
    onDelete: (id: number) => void
    onClose: () => void
  }
  ```

  **State:** `activeTab: string` (defaults to first tab that has favorites, or 'breakfast').

  **No API calls** — receives `favorites` from parent and calls `onDelete(id)` which the parent handles. The parent re-fetches after deletion.

  - **Manual tests:** Open the modal. Each tab only shows favorites of its type. Clicking the trash icon calls the delete handler and the item disappears after parent re-fetch. Modal closes on backdrop click and Escape key.

---

### Phase F: Wire up existing components

- [x] **F.1 — Update `web-client/src/components/calorie-log/ContextMenu.tsx`**

  Add a "Save as Favorite" option between "Duplicate" and the separator. No `isFavorited` tracking — saving is additive (user manages the list in the modal).

  Pass a new `onFavorite: () => void` prop. The existing `Props` interface gains:
  ```ts
  onFavorite: () => void
  ```

  Add the menu item (amber text, star icon):
  ```tsx
  <button onClick={onFavorite} className="flex items-center gap-2 w-full px-3.5 py-[7px] text-[13px] text-amber-600 hover:bg-amber-50">
    <span>★</span>
    Save as Favorite
  </button>
  ```

- [x] **F.2 — Update `web-client/src/components/calorie-log/InlineAddRow.tsx`**

  Add `favorites: CalorieLogFavorite[]` and `onManageFavorites: () => void` props.

  Changes:
  1. In the collapsed state (`!isOpen`): add a `★` button to the right of the `+ Add` text that opens the dropdown positioned over the row. Clicking it opens the dropdown without expanding the full inline add form.
  2. In the expanded state: embed a `★` button inside the right edge of the name input container (same visual as the mockup). Clicking it toggles `showFavorites` local state.
  3. When `showFavorites` is true, render `<FavoritesDropdown>` absolutely positioned below the name cell.
  4. `onSelect` callback from `FavoritesDropdown`: sets `name`, `qty`, `uom`, `calories`, `protein`, `carbs`, `fat` using `scaleFavorite` output; marks all fields dirty; hides dropdown. In collapsed state: also calls `onOpen()` to expand the form first, then fills.

  Keep changes minimal — do not reorganize existing state or extract new components beyond what's needed.

- [x] **F.3 — Update `web-client/src/components/calorie-log/AddItemSheet.tsx`**

  Add `favorites: CalorieLogFavorite[]` and `onManageFavorites: () => void` props.

  Add a `★` button below the name input (between the name field and the AI suggestion strip). When clicked, toggles a `showFavorites` local state. When `showFavorites` is true, render `<FavoritesDropdown>` as a card directly in the form flow (not absolutely positioned — let it push content down). The `mealType` passed to the dropdown is the form's current `type` value.

  `onSelect` callback: fills form fields with `scaleFavorite` output; marks all fields dirty (clears AI suggestion); hides dropdown.

  - **Manual tests:** Open "Log Item" modal set to Breakfast → click ★ → dropdown shows only breakfast favorites. Change type to Exercise → click ★ → shows only exercise favorites. Pick a favorite → form fields fill in correctly. Open with `×qty` → macros scale as expected.

---

### Phase G: CalorieLog page wiring + E2E

- [x] **G.1 — Update `web-client/src/pages/CalorieLog.tsx`**

  1. **Fetch favorites:** Add a `useFavorites()` custom hook in `web-client/src/hooks/useFavorites.ts`. Follows the same pattern as `useDailySummary`: fetches on mount, returns `{ favorites, reload }`. The hook calls `fetchFavorites()` and stores result in state. No loading state needed (favorites load in the background; missing favorites just means an empty list).

  2. **Pass favorites down:** Pass `favorites` and `onManageFavorites` to `ItemTable` (which passes to `InlineAddRow`), and to `AddItemSheet`.

  3. **Handle favorite creation** (from context menu's `onFavorite`):
     - In the `ctxMenu` handler: call `createFavorite({ item_name, type, qty, uom, calories, protein_g, carbs_g, fat_g })` using the context menu's current item data.
     - On success: call `favoritesHook.reload()` to refresh the list. Show a brief toast or no feedback (keep it quiet).

  4. **Handle favorite deletion** (from `ManageFavoritesModal`):
     - Call `deleteFavorite(id)`, then `favoritesHook.reload()`.

  5. **Manage modal state:** Add `showManageFavorites: boolean` state. Pass `onManageFavorites={() => setShowManageFavorites(true)}` to components that need it. Render `<ManageFavoritesModal>` at the bottom of the page tree.

  6. **Pass `onFavorite` to `ContextMenu`:** The existing `ctxMenu` state holds the current item. In the render of `ContextMenu`, pass `onFavorite={() => handleFavoriteItem(ctxMenu.item)}`.

  `ItemTable` will need `favorites` and `onManageFavorites` props threaded through to `InlineAddRow` — update `ItemTable`'s prop types and pass them down.

- [x] **G.2 — Add E2E test to `e2e/tests/favorites.spec.ts`**

  Cover the core flow end-to-end:

  ```
  1. Log in as the test user
  2. Navigate to the calorie log
  3. Add a new item (e.g. "Test Protein Bar", Snack, 1 each, 200 cal, 15P/20C/8F)
  4. Right-click the item → "Save as Favorite"
  5. Click "+ Add" in the Snack section → click ★ → favorites dropdown appears
  6. Verify "Test Protein Bar" appears in the dropdown
  7. Click it → snack inline form fills in correctly (200 cal, 15P, 20C, 8F)
  8. Submit → item appears in the snack section
  9. Open favorites dropdown again → click ×qty on "Test Protein Bar" → set qty to 2 → "Add with this serving"
  10. Verify the added item has 400 cal
  11. Right-click any item → "Save as Favorite" is present in the menu
  ```

  Follow the same per-file user isolation pattern used in other E2E tests (create a dedicated test user in `global-setup.ts` for the favorites spec).

  - **Manual tests:**
    - Open the Manage Favorites modal. Verify items appear under the correct category tab. Delete one — verify it disappears from the dropdown without page reload.
    - In the Add Item modal, change the type to Exercise, open ★ — verify only exercise favorites appear.
    - Filter toggle: open favorites in the Lunch section, click the filter icon — verify breakfast/dinner/snack favorites now appear too. Click again — back to lunch only.
