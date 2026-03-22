# Tasks

## Overview

The Tasks module is a personal to-do list that replaces Todoist. It tracks discrete action items with a name, optional description, due date, priority, status, and freeform tags. The primary workflow is a daily review: see what's overdue and due today, work through the list, check things off. Tasks are intentionally simple — no projects, no subtasks, no assignees — because this is a single-user personal productivity tool, not a project management suite.

## User Stories

- As a user, I want to see everything due today and overdue in one view so I know exactly what I need to act on.
- As a user, I want to add a task quickly with just a name so capture doesn't feel like overhead.
- As a user, I want to set a priority level so I can visually distinguish what's urgent from what can wait.
- As a user, I want to assign a due date so tasks show up in the right timeframe view.
- As a user, I want tasks with no due date in a separate Backlog view so they don't clutter my time-based views.
- As a user, I want to tag tasks with freeform labels so I can group loosely related items (e.g. "work", "errands", "health").
- As a user, I want to mark a task complete with a single tap and have it disappear from the active list.
- As a user, I want to mark a task "In Progress" without it counting as done, so multi-day tasks stay visible and distinguishable.
- As a user, I want to cancel a task without deleting it so I have a record of things I intentionally dropped.

## References

| App | What it does well | Pattern used |
|-----|-------------------|--------------|
| Todoist | Priority color-coding; inline metadata (due date, labels); Today/Upcoming split | Colored dot for priority, inline date chips, view-based grouping |
| Things 3 | Minimal list item; tap to expand; clean empty states | Single-line rows, detail on tap |
| Linear | Clear priority levels with icon+color; status as a first-class field | Priority indicator, status badge |
| Apple Reminders | Color-coded due dates (red=overdue, today=orange); simple checkbox | Contextual date coloring |

**Chosen direction:** Todoist's data model (priority + due date inline) with Stride's existing visual language (colored left border like meal-type rows in the Calorie Log, white cards, consistent bottom sheets for create/edit). Status is surfaced through the checkbox interaction rather than a separate UI element, keeping the list clean.

---

## Statuses

Four statuses, one of which is the terminal state:

| Status | Description | Visual |
|--------|-------------|--------|
| **Todo** | Default state on creation | Empty circle, priority-colored border |
| **In Progress** | Actively being worked on | Half-filled circle (indigo) |
| **Completed** | Completed; sets `completed_at` timestamp | Filled green circle with checkmark |
| **Canceled** | Intentionally dropped; sets `canceled_at` | Gray circle with × |

**Checkbox behavior:**
- Single tap → marks **Completed** immediately (same as current Todoist muscle memory)
- Long-press on mobile / hover+click on desktop → opens a small status dropdown with all four options

Done and Canceled tasks are removed from active views and moved to a collapsed "Completed / Canceled" section at the bottom. They can be un-done by tapping the checkbox again from that section (sets status back to Todo).

---

## Recurring Tasks (Future)

Recurring tasks are out of scope for v1 but the data model is designed to support them without migration pain. When added, the implementation will:

- Add a `recurrence_rule` text column on `tasks` (e.g. `RRULE:FREQ=WEEKLY;BYDAY=MO`)
- On completion, instead of a simple `status = completed`, spawn a new task row for the next occurrence
- The original task row keeps its `completed_at`; a new row is inserted with the next `due_date`

No recurring-specific UI is designed yet, but the schema leaves room for it.

---

## Screens

### Tabs

**Today | Upcoming | All** — sticky header, underline-style (matching CalorieLog/HabitsPage).

| Tab | What it shows |
|-----|---------------|
| **Today** | Tasks with `due_date` = today or overdue; grouped Overdue → Today |
| **Upcoming** | Tasks with `due_date` in the next 7 days; grouped by day |
| **All** | All tasks — filtered by Active / Backlog / Completed / Canceled |

---

### Task List — Today View

**Purpose:** The primary daily view. Shows exactly what needs attention right now. Only tasks with an explicit due date (today or overdue) appear here — no-due-date tasks live in Backlog.

**Layout (top → bottom):**
1. Sticky tab header (Today active)
2. Scrollable task groups:
   - **Overdue** — tasks past their due date, sorted by due date ascending (oldest first), red count badge
   - **Today** — tasks due today, sorted by priority then name
