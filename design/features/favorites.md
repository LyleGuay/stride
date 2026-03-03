# Food Favorites & Quick Add

## Overview

Users repeatedly log the same meals — a morning protein shake, a nightly walk, bubble tea a few times a week. Today, every repeat entry requires either typing from scratch or right-clicking to duplicate. Favorites lets users save items as templates and surface them at the exact moment of adding an item: in the inline add row name field, or in the Add Item modal. A serving-scale control lets users adjust quantity without retyping macros.

## User Stories

- As a user, I want to star a food item so I can quickly add it again without retyping.
- As a user, I want a favorites shortcut while adding an item so I can pick and fill without leaving the add flow.
- As a user, I want to enter a custom serving count for a favorite so the calories and macros scale automatically.
- As a user, I want to search my favorites by name so I can find things when the list is long.
- As a user, I want to manage (view and remove) my favorites from a dedicated screen.

## References

| App | What it does well | Pattern |
|-----|-------------------|---------|
| MyFitnessPal | Tabs (Recent / Frequent / Favorites) in the food search flow | Tab-based scoped search |
| Cronometer | Star icon on the left of food items in search results | In-context toggle, Favorites tab |
| Lose It! | Smart suggestions based on logging history | Automatic recents / frequency |
| Todoist | Inline template picker with keyboard search | Popover triggered from the text field |

## Screens

### Daily View — Favoriting from existing items

**Purpose:** Mark an item you ate today as a favorite template for future use.

**Layout:**
Item rows gain a star icon on hover. The star sits to the left of the item name, appearing at low opacity until hovered. Clicking it toggles the favorite state (empty → gold star). Already-favorited rows show the gold star persistently (at lower opacity, full opacity on hover). The context menu (right-click / ···) also gains an "Add to Favorites" / "Remove from Favorites" option for discoverability.

**States:**
- Unfavorited row: star invisible, appears on hover at `text-gray-300`
- Favorited row: star always visible at `text-amber-400 opacity-60`, full opacity on hover

**Interactions:**
- Hover item row → star icon fades in
- Click star → item saved as favorite (star turns gold, persists)
- Click gold star → remove from favorites (confirmation optional)
- Right-click → context menu → "★ Add to Favorites"

---

### Inline Add Row — Favorites popover (Option A)

**Purpose:** Let the user pick a saved favorite from inside the inline add row without opening a full modal.

**Layout:**
When the inline add row is expanded, the name input field contains a small `★` button on its right edge (inside the input border). Clicking it opens a positioned dropdown below the name cell. The dropdown contains:
1. A search field (autofocused)
2. A scrollable list of favorites (name, default qty/uom, cal on the right)
3. A "Manage Favorites..." link at the bottom

**Favorite row (in dropdown):**
- Left: name (bold) + secondary line with qty/uom and P/C/F summary
- Right: calories (semibold)
- Far right: `×qty` hover button — only visible on row hover

**×qty serving scale:**
Clicking `×qty` expands an inline panel below the row (no separate popover):
- `Serving: [input] × [base qty and uom] = [scaled cal] cal`
- The cal value updates in real-time as the user types
- "Add with this serving" button submits

**Collapsed (`+ Add`) row:**
The collapsed state also shows a small `★ Favorites` button on the right edge so users can access favorites without first opening the full inline form.

**States:**
- Dropdown closed: name input shows the `★` button in the right edge
- Dropdown open, no hover: items listed with name/cal
- Dropdown item hovered: `×qty` button fades in
- `×qty` expanded: scale panel shows below the item

**Interactions:**
- Click `★` in name input → open favorites dropdown
- Type in dropdown search → filters favorites by name (client-side)
- Click favorite row → fill all inline add fields, close dropdown
- Click `×qty` → expand serving scale; cal updates live
- Click "Add with this serving" → fill fields with scaled values, close dropdown
- Click "Manage Favorites..." → navigate to favorites management page

---

### Favorites Chip Strip (Option B)

**Purpose:** Surface frequently-used favorites as instant one-click chips above the item table, for users who want to add common items without opening any dropdown at all.

**Layout:**
A horizontally-scrollable chip strip lives between the DailySummary card and the ItemTable. Each chip shows `★ Item name · cal`. Clicking a chip opens a compact popover with:
- The item name and default macros
- A qty input (pre-filled to default qty)
- Four "Add to [Meal]" buttons (Breakfast / Lunch / Dinner / Snack / Exercise)

The strip can be collapsed to a single-row toggle ("Quick add ▾") to save screen real estate.

**States:**
- No favorites: strip not shown
- Strip expanded: chips scroll horizontally
- Chip clicked: compact popover anchored to the chip
- Strip collapsed: single "Quick add ★" toggle button

**Interactions:**
- Click chip → open popover with qty + meal type
- Change qty → cal/macro preview updates
- Click meal type button → add item to that meal, close popover
- Click "▾" → collapse the strip

---

### Manage Favorites

**Purpose:** A dedicated page where users can view, reorder, and delete favorites.

**Layout:**
Simple list (not a table). Each row:
- Left: item name + secondary info (qty, uom, cal)
- Right: drag handle (reorder) + trash icon (delete)

Accessible from: "Manage Favorites..." link at the bottom of the favorites dropdown, and from the Settings page.

---

## Data

### New table: `calorie_log_favorites`

| Column | Type | Notes |
|--------|------|-------|
| id | serial | PK |
| user_id | int | FK → users |
| item_name | text | snapshot, not a reference |
| type | enum | breakfast/lunch/dinner/snack/exercise |
| qty | numeric | default serving qty |
| uom | enum | each/g/ml/oz/lb/km/miles/minutes |
| calories | int | per default serving |
| protein_g | numeric nullable | |
| carbs_g | numeric nullable | |
| fat_g | numeric nullable | |
| sort_order | int | for user reordering |
| created_at | timestamptz | |

No unique constraint — same item can be saved multiple times (e.g. different qty defaults). User manages their own list.

### New API endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/calorie-log/favorites` | List all favorites for current user |
| POST | `/api/calorie-log/favorites` | Create favorite (from item or from scratch) |
| DELETE | `/api/calorie-log/favorites/:id` | Remove a favorite |
| PATCH | `/api/calorie-log/favorites/:id/sort` | Reorder |

### Client-side serving scale

Scaling is client-side math: `scaled_cal = Math.round(fav.calories * (user_qty / fav.qty))`. Same for macros. No API call until the item is added.

## Open Questions

1. **Option A vs B as primary pattern** — Both mockups are provided. Option A (popover) is described in LYL-25; Option B (strip) is an alternative worth considering.
2. **Favoriting from items** — Star on row hover vs context menu only. Row hover is more discoverable; context menu alone is less cluttered.
3. **"Add to Favorites" when logging** — Should saving a new item via AddItemSheet offer a "Save as Favorite" checkbox? Could be a nice friction-free path.
4. **Favorites in AddItemSheet** — Same `★` button pattern, placed below the item name field (before the AI suggestion strip)?
5. **Sort order** — Default: most recently added or most frequently used?
