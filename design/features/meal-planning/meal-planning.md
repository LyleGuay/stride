# Meal Planning

## Overview

Meal Planning is a new Stride module for planning meals a week in advance. Users lay out their intended breakfast, lunch, dinner, and snacks across a Mon–Sun grid, optionally pulling from existing recipes or specifying takeout with calorie constraints. The plan becomes a lightweight template that the Calorie Logger can import from — turning a plan into a logged entry with one tap.

## User Stories

- As a user, I want to see my whole week's meals at a glance so I can spot gaps and over-eating early.
- As a user, I want to plan takeout nights with a calorie cap and optional "no sides" rule so I can stay on track without over-restricting.
- As a user, I want to add a recipe to the plan with scaled servings so calories/macros compute automatically.
- As a user, I want to see weekly calorie and macro totals for my plan so I can balance the week.
- As a user, I want to see a per-day calorie total so I can distribute calories intentionally.
- As a user, I want to log food in the Calorie Logger by importing from today's plan so I don't have to re-enter everything.
- As a user, I want items logged from the meal plan to be marked distinctly so I can track plan vs. reality.

## References

| App | What it does well | Pattern |
|-----|-------------------|---------|
| Mealime | Week-at-a-glance with drag-to-reschedule; clean recipe scaling UI | 7-column calendar grid, swipeable on mobile |
| Plan to Eat | Persistent meal plan template library; copy plan week-to-week | Drag-and-drop from recipe library into grid cells |
| Cronometer | Macro targets per meal; "planned vs. actual" diary view | Nutritional totals row below grid |
| MyFitnessPal | Familiar meal-type rows (Breakfast/Lunch/Dinner/Snacks); copy meal from previous day | Grouped rows with expandable macros |

## Screens

### Weekly Planning Grid (Desktop)

**Purpose:** Plan the full week — see all days side by side, add/edit/remove meal items, review weekly calorie and macro totals.

**Layout (top to bottom):**

1. **Module header** — sticky, 56px, matches existing module headers. Left: "Meal Planning" title. Center: week navigator (← `Apr 14 – Apr 20` →). Right: "Copy from last week" button.

2. **Week summary bar** — a compact stat strip below the header showing:
   - Total Calories planned for the week (e.g. `14,280 kcal`)
   - Protein / Carbs / Fat totals in grams
   - These are summed across all items in the grid

3. **Planning grid** — main content area:
   - **Columns**: One per day (Mon–Sun). Column header shows: day name + date ("Mon Apr 14") + daily calorie total.
   - **Rows**: Four rows — Breakfast, Lunch, Dinner, Snacks. Row header on the left shows: meal type name + color swatch (matches calorie log colors: orange/yellow/indigo/green) + a `∨` expand toggle to show macro detail rows.
   - **Cells**: Each cell contains stacked item cards + an "Add" ("+") button at the bottom.

4. **Item card (within a cell):**
   - Item name (truncated to 1–2 lines)
   - Type badge: `food` (no badge, default) | `takeout` (fork-road icon + amber badge) | `recipe` (book icon + violet badge)
   - Calories value (right-aligned, small)
   - Three-dot (`···`) menu on hover → Edit, Duplicate to another day, Delete
   - When the row is expanded: protein / carbs / fat grams shown below the calorie value

5. **Add button** — small `+` button at the bottom of each cell. Clicking opens the Add Meal Plan Item sheet.

6. **Macro expand rows** — When a row header is toggled open, two sub-rows appear between the meal rows: Protein (g) totals per day, and Carbs/Fat (g) totals per day — compact, muted text in each day column.

**Column footer:** Each day column shows a sticky-ish subtotal of all planned calories for that day, visible below the Snacks row.

**States:**
- Empty week: All cells show only the `+` button with a faint dashed border. Week summary shows 0s.
- Partially planned: Mix of filled cells and empty `+` cells.
- Over weekly calorie budget: Week summary total turns amber/red.

**Interactions:**
- Click prev/next arrows → shifts to previous/next week
- Click `+` in a cell → opens Add Meal Plan Item sheet (meal type and day pre-selected)
- Click `···` on item card → context menu (Edit, Duplicate, Delete)
- Click `∨` row toggle → expands/collapses macro sub-rows for that meal type
- Click "Copy from last week" → copies all items from the previous week into the current week (with confirmation)

---

### Weekly Planning Grid (Mobile)

**Purpose:** Same planning capability but focused on one day at a time for a smaller screen.

**Layout:**
- Day tab strip replaces the week columns. Shows "M T W T F S S" initials as pill tabs, with the selected day highlighted in indigo. Swiping left/right navigates days.
- Below the tab strip: selected day's label + date + calorie total for that day.
- Four meal sections render vertically (Breakfast, Lunch, Dinner, Snacks) — same card format.
- Week summary strip collapses into a tappable "Week total: 14,280 kcal" chip that expands a small breakdown drawer.
- FAB (`+`) at bottom-right opens the Add Meal Plan Item sheet (day and meal type selectable in the sheet).

