# Journal UX Improvements (LYL-41)

## Overview

A set of UX enhancements to the Journal module — not new features, but improvements to how the user navigates dates, views mental state data, and drills into tag-level detail. The core changes are: a calendar-based date picker on the Daily tab, a reworked Summary tab with time-range granularity (week/month/6M/1yr), a bar chart replacing the line chart for Mental State, and clickable emotion/type bars that drill into matching entries.

## User Stories

- As a user, I want to jump directly to a date using a calendar so I don't have to tap left/right through days one at a time.
- As a user, I want to see at a glance which days have journal entries (and their mood) while choosing a date.
- As a user, I want to view my mental state as a bar chart so I can better compare individual days in context.
- As a user, I want to click a day-bar in the Summary chart and jump directly to that day's entries.
- As a user, I want to click a Top Emotion or Entry Type bar and see which days match, so I can investigate patterns.
- As a user, I want week and month granularity in the Summary tab so I can zoom in on shorter-term trends.

---

## Screens

### Daily Tab — Calendar Date Picker

**Purpose:** Replace the "tap ← → forever" navigation with a direct calendar jump.

**Current state:** The DateHeader is a capsule with left/right arrows and the date label in the center. To jump to a date 2 weeks ago the user must tap ← 14 times.

**Change:** The date label (center of the capsule) becomes tappable. Tapping it opens a calendar popover anchored below the DateHeader.

**Calendar popover layout:**
- Month/year header with ← → to navigate months
- 7-column grid (Mon–Sun header row, then day cells)
- Each cell: date number + colored mood dot if entries exist that day
  - Green dot = avg score ≥ 4 (good)
  - Violet dot = avg score 2–3 (neutral)
  - Red dot = avg score = 1 (distress)
  - Gray dot = entries exist but no emotion tags
  - No dot = no entries
- Selected date highlighted (indigo ring)
- Today highlighted (subtle gray ring)
- Tapping a cell navigates to that date and closes the popover
- Tapping outside the popover closes it without navigating

**Data needed:** `GET /api/journal/calendar?month=YYYY-MM` returning `{ date, entry_count, avg_score }[]` per day. This is a new endpoint — lightweight, no entry bodies. Response is cached on the frontend per month; cache is invalidated when the user creates, edits, or deletes an entry for that month.

**Interactions:**
- Tap date label in DateHeader → open calendar popover
- Tap ← / → in popover header → change displayed month
- Tap a day cell → navigate to that date, close popover
- Tap outside → close popover

---

### Summary Tab — Redesigned

**Purpose:** Give the user time-range granularity and a more interactive chart experience.

#### Range Selector — New Options

Replace `1M | 6M | YTD | All` with `Week | Month | 6M | 1yr`.

| Range | Bars | Bar unit | Navigation |
|-------|------|----------|------------|
| Week  | 7    | 1 per day (Mon–Sun) | Week navigator (← This week →) |
| Month | 28–31 | 1 per day | Month navigator (← March 2026 →) |
| 6M    | ~26  | 1 per week | None (always "last 6 months") |
| 1yr   | ~52  | 1 per week | None (always "last 12 months") |

- Week and Month show a sub-navigator (same capsule style as week nav in calorie log).
- 6M and 1yr have no sub-navigator; they always show trailing data.
- Clicking a bar in 6M or 1yr view jumps to that week in **Week** view.

#### Mental State Over Time — Bar Chart

**Change from line chart to vertical bars.**

Bar anatomy:
- Bar height proportional to avg mental state score (1–5). Max height = score 5.
- Bar color by score: green-400 (4–5), violet-400 (2–3), red-400 (1). No-data days = gray-200 stub (2px min height, always visible so day slot remains in place).
- X-axis: day labels (Mon/Tue/Wed… for Week; every 5 days for Month; W1/W2… for 6M/1yr).
- Mobile: the chart area allows horizontal scroll so bars don't get too narrow on dense ranges (Month/6M/1yr).
- Clicking a bar → context menu tooltip (dark gray-800 background, matching calorie log weekly view) with:
  - Date label at top (gray-400 text)
  - Entries count row
  - Mental state score row (colored by score: green/violet/red)
  - Emotion emoji pill row — up to 4 emoji icons; if more, show a `+N` pill
  - "Go to day →" blue button (navigates to Daily tab, switches tab + sets date)
  - On 6M/1yr: clicking the bar jumps to that week in Week view instead of showing the tooltip

#### Top Emotions — Clickable Bars

**Change:** Each emotion bar becomes tappable.

Tapping a bar expands a "Matching days" panel below the Top Emotions card:
- Panel header: "{Emotion emoji} {Label} — {N} entries across {D} days"
- List of matching day rows: date, entry count, brief body preview (first 60 chars of first entry), "View →" link
- Panel is dismissed by tapping a close (×) button or tapping another bar

#### Entry Types — Clickable Bars

Same pattern as Top Emotions — tap a bar to see matching days/entries.

---

## Data

**New/changed API:**

- `GET /api/journal/calendar?month=YYYY-MM` — returns `{ date: string; entry_count: number; avg_score: number | null }[]` for each day in the month that has entries.

- `GET /api/journal/summary` — same endpoint, but new `range` values: `week`, `month`, `6m`, `1yr`. For `week` and `month`, add `ref_date` param (defaults to today) to support navigation. Response adds:
  - `mental_state_bars: { label: string; date?: string; week_start?: string; score: number | null }[]`
  - Keep `top_emotions` and `entry_type_counts` as-is.

- `GET /api/journal/tag-days?tag={value}&range={range}&ref_date={date}` — returns matching days + first entry preview for the clickable-bar drill-down.

---

## Decisions

1. **Calendar cache:** Frontend-only timed cache per month. Invalidated when the user creates, edits, or deletes an entry for that month.
2. **Week start day:** Monday (consistent with calorie log).
3. **Drill-down "View →":** Switches to the Daily tab and sets the date to the selected day.
4. **Empty bars:** Gray stub bar (minimum 4px height) so the day slot is always present and the x-axis stays consistent.
5. **Dense chart scrolling:** Chart area is horizontally scrollable on mobile for Month, 6M, and 1yr views. The surrounding card does not scroll.

## Stats Row

Show two stat cards: **Days Logged** and **Total Entries** (for the selected period). No streak card — streak tracking is not a journal concept.
