# Task Date Enhancements

Covers two issues shipped together:
- **LYL-48** — Recurring Tasks
- **LYL-49** — Scheduled Date vs Deadline

---

## Overview

Two related upgrades to the task date model, built in one pass because they share the same UI surface (the date fields in the Add/Edit modal) and the same data migration.

**LYL-49** splits the single `due_date` into two fields: a **Scheduled Date** (when to start/work on the task — drives Today/Upcoming routing) and a **Deadline** (the hard must-be-done-by date — drives overdue coloring and urgency warnings).

**LYL-48** makes tasks repeatable. On completion, a `task_completions` record is written and the scheduled date automatically advances to the next occurrence. The task never "dies" — it comes back.

---

## Scheduled Date vs Deadline (LYL-49)

### Concept

| Field | Meaning | Controls |
|-------|---------|----------|
| **Scheduled Date** | When you plan to work on it | Routing to Today/Upcoming views |
| **Deadline** | Must be done by | Overdue coloring, urgency warnings |

**Routing logic — what drives Today/Upcoming placement:**

```
if scheduled_date is set → use scheduled_date for routing
else if deadline is set  → use deadline for routing (same as Todoist)
else                     → task is Backlog (no date)
```

This means a task with only a deadline behaves exactly like a task with a `due_date` today — it surfaces in Today when the deadline is today or past, appears in Upcoming before that. The deadline column is the fallback routing date when no scheduled date exists.

**When both are set** — scheduled date controls when the task appears in Today; deadline provides a separate urgency signal that turns orange when ≤ 2 days away and red when past.

### Task Row

```
[priority border] [circle] [task name]           [Apr 8]  [⚑ Apr 12]
                            [tags...] [desc…]
```

- **Scheduled date chip** — primary date, always shown (amber=today, red=overdue, gray=future)
- **Deadline chip** — `⚑` icon + date, shown only when deadline is set and differs from scheduled date
  - Gray when > 2 days away
  - Orange when ≤ 2 days away
  - Red when today or past

### Add/Edit Modal — Date Fields

Two separate rows in the properties sidebar:

```
Scheduled   📅  Apr 8, 2026
Deadline    ⚑   Apr 12, 2026
```

Each row, when tapped/clicked, expands an inline calendar below it (the other collapses). Each calendar has shortcut buttons: Today, Tomorrow, Next week, Clear/No deadline. Closing a calendar by tapping again or selecting a date.

---

## Recurring Tasks (LYL-48)

### Recurrence Presets

Shown as single-select chips in the Repeat row:

```
[ None ] [ Daily ] [ Weekdays ] [ Weekly ] [ Monthly ] [ Yearly ] [ Custom… ]
```

**Custom** reveals:
- **Every [N stepper] [days / weeks / months]**
- Day-of-week toggles (M T W T F S S) — shown only when "weeks" is selected

**Anchor toggle** (shown for any preset except None):
- **On schedule** (default): next occurrence = current scheduled date + interval. Fixed cadence regardless of when you complete it. Good for: pay bills on the 1st, weekly review.
- **After completion**: next occurrence = completion timestamp + interval. Good for: car maintenance every 3 months, haircut every 4 weeks.

### Task Row — Recurring Indicator

A `↻` icon sits immediately left of the scheduled date chip:

```
[name]     ↻  Apr 12
```

No recurrence text in the row itself — the pattern is visible in the edit sheet.

### Completion Behavior

1. Tap checkbox → `task_completions` row inserted.
2. Scheduled date advances in-place to the next occurrence. Task **does not disappear** — it stays in the list with the new date (which may move it from Today to Upcoming).
3. Toast: **"↻ Rescheduled to Apr 12"** + Undo (5 sec).
4. Undo: deletes the completion record, restores the previous scheduled date.

**Complete forever** — ··· context menu on any recurring task:
- Inserts final `task_completions` record
- Sets `status = completed` — task disappears into the Completed section
- Toast: "Task completed"

### Context Menu Differences

Recurring tasks have an extra item in their ··· menu:

```
Edit
Complete forever   ← recurring tasks only
Cancel task
Delete
```

---

## Add/Edit Modal Redesign