3. Completed / Canceled section — collapsed by default, "Show X completed" toggle
4. FAB — stride-indigo, opens Add Task sheet

**Empty state:** "You're all caught up." centered with a subtle checkmark icon.

---

### Task List — Upcoming View

**Purpose:** See what's coming in the next 7 days to plan ahead.

**Layout:** Tasks grouped by day (Tomorrow, then named days). No overdue section (those appear in Today).

**Empty state:** "Nothing scheduled in the next 7 days."

---

### Task List — All View

**Purpose:** Complete task history and backlog management in one place. Filter pills at the top control what's shown.

**Filter pills:** **Active** (default) | **Backlog** | **Completed** | **Canceled**

| Filter | What it shows |
|--------|---------------|
| **Active** | Tasks with `status IN ('todo', 'in_progress')` and a due date; grouped by priority |
| **Backlog** | Tasks with no `due_date` (`status IN ('todo', 'in_progress')`); grouped by priority. An intentionally calm holding area — nothing here is "due." Each row has a Schedule button to assign a date. |
| **Completed** | All `completed` tasks; sorted by `completed_at` descending |
| **Canceled** | All `canceled` tasks; sorted by `canceled_at` descending |

**Search bar** (Active filter only): filters task rows in real time by name.

---

### Task Row Anatomy

```
[priority border] [status circle] [task name]              [due date]
                                  [tags...] [desc preview]
```

- **Priority border** — 4px colored left edge: Emergency=red, High=orange, Medium=indigo, Low=gray. Same pattern as meal-type borders in the Calorie Log.
- **Status circle** — 20px circle button. Visual state varies by status (see Statuses table above). Single tap → Done. Long-press → status dropdown.
- **Task name** — `text-sm font-medium`. Strikethrough + muted on Done/Canceled.
- **Due date** — right-aligned: red if overdue, amber if today, gray if future. Hidden in Backlog (no due date).
- **Tags** — second line, small gray pills.
- **Description preview** — second line, single truncated line in gray if description exists.
- **··· menu** — right of due date. Reveal on hover (desktop) or always visible (mobile).

---

### Status Dropdown (long-press / hover)

A small popover anchored to the status circle:

```
○  Todo
◑  In Progress
✓  Completed
×  Canceled
```

Tapping an option sets the status immediately and closes the popover. Available from any view, including the completed section (to un-complete a task).

---

### Add / Edit Task Sheet

**Trigger:** FAB (add) or tapping a task row body (edit).

**Layout (bottom sheet):**
- Drag handle
- Header: "New Task" / "Edit Task" + close ×
- **Name field** — large text input, autofocus
- **Description** — collapsible textarea, "Add notes…"
- **Due Date row** — calendar icon + "No due date" → date picker. Leaving empty routes task to Backlog.
- **Priority row** — four pill buttons: Emergency | High | Medium | Low (single select)
- **Status row** (edit mode only) — same four status options as dropdown
- **Tags row** — freeform chips, press Enter or comma to add
- **Footer** — Cancel | Save

**Design note for recurring tasks (future):** The "Due Date" row will eventually expand to include a "Repeat" sub-row. The layout reserves space for this — the due date row can stack date + repeat without redesign.

---

## Data

```sql
-- One row per task instance. Recurring tasks will add a recurrence_rule column
-- and spawn new rows on completion rather than modifying this row.
tasks (
  id              serial primary key,
  user_id         int references users(id),
  name            text not null,
  description     text,
  due_date        date,                        -- null = no due date; routes to Backlog
  priority        task_priority not null default 'medium',
  status          task_status   not null default 'todo',
  completed_at    timestamptz,                 -- set when status → completed
  canceled_at     timestamptz,                 -- set when status → canceled
  -- Future: recurrence_rule text,            -- RRULE string, null = non-recurring
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
)

task_tags (
  task_id         int references tasks(id) on delete cascade,
  tag             text not null,
  primary key (task_id, tag)
)

create type task_priority as enum ('urgent', 'high', 'medium', 'low');
create type task_status   as enum ('todo', 'in_progress', 'completed', 'canceled');
```

