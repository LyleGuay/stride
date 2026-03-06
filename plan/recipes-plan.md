# Recipes, Layout Redesign, and Calorie Log Tabs

## Goal

Implement the full Recipes module (spec: `design/features/recipes/recipes.md`), redesign the app layout to a "headerless" chrome pattern (sidebar user icon moves to the bottom, sticky h-14 page headers replace the top bar), and update the calorie log Daily/Weekly/Progress tab style to Variant C.

## Decisions

- **Recipe emoji**: Add `emoji TEXT` column to `recipes` table. Selector in edit mode. AI generate picks an emoji. Hardcoded category default as fallback.
- **Calorie log tabs (Phase C)**: Only two changes — (1) remove the top app header (Phase D), (2) restyle the Daily/Weekly/Progress tabs to Variant C. Weekly and Progress tab *content* already exists and is unchanged.
- **AI structured output**: Use OpenAI `json_schema` response format (stricter than `json_object`) for recipe generate/modify/copy. ⚠️ Follow-up: `suggest.go` currently uses `json_object` — upgrade it separately.
- **Step reorder**: Use `@hello-pangea/dnd`.
- **AI Modify**: Changes are applied to the local draft only — nothing is saved until the user clicks Save. No undo needed.
- **AI Copy**: Generates a new recipe into the local draft. User must click Save to persist it as a new recipe.
- **Finish Cooking prompt**: Removed. Use the `[🍽 Log Calories]` button on the recipe detail view instead.
- **Timers**: Only 1 active timer at a time. No floating pill / concurrent timer UI.
- **Delete**: Right-click context menu on recipe cards (list) and a delete option in the edit mode header. Both show a confirmation prompt before deleting.
- **`recipe_id` FK**: `ON DELETE SET NULL` — deleting a recipe nulls the reference in calorie log items rather than blocking the delete.

---

## Phases

Phases A and D are independent and can be worked in parallel. B and C depend on D being done first.

---

### Phase D — Layout: "Headerless" shell + sidebar profile footer

The design mockups establish a new layout pattern: sidebar logo at h-14, page headers full-width sticky at h-14 — their shared `border-b` creates one continuous horizontal chrome line. The profile/user area moves from the top-right header to the bottom of the sidebar.

- [x] **D.1 — Create `SidebarContext` + refactor `AppShell.tsx`**

  **Files:** `web-client/src/components/SidebarContext.tsx` (new), `web-client/src/components/AppShell.tsx`

  - Create `SidebarContext.tsx`: exports `SidebarContext`, `SidebarProvider`, and `useSidebar()` hook — provides `{ open: boolean, setOpen: (v: boolean) => void }`. AppShell wraps the app in this provider.
  - Remove the `<header>` element from AppShell entirely (the sticky top bar with "Stride" text and `ProfileDropdown`).
  - Change sidebar logo div to `h-14 flex items-center px-5 border-b border-gray-200`.
  - Add a profile footer at the bottom of the sidebar: avatar circle + username/email + chevron. Clicking opens the same dropdown as before (Settings, build SHA, Sign out). This replaces `ProfileDropdown` in the top-right.
  - `<main className="lg:ml-64 min-h-screen">` — remove any wrapper `<header>` inside it. `<Outlet />` renders directly.
  - Mobile sidebar overlay and toggle now use `SidebarContext` so pages can trigger it from their own headers.

  - **Manual test:** Sidebar chrome line aligns with page headers across all pages. Profile dropdown opens/closes. Sign out works. Mobile hamburger opens sidebar on all pages.

- [x] **D.2 — Update `CalorieLog.tsx` sticky header structure**

  **File:** `web-client/src/pages/CalorieLog.tsx`

  Restructure the DOM so tabs live in a full-width `h-14 border-b border-gray-200` sticky header outside any `max-w` wrapper. Add hamburger button (mobile only) on the left, wired to `useSidebar()`. The date navigator (`DateHeader`) becomes a second sticky row below the tabs, shown only when `tab === 'daily'`. Remove `DateHeader` from the daily tab's scroll content.

- [x] **D.3 — Update `Habits.tsx` and Settings page(s)**

  **Files:** `web-client/src/pages/Habits.tsx`, settings page (check path)

  Each page needs a sticky `h-14 border-b border-gray-200` header with: hamburger (mobile) + page title.

  - **Manual test:** Open each page, verify the chrome line aligns. Mobile hamburger works on all pages.