The existing bottom sheet becomes a two-panel modal matching Todoist's layout.

### Desktop (≥ 640px) — Two-column modal

```
┌─────────────────────────────────────────────────────────────┐
│  Edit Task                                               ×  │
├──────────────────────────┬──────────────────────────────────┤
│  ○  [Task title…]        │  Priority                        │
│                          │  ● Urgent  ○ High  ○ Med  ○ Low  │
│  [Description / notes…]  ├────────────────────────────────  │
│  [               multi   │  Scheduled   📅 Today, Apr 5     │
│  [               line ]  │    [inline calendar if open]     │
│                          ├────────────────────────────────  │
│                          │  Deadline    ⚑ Apr 7, 2026       │
│                          │    [inline calendar if open]     │
│                          ├────────────────────────────────  │
│                          │  Repeat      ↻ No repeat         │
│                          │    [recurrence picker if open]   │
│                          ├────────────────────────────────  │
│                          │  Tags        finance  + add      │
├──────────────────────────┴──────────────────────────────────┤
│  [Cancel]                                         [Save]   │
└─────────────────────────────────────────────────────────────┘
```

### Mobile (< 640px) — Bottom sheet, single column

1. Drag handle
2. Title + status circle
3. Description textarea
4. Properties stacked as tappable rows (each expands inline):
   - Priority — always expanded (4 pill buttons)
   - Scheduled — tap to expand inline calendar
   - Deadline — tap to expand inline calendar
   - Repeat — tap to expand recurrence picker
   - Tags — chip input

---

## Data Model

### `tasks` table changes

```sql
-- Rename due_date → scheduled_date (or add new column + migrate values)
ALTER TABLE tasks RENAME COLUMN due_date TO scheduled_date;

-- Hard deadline (optional)
ALTER TABLE tasks ADD COLUMN deadline date;

-- Set automatically when status transitions to 'in_progress'; never set by the user directly
ALTER TABLE tasks ADD COLUMN started_at timestamptz;

-- Recurrence rule (null = non-recurring)
ALTER TABLE tasks ADD COLUMN recurrence_rule jsonb;
```

**`started_at` behavior:**
- Set by the backend the first time `status` is changed to `in_progress` on a task.
- Never shown in the UI, never editable by the user — purely for tracking/reporting (e.g. "how long did this sit in progress before completion?").
- Not reset if a completed task is un-done back to `in_progress` — the original start time is preserved.

**`recurrence_rule` shape:**
```json
{
  "frequency": "daily | weekdays | weekly | monthly | yearly | custom",
  "interval":  2,
  "unit":      "days | weeks | months",
  "days_of_week": [1, 3, 5],
  "anchor":    "schedule | completion"
}
```

### `task_completions` table (new)

Tracks completions for **all** tasks (recurring and one-off), enabling history and future reporting.

```sql
CREATE TABLE task_completions (
  id           serial primary key,
  task_id      int references tasks(id) on delete cascade,
  completed_at timestamptz not null default now()
);
CREATE INDEX ON task_completions (task_id, completed_at DESC);
```

**Backfill migration:** insert one row per existing task with `status = 'completed'`, using `completed_at` as the timestamp.

### API changes

| Endpoint | Change |
|----------|--------|
| `POST/PATCH /api/tasks` | Accept `scheduled_date`, `deadline`, `recurrence_rule` |
| `PATCH /api/tasks/:id/complete` | Write `task_completions` row; if recurring, advance `scheduled_date`; return `{ next_scheduled_date? }` |
| `PATCH /api/tasks/:id/complete-forever` | Write completion row, set `status = completed` |
| `DELETE /api/tasks/:id/completions/latest` | Undo — restore previous `scheduled_date` and `status` |

---

## Open Questions

1. **`due_date` rename:** Renaming to `scheduled_date` requires touching every query. Safer to add `scheduled_date` as a new column, copy `due_date` values, then drop `due_date`. Decide before writing the migration.
2. **Overdue without a deadline:** A task whose `scheduled_date` has passed but has no deadline — is it "overdue" or just "started"? Current spec: treat it the same as overdue (red, listed in Overdue group). Revisit if this feels too aggressive.