**API routes (sketch):**
- `GET /api/tasks?view=today|upcoming|all|backlog|completed|canceled&today=YYYY-MM-DD&search=&limit=25&offset=0` — paginated task list; response: `{ tasks, has_more }`
- `GET /api/tasks/overdue-count?today=YYYY-MM-DD` — returns `{ count }` for the nav badge
- `POST /api/tasks` — create task (tags sent inline as `string[]`)
- `GET /api/tasks/:id` — fetch single task
- `PATCH /api/tasks/:id` — update (any fields; tags as `string[]` full-replace when provided)
- `DELETE /api/tasks/:id` — hard delete

---

## Due Date & Time

Due date is a single field (`due_date date, due_time time`). Time is optional.

- When no time is set: task shows "Today", "Mar 25", etc. with no time. All time-less tasks for a day are treated as due at end-of-day for sorting.
- When time is set: task shows "Today · 2:00 PM" or "Mar 25 · 10:00 AM". Tasks with a time sort before time-less tasks within the same day.
- Time is set via the date picker panel — a "Add time" row appears at the bottom of the open calendar. Removing the time reverts to date-only.

**On Todoist's two-date model (Date + Deadline):**
Todoist's "Date" is a *scheduled* date (when you plan to work on it; controls Today/Upcoming appearance). "Deadline" is a *hard due* date (must be done by; shown separately, turns red when approaching). This distinction is more useful in team/project management contexts.

**Decision: one due date only.** Stride's `due_date` maps to Todoist's "Deadline" — it's the must-be-done-by date and is what drives Today/Upcoming views. No scheduled/start date for now. If the need arises, a `start_date` column can be added without redesign.

## Add / Edit Sheet

**Mobile:** slides up as bottom sheet. **Desktop (lg+):** centered modal (max-w-lg, max-h-90vh, rounded-2xl), same content.

### Due Date Row

Two inline buttons side by side:

1. **Date button** — shows selected date ("Today, Mar 21") or "No date". Clicking opens an inline calendar panel below with:
   - Month navigator (← Month Year →)
   - 7-column day grid
   - Quick shortcuts: Today | Tomorrow | Next week | No date
   - Time row at bottom: "Add time" + `<input type="time">` + clear ×
2. **Time button** — shows time ("2:00 PM") or "Add time" when no time set. Clicking opens the same calendar panel scrolled to the time row.

## Additional UX Details

### Undo
Completing or canceling a task (via checkbox tap or status menu) shows a toast with an **Undo** button. Undo window is 5 seconds (longer than a plain toast). Tapping Undo restores the task to its previous status in place. After the window closes, the action is committed.

### Overdue badge on nav
The Tasks sidebar nav item shows a red count badge when there are overdue tasks (status `todo` or `in_progress`, `due_date < today`). Disappears when all overdue tasks are resolved.

### Search
Available in the **All** tab via a search bar at the top. Filters task rows in real time by name (and description when built). No separate search page — search is scoped to the current filter (Active / Completed / Canceled).

### Sort order within groups
Within any priority group or day group: sort by **due date ascending** (earliest first), then by creation date for tasks with no due date or equal due dates.

### Default view
**Today** tab is the default on open.

### Mobile swipe actions
- Swipe right → complete (same as tapping the checkbox; shows Done animation + Undo toast)
- Swipe left → reveals context menu options inline (Edit, Cancel, Delete)

Post-MVP; noted here so the gesture targets are accounted for in layout (no interactive elements at the far left/right edges of task rows that would conflict).

### All tab filters
The All tab has three filter pills: **Active** (default) | **Completed** | **Canceled**.
- Active: all tasks with status `todo` or `in_progress`, grouped by priority
- Completed: all `completed` tasks, sorted by `completed_at` descending
- Canceled: all `canceled` tasks, sorted by `canceled_at` descending

This replaces a separate "Completed tasks" screen — history lives in the All tab.

## Open Questions

1. **Recurring tasks UX** — when we build this, does the user set recurrence in the Add sheet, or via a separate "Make Recurring" action after creation?
2. **Tag autocomplete** — suggest previously used tags as the user types?