---

### Phase A — DB migrations + Go API

- [x] **A.1 — Migration: recipe tables**

  **File:** `db/2026-03-05-001-recipes.sql`

  Use a PostgreSQL enum for `category` (project naming convention: `{table}_{column}`):

  ```sql
  CREATE TYPE "recipe_category" AS ENUM ('breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'other');

  CREATE TABLE recipes (
    id           SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    emoji        TEXT,
    category     recipe_category NOT NULL DEFAULT 'other',
    notes        TEXT,
    servings     NUMERIC(6,2) NOT NULL DEFAULT 1,
    calories     INT,
    protein_g    NUMERIC(6,1),
    carbs_g      NUMERIC(6,1),
    fat_g        NUMERIC(6,1),
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE recipe_ingredients (
    id         SERIAL PRIMARY KEY,
    recipe_id  INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    qty        NUMERIC(10,2),
    uom        TEXT,
    note       TEXT,
    sort_order INT NOT NULL DEFAULT 0
  );

  CREATE TABLE recipe_tools (
    id         SERIAL PRIMARY KEY,
    recipe_id  INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
  );

  CREATE TABLE recipe_steps (
    id             SERIAL PRIMARY KEY,
    recipe_id      INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    type           TEXT NOT NULL CHECK (type IN ('instruction', 'timer')),
    text           TEXT NOT NULL,
    timer_seconds  INT,
    meanwhile_text TEXT,
    sort_order     INT NOT NULL DEFAULT 0
  );
  ```

- [x] **A.2 — Migration: add `recipe_id` to `calorie_log_items`**

  **File:** `db/2026-03-05-002-calorie-log-recipe-id.sql`

  ```sql
  ALTER TABLE calorie_log_items ADD COLUMN recipe_id INT REFERENCES recipes(id) ON DELETE SET NULL;
  ```

  `ON DELETE SET NULL` — deleting a recipe nulls the reference in log items rather than blocking the delete.

- [x] **A.3 — Recipe structs and request types**

  **File:** `go-api/models.go`

  Add structs: `recipe` (includes `Emoji *string`), `recipeIngredient`, `recipeTool`, `recipeStep`, `recipeDetail` (recipe + sub-slices), `recipeListItem` (subset for list — adds `StepCount int` and `TotalTimerSeconds int` computed via SQL subquery).

  Add request types: `createRecipeRequest`, `updateRecipeRequest`.

  Add `RecipeID *int` to `calorieLogItem`.

  `Category` scans as `string` in Go (pgx handles enum → string). Validate incoming values against allowed list in handler, same pattern as `validItemTypes` in `calorie_log.go:11`.

- [x] **A.4 — Recipe CRUD handler**

  **New file:** `go-api/recipes.go`

  Handlers:
  - `GET /api/recipes` — list all recipes for user; `step_count` and `total_timer_seconds` computed via correlated subqueries
  - `POST /api/recipes` — insert recipe + all sub-lists in a transaction
  - `GET /api/recipes/:id` — returns full `recipeDetail`
  - `PUT /api/recipes/:id` — update recipe fields + replace all sub-lists in a transaction
  - `DELETE /api/recipes/:id` — FK cascade handles sub-tables; returns 204
  - `POST /api/recipes/:id/duplicate` — copy recipe + all sub-lists in a transaction; returns new `recipeDetail`

  Follow pattern in `go-api/calorie_log.go`: `queryOne`/`queryMany` helpers, `pgx.NamedArgs`, `pool.BeginTx` for multi-table writes.

