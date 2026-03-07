# Habits

## Overview

A daily/weekly habit tracker built into Stride. The core differentiator is **multi-level habits**: each habit has a Level 1 (bare minimum), and optionally Level 2 and 3 (stretch goals). This creates a spectrum of success rather than a binary done/not-done, giving a dopamine hit for exceeding the floor while still rewarding showing up at all. Habits are tracked with streaks and a heatmap history.

---

## User Stories

- As a user, I want to see all my habits for today and check them off quickly.
- As a user, I want multi-level habits so I can reward myself for doing more than the minimum.
- As a user, I want to track both daily habits and weekly ones (e.g. cleaning once a week).
- As a user, I want to see my streak so I'm motivated not to break it.
- As a user, I want a history view to see my consistency over time.

---

## References

| App | What it does well | Pattern |
|-----|-------------------|---------|
| [Streaks](https://streaksapp.com) | Large circular check-off per habit, max 12 habits, very fast to interact with | One big tap target per habit; streak count prominent |
| [Habitica](https://habitica.com) | Separates Habits / Dailies / To-Dos; XP/leveling for completion | Multi-category separation; progressive reward for completion |
| [Habit Quest](https://apps.apple.com/us/app/habit-quest-rpg-habit-tracker/id6670766671) | Habits earn XP in specific attributes; leveling feels earned | Attribute-tied progression |
| [Done](https://apps.apple.com/us/app/done-a-daily-habit-tracker/id1103961876) | Clean minimal design; supports "N times per week" frequency; no streak anxiety | Flexible frequency targets; completion counter not streak |
| [Atoms (James Clear)](https://atoms.jamesclear.com) | Habit stacking; focuses on identity, not streaks | Philosophy-first; tracks trend not perfection |

### Key patterns to borrow

- **Streaks** — big, tappable circle per habit (fast UX, no tiny buttons)
- **Habitica** — level concept, progressive reward
- **Done** — "N times per week" for weekly frequency habits
- **Atoms** — don't punish missed days too harshly; show trend, not just streak

---

## Frequency Design

**Daily habits** — must be done each day. Streak = consecutive days completing L1 or above.

**Weekly habits** — target a set number of times per week (1–7). The counter resets Monday. Example: "Clean bathroom — 1x/week". You log each completion (with a level), and the week counter fills up. No streak in the traditional sense; instead tracks "weeks hit target".

**Monthly habits** — not supported. Monthly is too long a feedback loop for the habit check-in UX. If you need a monthly reminder, use a repeating task (future feature).

---

## Multi-Level Habit Design

Each habit has 1–3 levels. Level 1 is always the minimum required to count the day as "done" for streak purposes. Levels 2 and 3 are optional stretch goals.

```
Habit: Go outside
  L1: Go outside at all        ← minimum. Streak counts this.
  L2: Go outside 15+ minutes   ← good
  L3: Go outside 30+ minutes   ← excellent
```

**Interaction model:** Tap the habit circle to cycle:
- Unlogged → L1 (indigo fill) → L2 (amber fill) → L3 (gold fill) → Unlogged

**Why tap-to-cycle:** Zero extra UI. One tap = L1. A second tap = better than minimum. A third tap = excellent. Fast enough for a daily check-in. Destructive (going back to unlogged) requires a long press to avoid accidents.

**Next level hint:** When a level is logged, the card shows the next level's description in a subtle muted line below the current status. This creates a pull toward going a bit further without being intrusive. Hidden when already at max level (shows "✦ Maximum level!" instead).

**Visual language:**
- Unlogged: gray empty circle
- L1: solid indigo (stride-600) fill — "done"
- L2: amber fill — "good"
- L3: gold/yellow fill + sparkle badge — "excellent"

**Streak rule:** Streak increments on any L1+ completion for daily habits. The level is tracked for history/stats (average level, % excellent days) but doesn't affect the streak count.

---

## Navigation

Two tabs in the sticky header (matching CalorieLog pattern):
- **Today** — daily check-in
- **Progress** — weekly overview + per-habit stats

---

## Screens

### 1. Today View (main habits screen)

**Purpose:** Quick daily check-in. See all habits and log completions.

**Layout:**
- Sticky header: "Habits" title + today's date + settings gear
- Habit list grouped loosely: daily habits first, then weekly habits
- Each habit row: tap-circle (left), name + level label, streak flame (right)
- FAB: "+" to add a new habit
- Empty state: illustration + "Add your first habit"

**Habit Row components (collapsed):**
- **Level circle** (48px) — large tap target on the left. Shows current logged level (or empty). Tap to advance level. Independent from expand toggle.
- **Name + badge** — habit name bold, level badge (L1/L2/L3 ✦) inline
- **Status line** — current level label when logged; "Tap circle to log" when unlogged
- **Next level hint** — muted arrow + description of the next level (e.g. "→ L3: Go outside 30+ min"). Hidden when at max or when unlogged.
- **Chevron** — right side. Tapping chevron or anywhere on the row (except circle) toggles expand.

**Expanded section:**
- **Level list** — each level shown with its colored dot and description. Current level highlighted, done levels shown with strikethrough, next level subtly marked "← next"
- **Stats row** — three cells: Consistency % (last 30 days) | 🔥 Streak | Avg level (last 30 days)

**States:**
- All done: green checkmark banner or subtle celebration
- Partially done: normal list
- Empty: full-page empty state with add prompt

**Interactions:**
- Tap circle → advance level (unlogged → L1 → L2 → L3 → unlogged)
- Long press circle → reset to unlogged (with confirmation)
- Tap row / chevron → expand card (levels + stats)
- "···" button → context menu: Edit, Archive, Delete
- "+" FAB → open add habit sheet

### 2. Progress View

**Purpose:** See how habits performed over a selected week, and drill into any habit's full history.

**Sub-header:** Week navigator capsule (same `bg-gray-100 rounded-full` pattern as calorie log weekly). Always visible (not desktop-only like the Today week strip).

**Weekly summary card:**
- Per-day bar row (Mon–Sun): colored by highest level achieved across all habits that day
- Stats: Days on track / Completion % / Avg level for the week
- "In progress" badge when viewing current week

**Habit list:**
- Each card shows: emoji + name, per-day dot strip (7 colored squares), days logged / streak / avg level for the week
- Tapping a habit expands inline to show: stats row (streak, longest, 30-day %, avg level), level breakdown bars, mini 8-week heatmap, and a "View full history →" link to the habit detail page
- "···" overflow menu same as Today

### 3. Edit / Archive / Delete

Accessed via the "···" overflow menu on any habit card in either tab. Opens a context menu (same fixed-position pattern as calorie log `ContextMenu.tsx`):
- **Edit habit** → opens add/edit sheet pre-filled
- **Archive** → hides from Today check-in but preserves all history in Progress. Archived habits can be restored from a settings/manage view.
- **Delete** → permanent, confirmation dialog

---

### 2. Add / Edit Habit Sheet

**Purpose:** Create a new habit or edit an existing one.

**Layout:** Bottom sheet (same pattern as AddItemSheet in the calorie log).

**Fields:**
- Emoji picker (optional, for visual identity)
- Name (text input)
- Frequency: Daily / Weekly tabs
  - Weekly: "__ times per week" stepper (1–7)
- Levels: always has L1. Toggle to add L2, L3.
  - Each level has a short label/description (e.g. "Go outside 15 min")
- Color accent (optional, for the circle): 4–6 preset colors

**Interactions:**
- Save → adds habit to today's list
- Cancel → dismisses
- Edit mode: pre-fills all fields; adds a "Delete Habit" button at bottom (destructive)

---

### 3. Habit Detail / History

**Purpose:** See history, streak stats, and level breakdown for a single habit.

**Layout:**
- Header: habit emoji + name + edit button
- Stats row: current streak, longest streak, completion rate (last 30 days), avg level
- Heatmap calendar (last 90 days): each day colored by level achieved (gray=missed, indigo=L1, amber=L2, gold=L3)
- Level breakdown: simple bar chart — what % of completions were L1 / L2 / L3
- Recent log list (last 14 days)

---

## Data

### New tables needed

**`habits`**
- `id`, `user_id`
- `name` text
- `emoji` text nullable
- `color` text nullable (accent color slug)
- `frequency` enum: `daily` | `weekly`
- `weekly_target` int nullable (1–7, only for weekly)
- `level1_label` text (always present)
- `level2_label` text nullable
- `level3_label` text nullable
- `sort_order` int
- `archived_at` timestamp nullable
- `created_at`, `updated_at`

**`habit_logs`**
- `id`, `user_id`
- `habit_id` int FK
- `date` date
- `level` int (1, 2, or 3 — only present when completed; no row = not done)
- `created_at`, `updated_at`
- Unique constraint: `(user_id, habit_id, date)`

### Streak computation

Computed server-side or client-side from `habit_logs`. For daily habits: count consecutive days backwards from today (or yesterday if today not yet logged) where a log row exists. For weekly habits: count consecutive weeks where `COUNT(logs in week) >= weekly_target`.

---

## Open Questions

1. **Tap-to-cycle discoverability** — first-time users won't know to tap again for L2/L3. Could show a one-time animated hint or a "tap again for next level" tooltip after first log.
2. **Long press to undo** — does this feel natural on Android? Alternative: swipe-left on the row to reveal "Undo".
3. **Negative habits** — supported, same data model, single-level binary. No special UI needed.
4. **Ordering** — drag to reorder, or auto-sort (incomplete first, then done)? Probably fixed drag order is better so daily list is predictable.
5. **No streak forgiveness** — decided: miss a day, streak resets.
6. **Navigation** — Habits is its own module in the sidebar, not part of the calorie log tabs.
