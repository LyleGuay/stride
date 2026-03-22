# Calorie Log — Fibre Tracking

## Overview

Add dietary fibre (`fibre_g`) as a tracked macro nutrient. Fibre appears as a column in the desktop table, in an expandable row detail on mobile, and as a stat in the DailySummary panel. It is stored as an optional float alongside protein, carbs, and fat.

## User Stories

- As a user, I want to log fibre per food item so that I can track how much fibre I'm eating each day.
- As a user, I want to see my daily fibre total vs a target in the summary panel.
- As a user, I want to see fibre per item on desktop without extra taps, and on mobile without crowding the table.

## What Other Apps Do

The main challenge is that mobile tables can't fit P/C/F/Fi in columns without becoming unreadable.

| App | Mobile pattern |
|-----|---------------|
| **MyFitnessPal** | View-mode switcher (Calories / Macros / Nutrients tabs) — primary list shows only calories, secondary nutrients in a separate view |
| **Cronometer** | Customisable summary column — user picks which single nutrient shows in the main diary row; everything else in a detail view |
| **Lose It!** | Expandable meal cards — tap a food item to expand a detail strip with all macros |
| **General (NNG)** | Horizontal scroll with sticky item name, or expandable rows for secondary data |

**Decision:** Desktop shows fibre as a full column (consistent with P/C/F). Mobile uses an expandable row: tap any food item to reveal a detail strip with all macros including fibre. This avoids crowding the table while keeping fibre accessible.

## Design Decisions

- **Spelling:** "Fibre" — correct international/scientific spelling (EU, UK, Australian nutrition labelling). "Fiber" is American-only.
- **Desktop:** "Fi" column (teal-500/teal-600) after fat column, matching P/C/F pattern. Width w-12. Fibre total appears in the Net Total footer row (teal-600).
- **Mobile:** No fibre column. Mobile table columns: Item | Qty (combined qty+unit, e.g. "200g", "1 each") | Cal. Tap any food row → detail strip expands below showing Cal / Protein / Carbs / Fat / Fibre in a 5-cell grid. Tap again to collapse. Only one strip open at a time. Exercise rows are not tappable (no macros).
- **Mobile footer:** Net Total row shows Name | (blank) | Cal. A second micro-row below shows "Fibre 19g ↑ of 30g daily target" — surfaced here because it's a minimum target worth seeing without having to look at the summary panel.
- **Macro indicators (DailySummary):** Drop the "/ Xg" target text. Show value + colored indicator driven by the min/max fields:
  - Below min → `↑` amber (need more); at or above min → `✓` green
  - Above max → `↓` red (too much); at or below max → no indicator
  - Hover (desktop) shows a tooltip with the configured min/max values
- **DailySummary panel:** Macro row expands to 4 columns (Protein, Carbs, Fat, Fibre).
- **AI suggest:** Extend the prompt to return `fibre_g` when known. Falls back to null if unavailable.

## Screens

### Daily View — Item Table (Desktop)

Add "Fi" column header (teal-600) after "F". Each item row shows `fibre_g` (rounded integer, teal-500) in that column. Net Total footer: no fibre cell — use two empty cells at the end of the footer row instead.

### Daily View — Item Table (Mobile)

No new column. Tap a food row → a detail strip slides in below that row, showing:

```
Cal    P      C      F      Fi
218    5g    46g    2g     4g
```

Cells use the same macro colors. Tap the row again (or tap another row) to collapse — instant show/hide, no animation. The "···" button still opens the context menu — the tap target for expand/collapse is the rest of the row.

### Daily View — DailySummary Panel

Macro row expands from 3 → 4 columns (Protein, Carbs, Fat, Fibre). On very narrow mobile this 4-column grid may get tight — if so, wrap fibre onto a second row as a fallback.

### Add/Edit Item Form — AddItemSheet

Macro grid expands from 3 → 4 columns: Protein, Carbs, Fat, Fibre. Hidden for exercise type (same as other macros). On very narrow screens (< 360px), wraps to 2×2. Label: "Fibre (g)" in teal-500.

## Data

**DB changes — `calorie_log_items`:**
- `fibre_g numeric(6,1)` nullable — new column

**DB changes — `calorie_log_user_settings`:**

Replace the existing single `_target_g` fields with explicit min/max pairs for every macro (including the new fibre). This migration drops the old columns and adds the new ones:

| Old (drop) | New min | New max | Semantics |
|---|---|---|---|
| `protein_target_g` | `protein_min_g` | `protein_max_g` | Protein is a floor; max is optional |
| `carbs_target_g` | `carbs_min_g` | `carbs_max_g` | Carbs is typically a ceiling; min is optional |
| `fat_target_g` | `fat_min_g` | `fat_max_g` | Fat is typically a ceiling; min is optional |
| *(new)* | `fibre_min_g` | `fibre_max_g` | Fibre is a floor; max is optional |

All eight new columns are `numeric(6,1)` nullable. Neither min nor max is required — the indicator logic skips whichever is not set.

**Indicator logic (both DailySummary and mobile Macros view):**
- `min_g` set, actual < min → `↑` amber — below target, need more
- `min_g` set, actual ≥ min → `✓` green — target met
- `max_g` set, actual > max → `↓` red — over limit, too much
- `max_g` set, actual ≤ max → no indicator — fine
- Neither set → just show the number, no indicator

The directional arrows are intentional: ↑ means "go up", ↓ means "bring it down".

**API changes:**
- `DailySummary` response adds `fibre_g` total
- `CalorieLogItem` adds `fibre_g?: number | null`
- `CalorieLogUserSettings` replaces `protein_target_g` / `carbs_target_g` / `fat_target_g` with `protein_min_g`, `protein_max_g`, `carbs_min_g`, `carbs_max_g`, `fat_min_g`, `fat_max_g`, `fibre_min_g`, `fibre_max_g`
- Suggest endpoint returns `fibre_g` in the structured response

**Settings screen:**

Add a macro targets section to the Settings screen (currently absent). Show a form with min/max inputs for each macro, labelled clearly:

```
Protein   min: [___] g    max: [___] g
Carbs     min: [___] g    max: [___] g
Fat       min: [___] g    max: [___] g
Fibre     min: [___] g    max: [___] g
```

Each field is optional. Helper text below each row explains the semantics (e.g. "↑ shown when below min; ✓ when met"). NHS/WHO defaults for pre-fill suggestions: protein ≥ 0.8g/kg body weight, fibre ≥ 30g, fat ≤ 35% of calories.

## Open Questions

- **Settings screen placement:** Where does the macro targets section live within the existing Settings page? Does it need its own sub-section header, or can it follow directly after the calorie budget fields?