- [x] **A.5 — Recipe AI handler**

  **New file:** `go-api/recipes_ai.go`

  Handlers:
  - `POST /api/recipes/generate` — takes `{ prompt }`, calls OpenAI with `json_schema` response format enforcing the recipe shape, inserts result, returns new `recipeDetail`
  - `POST /api/recipes/:id/ai-modify` — sends current recipe JSON + user prompt to OpenAI, returns modified recipe JSON (does **not** save to DB — client applies to draft and saves on explicit Save)
  - `POST /api/recipes/:id/ai-copy` — same as ai-modify, returns modified recipe JSON (client saves as new recipe on explicit Save)
  - `POST /api/recipes/:id/ai-nutrition` — sends ingredient list to OpenAI, returns `{ calories, protein_g, carbs_g, fat_g }` without saving

  Use `gpt-4o` for generate/modify/copy (quality matters). Keep `gpt-4o-mini` for ai-nutrition (estimation task, same as calorie suggest).

  Use `response_format: { type: "json_schema", json_schema: { ... } }` — define the schema to match `recipeDetail` shape (name, emoji, category, notes, servings, nutrition fields, ingredients array, tools array, steps array). This is stricter than the `json_object` mode used in `suggest.go`.

  ⚠️ **Follow-up (not in this plan):** `suggest.go` uses the looser `json_object` mode — upgrade it to `json_schema` in a separate task.

- [x] **A.6 — Register recipe routes**

  **File:** `go-api/handler.go`

  ```go
  api.POST("/recipes/generate", h.generateRecipe)   // must be before /:id
  api.GET("/recipes", h.listRecipes)
  api.POST("/recipes", h.createRecipe)
  api.GET("/recipes/:id", h.getRecipe)
  api.PUT("/recipes/:id", h.updateRecipe)
  api.DELETE("/recipes/:id", h.deleteRecipe)
  api.POST("/recipes/:id/duplicate", h.duplicateRecipe)
  api.POST("/recipes/:id/ai-modify", h.aiModifyRecipe)
  api.POST("/recipes/:id/ai-copy", h.aiCopyRecipe)
  api.POST("/recipes/:id/ai-nutrition", h.aiNutrition)
  ```

- [x] **A.7 — Update calorie log handler for `recipe_id`**

  **File:** `go-api/calorie_log.go`

  - Add `recipe_id` to `createCalorieLogItem` INSERT + `createCalorieLogItemRequest`
  - Add COALESCE for `recipe_id` in `updateCalorieLogItem` SET clause

- [x] **A.8 — Go unit tests**

  **File:** `go-api/recipes_test.go`

  Add unit tests for any extracted pure functions (e.g. timer seconds formatter, nutrition scaler). If everything is a DB pass-through, skip — per testing strategy, pass-through handlers don't need unit tests. Run `go test ./...` to confirm no regressions.

---

### Phase B — Web client: Recipes module

- [x] **B.1 — Shared types**

  **File:** `packages/shared/src/types.ts`

  Add and export: `Recipe` (includes `emoji: string | null`), `RecipeDetail`, `RecipeListItem`, `RecipeIngredient`, `RecipeTool`, `RecipeStep`. Re-export from `packages/shared/src/index.ts`.

- [x] **B.2 — API functions**

  **File:** `web-client/src/api.ts`

  Add:
  - `fetchRecipes()` → `RecipeListItem[]`
  - `fetchRecipe(id)` → `RecipeDetail`
  - `createRecipe(data)` → `RecipeDetail`
  - `updateRecipe(id, data)` → `RecipeDetail`
  - `deleteRecipe(id)` → `void`
  - `duplicateRecipe(id)` → `RecipeDetail`
  - `generateRecipe(prompt)` → `RecipeDetail`
  - `aiModifyRecipe(id, prompt)` → `RecipeDetail` (server returns modified recipe JSON; client applies to draft)
  - `aiCopyRecipe(id, prompt)` → `RecipeDetail` (same — client saves as new on explicit Save)
  - `aiNutrition(id)` → `{ calories, protein_g, carbs_g, fat_g }`
  - `logFromRecipe(recipeId, servings, mealType, date)` → `CalorieLogItem` (calls `POST /api/calorie-log/items` with pre-scaled macros + `recipe_id`)

- [x] **B.3 — `useRecipes` and `useRecipeDetail` hooks**

  **Files:** `web-client/src/hooks/useRecipes.ts`, `web-client/src/hooks/useRecipeDetail.ts`

  - `useRecipes`: `{ recipes, loading, error, reload }`
  - `useRecipeDetail(id)`: `{ recipe, loading, error, reload }`

