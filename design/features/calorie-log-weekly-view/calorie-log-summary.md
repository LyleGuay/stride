# Calorie Log — Summary View

## Overview

Three-tab segment control inside the Calorie Log page providing three zoom levels of the same data. **Daily** — the existing per-day log. **Weekly** — bar chart, weekly totals, weight-impact projection, and day-summary table. **Monthly** — weight trend graph and calorie adherence chart for the full month. A persistent weight-log FAB (scale icon) appears on all tabs; the add-item FAB (+) appears on the Daily tab only.

## User Stories

- As a user, I want to see how each day of the week stacked up against my calorie budget so I can understand my weekly pattern at a glance.
- As a user, I want a weekly bar chart of net calories with a budget reference line so I can immediately see which days I was over or under.
- As a user, I want to see my week's total food, exercise, and net calories so I understand the aggregate picture.
- As a user, I want an estimated weight impact for the week so I can see whether I'm on pace toward my goal.
- As a user, I want a scrollable table of daily summaries (matching my spreadsheet) so I can review and compare historical days.

## References

| App | What it does well | Pattern |
|-----|-------------------|---------|
| MyFitnessPal | Separates daily and weekly mental models cleanly | Segment control (Day/Week) within nutrition report; Progress tab for weekly view |
| MyNetDiary | Instant pass/fail readability per day | Green/red vertical bars per day; persistent on dashboard |
| Cronometer | Detailed macro breakdown across a period | Nutrition Report with date range; color-coded bars per nutrient |
| Noom | Eliminates tab switching | Stacked day cards via vertical scroll |
| Lifesum | Strong visual hierarchy, immediate progress feedback | Ring/circle + weekly Life Score summary |

**Chosen pattern:** 3-tab segment toggle (Daily / Weekly / Monthly) at the top of the CalorieLog page. No route changes — feels like a zoom level control on the same data. FAB group in the bottom-right: weight log button (always) + add-item button (Daily only).

## Screens

### Daily (existing)

No changes to content. Toggle defaults to "Daily". Shows DateHeader + DailySummary + ItemTable + add-item FAB.

---

### Monthly Tab

**Purpose:** Long-range view. Weight trend over the month, calorie adherence heatmap/bar chart, monthly aggregate stats.

**Layout (top to bottom):**
1. Month navigator (← February 2026 →)
2. Weight graph — line chart of logged weigh-ins for the month with area fill. Shows start/current/goal stats below.
3. Calorie Budget Adherence — compressed bar chart (one bar per day of the month). Green/red/gray like the weekly view but at a smaller scale.
4. Monthly summary stats — days under budget, avg net calories, total over/under budget, weight change.

**Weight logging FAB** — scale icon button, always visible in bottom-right corner across all tabs. Tapping opens a modal to enter today's weight and optional note. Saved entry is added to weight history. This is the primary entry point for weight logging (also accessible from Settings > Body Metrics for historical entry).

---

### Summary Tab

**Purpose:** Weekly overview. Lets the user evaluate their week-in-progress or review past weeks.

**Layout (top to bottom):**
1. Segment control: `[Daily] [Summary]` — replaces the DateHeader when Summary is active
2. Week navigator: `← Week of Feb 9–15 →` with a "Current week" sub-label
3. Stats cards row (3 cards): **Food** / **Exercise** / **Budget (weekly)**
4. Net Calories card: header with over/under badge + **SVG bar chart** + legend
5. Estimated Weight Impact card: projected lbs vs. goal with formula note
6. Day Summaries table: horizontally scrollable, one row per day (Mon–Sun), sticky date column

**Components:**

- **Segment control** — pill toggle using a `bg-gray-100` container with the active tab getting `bg-white shadow-sm`. Placed above the week navigator.

- **Week navigator** — identical pattern to DateHeader but navigates by week. Shows "Mon DD – Sun DD" range. Right arrow disabled on current week (no future data). Defaults to current calendar week (Mon–Sun).

- **Stats cards** — 3-column grid of compact cards: Food (total cal eaten), Exercise (total cal burned), Budget (daily budget × 7). Use the same `bg-white border border-gray-200 rounded-xl` style as other cards.

- **Bar chart (SVG)** — 7 vertical bars, one per day of the selected week. Bar height = net calories. Dashed horizontal reference line at the daily calorie budget. Bars colored **green** if net ≤ budget, **red** if net > budget. Days without data shown as a light gray empty bar with a small "—" label. Over/under badge in the card header shows total weekly delta. No external chart library — pure SVG, responsive via `viewBox`.

- **Estimated Weight Impact** — single card below the chart. Formula: `weekly_calories_left_sum / 3500`. Positive = under budget (lost more than goal pace), negative = over budget (lost less or gained). Display as `+0.9 lbs above goal pace` (red) or `–0.3 lbs ahead of goal` (green). Small info note explains the 3,500 cal/lb assumption.

- **Day Summaries table** — horizontally scrollable (`overflow-x-auto`). Sticky `Date` column on the left. Columns: Date (day + MM/DD) | Budget | Food | Exer. | Net | Left | Pro. | Carbs | Fat. `Left` column is green (positive, under budget) or red (negative, over budget). Today's row highlighted with a subtle blue tint. Future days shown dimmed with "No data yet". Totals/averages row at the bottom.

**States:**

- **Loading:** Spinner in place of chart and table.
- **Loaded (partial week):** Future days shown in table as dimmed rows. Chart bars for future days are hollow/gray. Estimated weight impact note clarifies "X of 7 days tracked."
- **Loaded (past week, complete):** All 7 bars filled; totals row shows full week.
- **No data for week:** Empty state message: "No entries logged this week."
- **Error:** "Failed to load summary data" with a retry button.

**Interactions:**

- Tap segment control → switches tab content (no route change)
- Tap `←` / `→` week navigator → loads the previous/next week's data
- Tap a table row → navigates to that day in the Daily tab (sets the date and switches tab)
- Tap bar in chart → shows a small tooltip with that day's net calories and budget delta

## Data

**Existing data available (from `/api/calorie-log/summary?date=`):**
- Already returns net_calories, food_calories, exercise_calories, macros per day

**New API needed:**
- `GET /api/calorie-log/week-summary?week_start=YYYY-MM-DD` — returns an array of 7 daily summary objects (one per day Mon–Sun). Days with no entries return a zero-value object with `has_data: false`.
- Response fields per day: `date`, `calorie_budget`, `calories_food`, `calories_exercise`, `net_calories`, `calories_left`, `protein_g`, `carbs_g`, `fat_g`, `has_data`

**Weight estimate:** Computed on the frontend from `sum(calories_left) / 3500` across days with `has_data: true`.

## Open Questions

- Should tapping a weekly summary table row navigate to the Daily tab for that day? Decided: yes — this should be implemented.
- Should there be a weekly budget that varies by day, or always `daily_budget × 7`? Assuming uniform for now (single `calorie_budget` per user).
- Weight log modal: should it allow backdating (e.g. "I forgot to log yesterday")? Probably yes — add a date field defaulting to today.