---

### Add Meal Plan Item Sheet

**Purpose:** Add a new item to a specific day + meal slot. Supports three item types with different fields.

**Layout:** Bottom sheet (slides up from bottom on mobile, centered modal on desktop).

**Header:** "Add to [Meal Type] · [Day]" (e.g. "Add to Dinner · Tuesday")

**Item type selector:** Three pill tabs at the top of the form:
- **Food Item** — A calorie log item, manual or AI-suggested
- **Takeout** — A restaurant/takeout entry with a calorie limit and optional constraints
- **Recipe** — A saved recipe with quantity scaling

**Food Item fields:**
- Item name (text input + AI Suggest strip below, same as `AddItemSheet`)
- Quantity (number) + Unit (dropdown)
- Calories (number, required)
- Protein / Carbs / Fat (g, optional)
- Favorites shortcut (star button below name, same as `AddItemSheet`)

**Takeout fields:**
- Restaurant or description (text, e.g. "McDonald's", "Any sushi")
- Estimated calorie limit (number, required — shown in the item card)
- Constraints (checkboxes):
  - No sides / No fries
  - No snacks
  - No dessert
- Notes (freeform, optional)

**Recipe fields:**
- Recipe picker (searchable dropdown of saved recipes)
- Servings multiplier (number input, default 1.0)
- Computed calories and macros preview (read-only, auto-calculated from recipe × servings)

**Save button:** Full-width, adds item to the grid cell and closes sheet.

**States:**
- Saving: Button shows spinner
- Recipe not found: Empty state in picker with link to create one
- AI suggestions: Same debounce + suggestion strip as calorie log

---

### Calorie Logger Integration — "From Meal Plan" Source

**Purpose:** When logging food for the day, quickly import from the current day's meal plan.

**Entry point:** In the existing `AddItemSheet`, alongside the Favorites star button, a new **"📅 From Meal Plan"** button appears. Tapping it opens a picker showing today's planned items that haven't been logged yet, grouped by meal type.

**Picker layout:**
- Bottom sheet or inline dropdown (consistent with Favorites dropdown)
- Items grouped: Breakfast / Lunch / Dinner / Snacks
- Each item shows: name + planned calories + type badge
- Selecting an item pre-fills the form (name, calories, macros, qty, uom) — same behavior as Favorites
- Quantity can be adjusted before saving (like favorites serving scale)

**Post-log indicator:** Once an item from the meal plan is logged, it gets a small calendar checkmark indicator in the calorie log item row (similar to the existing recipe indicator). The corresponding meal plan cell also shows a faint "logged" checkmark overlay.

---

## Data

### New tables

**`meal_plans`** — one row per user per week:
- `id`, `user_id`, `week_start` (YYYY-MM-DD, always a Monday), `created_at`, `updated_at`

**`meal_plan_items`** — one row per planned item:
- `id`, `meal_plan_id`, `day` (0=Mon … 6=Sun), `meal_type` (enum: breakfast, lunch, dinner, snack)
- `item_type` (enum: food, takeout, recipe)
- For `food`: `item_name`, `qty`, `uom`, `calories`, `protein_g`, `carbs_g`, `fat_g`
- For `takeout`: `takeout_name`, `calorie_limit`, `no_sides` (bool), `no_snacks` (bool), `no_dessert` (bool), `notes`
- For `recipe`: `recipe_id` (FK → recipes), `servings` (float), `calories` (computed), `protein_g`, `carbs_g`, `fat_g` (all computed from recipe × servings at save time)
- `sort_order` (int, for ordering within a cell)
- `created_at`, `updated_at`

### Modified tables

**`calorie_log_items`** — add optional `meal_plan_item_id` (FK → meal_plan_items, nullable) to track when an entry was imported from the plan.

### Existing tables referenced

- `recipes` — for the recipe picker
- `calorie_log_favorites` — for the food item favorites picker
- `calorie_log_items` — for the "logged from plan" indicator

## Open Questions

1. **Week scope: Mon–Sun or Sun–Sat?** The weekly summary in calorie log uses Mon as week start — should we match that?
2. **Copy last week:** Should "Copy from last week" be a full copy (all items) or a prompt to select which days to copy?
3. **Takeout calories:** Should takeout items show a range (e.g. "~800–1000 kcal") or just a single cap? A range might be more realistic.
4. **Plan vs. reality tracking:** Should the module show a "planned vs. logged" comparison? Or keep it as planning-only with the calorie log doing the tracking?
5. **Recipe scaling:** Should the computed calories/macros be stored at save time (snapshot) or always recomputed from the live recipe? Snapshot is safer if recipes change.
6. **Week navigation scope:** Should users be able to plan future weeks beyond the current week, or only current + next?
7. **Saturday/Sunday:** Include weekend days (Mon–Sun, 7 columns) or only weekdays (Mon–Fri, 5 columns)? LYL-53 mentions "1 week."