- [x] **B.4 — Recipe List page**

  **File:** `web-client/src/pages/RecipeList.tsx`

  Per spec and `design/features/recipes/recipe-list.html`:
  - Sticky `h-14` header: hamburger (mobile) + "Recipes" title + count badge + `[✦ AI Generate]` + `[+]`
  - Search input + category filter chips (All · Breakfast · Lunch · Dinner · Dessert · Snack · Other)
  - Card grid: 1-col mobile, 2-col desktop. Each `RecipeCard`: emoji (fallback to category default if null), name, category badge, cal/serving, step count, estimated time
  - Empty state: illustration + "Generate your first recipe" CTA
  - Right-click on card → context menu: Delete (with confirmation dialog). Duplicate is available in edit mode, not the list.
  - `AIGenerateSheet` triggers from `[✦ AI Generate]`; on success navigate to `/recipes/:newId`

  Category emoji defaults (if `recipe.emoji` is null): 🍳 breakfast · 🥗 lunch · 🍽 dinner · 🍰 dessert · 🍎 snack · 🍴 other

- [x] **B.5 — Recipe Detail page (view + edit modes)**

  **File:** `web-client/src/pages/RecipeDetail.tsx`

  Route: `/recipes/:id` (`:id` = "new" → edit mode with blank draft)

  Single component with `mode: 'view' | 'edit'` state.

  **View mode** (spec section 2):
  - Sticky `h-14` header: back button, recipe name, category badge, `[Edit]` button
  - Action bar: `[▶ Cook]` `[🍽 Log Calories]`
  - Nutrition panel: Cal / P / C / F per serving + serving count
  - Collapsible sections: Notes → Tools → Ingredients → Instructions (read-only)

  **Edit mode** (spec section 3):
  - Sticky `h-14` header: back (with unsaved-changes guard via `hasUnsavedChanges` boolean) + editable name input + category `<select>` + emoji selector + `[Delete]` button + `[Save]` button
  - AI action bar: `[✦ AI Modify]` `[✦ AI Copy]`
  - Nutrition panel: editable fields + `[✦ AI Auto-calculate]`
  - Sections: Notes (textarea), Tools (add/delete), Ingredients (inline edit rows), Steps (drag-to-reorder with `@hello-pangea/dnd`)

  **Emoji selector**: A small popover or inline grid of common food emojis. The selected emoji updates `draft.emoji`.

  **AI Modify flow**: opens `AIModifySheet` → on success, the returned `RecipeDetail` is merged into `draft` — nothing is written to DB yet. User reviews changes in edit mode and clicks `[Save]` to persist.

  **AI Copy flow**: opens `AIModifySheet` (copy mode) → on success, the returned `RecipeDetail` is merged into `draft` with `id` cleared (so Save creates a new recipe). User clicks `[Save]` → `createRecipe` is called → navigates to the new recipe.

  **Delete**: `[Delete]` button in edit mode header shows a confirmation dialog → `deleteRecipe(id)` → navigate to `/recipes`.

  **State**: `draft: RecipeDetail`, `hasUnsavedChanges: boolean`, `saving: boolean`.

  Key sub-components:
  - `RecipeNutritionPanel` — display/edit
  - `RecipeIngredientList` — read-only or editable rows
  - `RecipeStepList` — read-only or editable + `@hello-pangea/dnd` reorder
  - `LogFromRecipeSheet` (B.7)
  - `AIModifySheet` (B.8)

- [x] **B.6 — Execution Mode (Cook Mode)**

  **File:** `web-client/src/pages/RecipeExecution.tsx`

  Route: `/recipes/:id/cook`

  Full-screen page per spec section 4 and `design/features/recipes/execution-mode.html`:
  - `h-14` header: ✕ exit (navigate back to detail) + recipe name + "Step N of M" + `[≡ Ingredients]` button
  - Segmented progress bar (one segment per step)
  - Step type badge + large step text
  - Timer panel (timer steps only): circular SVG countdown ring + MM:SS + Start/Pause/Resume. **Only 1 timer active at a time** — starting a new timer on a different step is not supported; user must finish or pause the current one first.
  - "Meanwhile…" card below timer panel when present
  - Bottom nav: `[← Prev]` `[Next Step →]` / `[Finish Cooking]` (on last step) — Finish navigates back to recipe detail; no Log Calories prompt

  Extract `useTimer` hook (singular — one timer): manages `{ stepId, secondsRemaining, running }`, tick interval, start/pause/resume, reset on step change.

  Screen wake lock: `navigator.wakeLock.request('screen')` on mount, release on unmount.

  Sub-components: `TimerRing` (SVG circular countdown), `IngredientsSlideSheet` (slide-up checklist).

  - **Vitest unit test** (`web-client/src/hooks/useTimer.test.ts`): test start decrements correctly, pause stops ticking, resume continues, timer stops at 0.

