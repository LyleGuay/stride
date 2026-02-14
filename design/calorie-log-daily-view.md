# Calorie Log — Daily View

## Overview

The daily view is the primary screen of the Calorie Logging module in Stride. It replaces the Google Sheets dashboard, showing today's calorie budget, macros, and logged items at a glance. Users can log food and exercise entries via a bottom sheet triggered by a floating action button.

## User Stories

- As a user, I want to see how many calories I have left today so I can decide what to eat.
- As a user, I want to see my macro breakdown (protein, carbs, fat) so I can stay balanced.
- As a user, I want to quickly log a food item with calories and optional macros.
- As a user, I want to log exercise as negative calories so my net total is accurate.
- As a user, I want my items grouped by meal type so I can see what I ate when.

## References

| App | What it does well | Pattern |
|-----|-------------------|---------|
| MyFitnessPal | Diary as home screen, meal-grouped items, clean macro summary | Card-based meal sections, FAB for logging |
| Lose It! | Single circular dial for calories remaining, minimal UI | Circular progress indicator |
| Cronometer | Comprehensive macro targets, calendar date nav | Expandable sections |
| MacroFactor | Toggle consumed vs remaining, dynamic expenditure | Timeline format, view toggle |

## Screens

### App Shell (Sidebar + Content)

**Purpose:** Top-level navigation for all Stride modules.

**Layout:**
- **Top header bar** — sticky, spans the content area. Contains: hamburger menu (mobile), page title, profile avatar (top-right). Clicking avatar opens a dropdown with: Settings, Sign out.
- **Left sidebar** (collapsible on mobile via hamburger icon):
  - App name "Stride" at top
  - Nav items: "Calorie Log", "Habits" (more modules later)
  - Active item highlighted
- Main content area fills remaining space
- On mobile: sidebar is an overlay that slides in from the left

### Daily View (Main Content)

**Purpose:** See today's calorie/macro status and all logged items.

**Layout (top to bottom):**

1. **Date header** — Shows current date with left/right arrows to navigate days. "Today" label when viewing the current day.

2. **Calorie summary ring** — Circular progress ring showing calories consumed vs budget. Center displays calories remaining (or over). Budget number shown below the ring.

3. **Macro summary bars** — Three horizontal progress bars for Protein, Carbs, Fat. Each shows: current grams / target grams, and percentage. Color-coded: protein = blue, carbs = amber, fat = pink.

4. **Meal groups** — Collapsible sections for each meal type:
   - **Breakfast** — items with subtotal
   - **Lunch** — items with subtotal
   - **Dinner** — items with subtotal
   - **Snack** — items with subtotal
   - **Exercise** — items with subtotal (negative calories, shown in green)

   Each section header shows: meal name + calorie subtotal for that meal.
   Each item row shows: item name, qty × uom, calories. Tap to edit (future).
   Empty sections show "No items" in muted text but remain visible.
   Each section has a **"+ Quick add"** row at the bottom for inline entry (see below).

5. **FAB (+)** — Floating action button, bottom-right corner. Tapping opens the full add-item bottom sheet (with macros, qty, uom).

**Two ways to add items:**
- **Quick add (inline):** Each meal group has a "+ Quick add" button at the bottom. Tapping it reveals an inline row with just item name + calories + Add button. For fast entries where you don't need macros. An "Add with macros" link below escalates to the full bottom sheet with the type pre-selected.
- **Full add (bottom sheet):** FAB opens the complete entry form with all fields (name, type, qty, uom, calories, protein, carbs, fat).

**Components:**
- `CalorieSummaryRing` — SVG circular progress. Green when under budget, red when over.
- `MacroBar` — Horizontal progress bar with label, current/target values.
- `MealGroup` — Collapsible section header + item list + inline quick-add.
- `InlineAddRow` — Compact name + calories + Add button, expandable within a meal group.
- `FoodItemRow` — Single logged item: name, qty/uom, calories, macros (compact).
- `FloatingActionButton` — Fixed-position (+) button.

**States:**
- Empty: Ring shows 0/budget, all meal sections visible with "+ Add" rows, no items. FAB visible.
- Loaded: Ring fills based on consumed/budget, items listed under meal groups.
- Over budget: Ring turns red, calories remaining shows negative number in red.

**Interactions:**
- Tap date arrows → navigate to previous/next day
- Tap "+ Quick add" in a meal group → expands inline name + calories form
- Type name + calories, tap Add → item saved, form clears, closes
- Tap "Add with macros" → opens bottom sheet with type pre-selected
- Tap FAB → opens add-item bottom sheet (title: "Log Item")
- Tap meal group header → collapse/expand that section
- **Double-click a cell** → cell becomes an inline text/number input. Enter saves, Escape cancels, Tab moves to next editable cell. Green flash on save.
- **Right-click an item row** → context menu appears with:
  - "Edit item..." → opens bottom sheet pre-filled with the row's data (title: "Edit Item")
  - "Duplicate" → clones the row below the original
  - "Delete" → fades out and removes the row
- **Profile avatar (top-right)** → dropdown with: Settings, Sign out

### Add Item Bottom Sheet

**Purpose:** Log a food or exercise entry for the current day.

**Layout:**
- Slides up from bottom, overlays the daily view with a dimmed backdrop.
- Drag handle at top for swipe-to-dismiss.
- Form fields (top to bottom):
  - **Item name** — text input, required
  - **Type** — segmented control or dropdown: Breakfast, Lunch, Dinner, Snack, Exercise
  - **Quantity** — number input, default 1
  - **Unit** — dropdown: Each, g, Miles, KM, Minutes
  - **Calories** — number input, required
  - **Protein (g)** — number input, optional
  - **Carbs (g)** — number input, optional
  - **Fat (g)** — number input, optional
- **Save button** — full-width, submits the entry and closes the sheet.

**States:**
- Default: Type defaults to "Snack", Qty defaults to 1, Unit defaults to "Each".
- Exercise selected: Calories label changes to "Calories burned" (stored as negative).
- Saving: Button shows loading spinner.
- Error: Inline validation messages under required fields.

**Interactions:**
- Fill fields → tap Save → item added to daily view, sheet closes
- Tap backdrop or swipe down → closes sheet without saving
- Select "Exercise" type → calories field hint changes

## Data

Matches the existing spreadsheet structure. References future DB tables:

**`calorie_log_items`** — one row per logged item:
- `id`, `user_id`, `date`, `item_name`, `type` (enum: breakfast, lunch, dinner, snack, exercise), `qty`, `uom` (enum: each, g, miles, km, minutes), `calories`, `protein_g`, `carbs_g`, `fat_g`, `created_at`, `updated_at`

**`calorie_log_settings`** — per-user configuration:
- `user_id`, `calorie_budget`, `protein_target_g`, `carbs_target_g`, `fat_target_g`

Daily summaries can be computed from `calorie_log_items` (no separate table needed initially).

## Open Questions

- Should macro targets be fixed or configurable per day-of-week (like the weekly budget table in the spreadsheet)?
- Should there be a "quick add" for frequently logged items (e.g. "Banana Smoothie" with saved macros)?
- Delete/edit items — swipe gestures, long press, or tap-to-edit?