- [x] **B.7 — Log from Recipe sheet**

  **File:** `web-client/src/components/recipes/LogFromRecipeSheet.tsx`

  Bottom sheet: serving spinner (0.5 step, min 0.5), live macro preview (proportional scaling), meal type selector, `[Save to Log]`. Calls `logFromRecipe`.

  - **Vitest component test** (`LogFromRecipeSheet.test.tsx`): 1-serving recipe → change to 2 → calories doubled; change to 0.5 → calories halved.

- [x] **B.8 — AI Generate + AI Modify/Copy sheets**

  **Files:** `web-client/src/components/recipes/AIGenerateSheet.tsx`, `web-client/src/components/recipes/AIModifySheet.tsx`

  `AIGenerateSheet`: textarea + Generate → loading → success: `onGenerated(recipe)` called → parent navigates to `/recipes/:id`. Error: inline retry.

  `AIModifySheet`: `mode: 'modify' | 'copy'` prop. On success, calls `onResult(recipe)` — parent merges result into draft. No navigation, no auto-save. User reviews and saves manually.

- [x] **B.9 — Install `@hello-pangea/dnd`**

  **File:** `web-client/package.json`

  ```bash
  npm install @hello-pangea/dnd
  ```

  Used in `RecipeStepList` for drag-to-reorder in edit mode. Wrap the step list in `<DragDropContext>` + `<Droppable>` + `<Draggable>` and update `sort_order` values on drop.

- [x] **B.10 — Router + sidebar nav**

  **Files:** `web-client/src/router.tsx`, `web-client/src/components/AppShell.tsx`

  - Add routes: `/recipes`, `/recipes/:id`, `/recipes/:id/cook`
  - Add Recipes `<NavLink>` to the sidebar with a book/cookbook SVG icon

- [x] **B.11 — `useRecipes` hook test**

  **File:** `web-client/src/hooks/useRecipes.test.ts`

  Use `msw` to mock `GET /api/recipes`. Test: loading state, success returns array, error on failure, `reload()` re-fetches.

- [x] **B.12 — Playwright E2E: recipes critical path**

  **File:** `e2e/tests/recipes.spec.ts`

  No AI calls in E2E (flaky + expensive — AI handlers are covered by Go unit tests with mocked OpenAI responses).

  1. **Create + view**: navigate to `/recipes` → `[+]` → fill name, category, add one ingredient, add one step → Save → verify card appears in list → click it → verify detail renders correctly.

  2. **Log from recipe**: open a recipe → `[🍽 Log Calories]` → set servings to 2 → Save to Log → navigate to calorie log → verify item appears with scaled calories.

---

### Phase C — Calorie log tab redesign

Phase D must be complete first (D.2 restructures the sticky header).

Only two changes here — the Weekly and Progress tab *content* already exists and is unchanged.

- [x] **C.1 — Restyle tabs to Variant C**

  **File:** `web-client/src/pages/CalorieLog.tsx`

  Replace `flex bg-gray-100 rounded-lg p-1` pill buttons with Variant C inline tab buttons:

  ```tsx
  // Active
  className="px-4 h-full flex items-center gap-1.5 text-sm font-semibold text-gray-900 border-b-[3px] border-gray-900 -mb-px transition-colors"
  // Inactive
  className="px-4 h-full flex items-center gap-1.5 text-sm font-medium text-gray-400 border-b-[3px] border-transparent hover:text-gray-600 -mb-px transition-colors"
  ```

  The `-mb-px` makes the active tab's border extend into (and cover) the header's `border-b border-gray-200`, creating the "underline connects to chrome line" effect.

  Add inline SVG icons: Daily (clipboard), Weekly (calendar), Progress (chart). Copy from `design/features/calorie-log/calorie-log.html`.

- [x] **C.2 — Tab behavior test**

  **File:** `web-client/src/components/calorie-log/__tests__/CalorieLogTabs.test.tsx`

  - Default tab is Daily → DateHeader visible
  - Switch to Weekly → DateHeader hidden
  - Switch to Progress → DateHeader hidden
  - Switch back to Daily → DateHeader visible
