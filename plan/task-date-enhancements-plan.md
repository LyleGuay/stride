# Task Date Enhancements

## Goal

Upgrade the task data model and UI to support three related features: a **Scheduled Date vs Deadline** split (LYL-49) that gives tasks a separate "when to work on it" date and "must-be-done-by" hard deadline; **Recurring Tasks** (LYL-48) that automatically advance their scheduled date on completion and write a completion history record; and a **`started_at` timestamp** that is set the first time a task transitions to `in_progress`. These changes are built together because they share the same migration, the same API touch-points, and the same UI surface in the Add/Edit modal.

Design reference: `design/features/task-date-enhancements/`

---

## Phases

### Phase A: Database Migration

- [x] **A.1 — Write the migration SQL**
  Create `db/migrations/2026-04-06-001-task-date-enhancements.sql`. This single migration does everything:
  - Rename `due_date` → `scheduled_date` (new column + copy + drop old), keeping it nullable.
  - Add `deadline DATE` (nullable).
  - Add `started_at TIMESTAMPTZ` (nullable).
  - Add `recurrence_rule JSONB` (nullable).
  - Create the `task_completions` table with a `task_id` FK and `completed_at` timestamp; add an index on `(task_id, completed_at DESC)`.
  - Backfill: insert one row into `task_completions` for every existing task where `status = 'completed'`, using `completed_at` as the timestamp.
  - Update the existing index `idx_tasks_user_status_due` to reference `scheduled_date` instead of `due_date`.

  **Manual tests:** Run `go run ./cmd/migrate` from `go-api/`. Verify the migration runs clean, then connect to the DB and confirm the new columns exist, old `due_date` is gone, and `task_completions` was populated for completed tasks.

### Phase B: Go API — Data Model & Core Handlers

- [x] **B.1 — Update the `task` struct and `Task` shared type**
  In `go-api/models.go`, rename `DueDate` → `ScheduledDate`, add `Deadline *DateOnly`, `StartedAt *time.Time`, `RecurrenceRule *json.RawMessage` to the `task` struct.
  In `packages/shared/src/types.ts`, rename `due_date` → `scheduled_date`, add `deadline: string | null`, `started_at: string | null`, `recurrence_rule: object | null`.

- [x] **B.2 — Update `createTask` and `updateTask` in `go-api/tasks.go`**
  - Replace all `due_date` references with `scheduled_date`.
  - Accept `deadline` and `recurrence_rule` as optional fields in both create and update request types.
  - In `updateTask`, auto-set `started_at = NOW()` on the first transition to `in_progress` (only when `started_at IS NULL`). Keep the existing `completed_at` / `canceled_at` auto-management logic.
  - In `updateTask`, when `status → todo` or `status → in_progress` (undo), clear `completed_at`, `canceled_at` but leave `started_at` intact (preserve the original start time).

- [x] **B.3 — Update `listTasks` view queries in `go-api/tasks.go`**
  Apply the new routing logic everywhere `due_date` was used:
  - **today / upcoming / overdue**: route on `scheduled_date` when set, fall back to `deadline` when `scheduled_date IS NULL`.
    ```sql
    COALESCE(t.scheduled_date, t.deadline)
    ```
  - **backlog**: `scheduled_date IS NULL AND deadline IS NULL AND status IN ('todo','in_progress')`.
  - **overdue count** in `getOverdueCount`: same `COALESCE` pattern.
  - Update the SELECT list in all queries to include `deadline`, `started_at`, `recurrence_rule`, and drop `due_date`.

  **Unit tests:** Add `tasks_test.go` (new file in `go-api/`) with table-driven tests for the next-occurrence calculation function introduced in B.4. Also add tests for `started_at` auto-set logic by calling `updateTask` on a test DB via `httptest`.

- [x] **B.4 — Add `PATCH /api/tasks/:id/complete` endpoint in `go-api/tasks.go`**
  New handler `completeTask()` registered in `go-api/handler.go`:
  - Inserts a row into `task_completions`.
  - If `recurrence_rule` is NULL (non-recurring): sets `status = 'completed'`, `completed_at = NOW()`.
  - If `recurrence_rule` is set (recurring): advances `scheduled_date` to the next occurrence (do NOT change status). Returns `{ "next_scheduled_date": "YYYY-MM-DD" }` in addition to the full updated task.
  - Next-occurrence logic: extract a pure Go function `nextOccurrence(rule RecurrenceRule, base time.Time, anchor string) time.Time` — extract this so it's unit-testable independently.

- [x] **B.5 — Add `PATCH /api/tasks/:id/complete-forever` endpoint**
  New handler `completeTaskForever()` in `go-api/tasks.go`: inserts into `task_completions`, sets `status = 'completed'`, `completed_at = NOW()`, ignores `recurrence_rule`. Registered in `go-api/handler.go`.

- [x] **B.6 — Add `DELETE /api/tasks/:id/completions/latest` endpoint (undo)**
  New handler `undoCompletion()` in `go-api/tasks.go`:
  - Deletes the most recent `task_completions` row for the task.
  - If the task was recurring (has `recurrence_rule`): restores `scheduled_date` to the value it had before the last completion. Store the previous `scheduled_date` as a column on `task_completions` (`previous_scheduled_date DATE`) so undo can restore it precisely — add this column to the migration in A.1.
  - If the task was non-recurring (no rule): sets `status = 'todo'`, clears `completed_at`.

  **Unit tests:** Extend `tasks_test.go` to cover the `nextOccurrence` function with table-driven cases: daily, weekdays, weekly (specific days), monthly (end-of-month edge cases), yearly, custom intervals, both `schedule` and `completion` anchors.

### Phase C: Frontend — API Client & Types

- [x] **C.1 — Update `web-client/src/api.ts`**
  - Rename `due_date` → `scheduled_date` in `CreateTaskInput`, `UpdateTaskInput`, and all `fetchTasks` param references.
  - Add `deadline?: string`, `recurrence_rule?: object` to both input types.
  - Add three new API functions:
    ```typescript
    completeTask(id: number): Promise<{ task: Task; next_scheduled_date?: string }>
    completeTaskForever(id: number): Promise<Task>
    undoCompletion(id: number): Promise<Task>
    ```

- [x] **C.2 — Update shared types in `packages/shared/src/types.ts`**
  Already covered in B.1. Verify the shared package builds (`npm run build` in `packages/shared/`).

### Phase D: Frontend — TaskRow Component

- [x] **D.1 — Update date display in `TaskRow.tsx`**
  - Rename all `due_date` refs to `scheduled_date`.
  - Add a deadline chip: shown only when `deadline` is set and differs from `scheduled_date`. Color: gray when > 2 days away, orange when ≤ 2 days, red when past.
  - Add the recurring indicator: `↻` icon with a CSS tooltip showing the recurrence pattern (e.g. "Every week"), rendered left of the scheduled date chip. Only shown when `recurrence_rule` is non-null.
  - Update the in-progress status circle to use the marching-ants animation in the task's priority color (see design mockup). Add the CSS animation to the component or global styles.

  **Component tests:** Update `web-client/src/components/tasks/__tests__/TaskRow.test.tsx`:
  - Add test: deadline chip shown/hidden depending on whether `deadline` is set.
  - Add test: deadline chip color classes for past / ≤2 days / future cases.
  - Add test: recurring indicator shown only when `recurrence_rule` is set.
  - Update existing due-date display tests to use `scheduled_date` instead of `due_date`.

- [x] **D.2 — Update status circle completion in `TaskRow.tsx`**
  The status circle `onClick` currently calls `updateTask(id, { status: 'completed' })` directly. Change it to call `completeTask(id)` instead. If the response contains `next_scheduled_date`, show the "↻ Rescheduled to [date]" undo toast instead of the standard "Task completed" toast. Undo calls `undoCompletion(id)`.

  Add **Complete forever** to the ··· context menu for tasks that have a `recurrence_rule`. This calls `completeTaskForever(id)`.

### Phase E: Frontend — TaskSheet (Add/Edit Modal)

- [x] **E.1 — Redesign the modal layout in `TaskSheet.tsx`**
  Replace the current single-column bottom sheet with the Todoist-style two-panel layout from the design mockup:
  - **Desktop (≥640px):** Left panel (title + description), right sidebar (Priority dropdown, Scheduled Date, Repeat, Deadline, Tags). Use `sm:flex-row` to split the layout.
  - **Mobile (<640px):** Single column, same order. Properties are tappable rows that expand inline (calendar, recurrence picker).
  - The modal wrapper on desktop should be a centered modal (max-w-2xl) rather than a full-screen sheet.
  - Keep the existing bottom-sheet slide-up animation on mobile; use the existing scale-in modal animation on desktop.

- [x] **E.2 — Replace the due date field with Scheduled Date + Deadline in `TaskSheet.tsx`**
  - Rename the existing date picker row label to "Scheduled Date".
  - Add a second date picker row "Deadline" below the Repeat row. Same inline calendar pattern. Shortcuts: Tomorrow, Next week, No deadline.
  - Both pickers share the same calendar component — only one can be open at a time (opening one closes the other).

- [x] **E.3 — Add the Repeat (recurrence) picker to `TaskSheet.tsx`**
  Below the Scheduled Date row (above Deadline), add the recurrence picker:
  - Preset chips: None, Daily, Weekdays, Weekly, Monthly, Yearly, Custom…
  - Custom: interval stepper + unit select (days/weeks/months) + day-of-week toggles (only shown for "weeks").
  - Anchor toggle: "On schedule" / "After completion" with a description line.
  - Live summary label below the picker.
  - Clear button when a recurrence is set.
  - Wire to `recurrence_rule` in the form state as a JSON object.

- [x] **E.4 — Replace priority pills with a dropdown in `TaskSheet.tsx`**
  Replace the four pill buttons with a button + popover dropdown showing the four priority options with colored dots, matching the design mockup. On mobile the dropdown opens upward (above the trigger button if near the bottom of the sheet).

  **Component tests:** Add/update `TaskSheet` tests in a new file `web-client/src/components/tasks/__tests__/TaskSheet.test.tsx`:
  - Recurrence picker shows/hides Custom fields correctly.
  - Scheduled date and Deadline pickers don't both open simultaneously.
  - Saving with `recurrence_rule` set includes it in the API call.
  - Priority dropdown updates the form state.

### Phase F: Frontend — View Logic

- [x] **F.1 — Update `TodayView.tsx`, `UpcomingView.tsx`, `AllView.tsx`**
  - Rename `due_date` → `scheduled_date` in the `useTasks` params and any direct field accesses.
  - In `TodayView`, update the "Overdue" section heading logic: a task is overdue if `COALESCE(scheduled_date, deadline) < today`.
  - No structural changes to the views needed — the backend handles routing correctly.

- [x] **F.2 — Update `useTasks` hook and task utilities**
  In `web-client/src/hooks/useTasks.ts` (or wherever task date utilities live), rename `due_date` → `scheduled_date` and update any date comparison helpers. If `today()` / date helpers are in a shared utility file, update those references too.

  **Hook tests:** Update `web-client/src/hooks/useTasks.test.ts` to use `scheduled_date` in all mock task fixtures.

### Phase G: End-to-End Tests

- [x] **G.1 — Update existing E2E task tests**
  In `e2e/tests/tasks.spec.ts` and `e2e/tests/tasks-mobile.spec.ts`:
  - Update any fixture tasks that reference `due_date` to use `scheduled_date`.
  - Update the task creation helper if it sets a due date.

- [x] **G.2 — Add E2E tests for recurring tasks**
  In `e2e/tests/tasks.spec.ts`:
  - Test: create a daily recurring task → complete it → verify the task remains visible with `scheduled_date` advanced by 1 day → verify "↻ Rescheduled" toast appears.
  - Test: complete a recurring task → click Undo → verify `scheduled_date` reverts.
  - Test: "Complete forever" via ··· menu → task disappears from active list.
  - Add a `Mobile Chrome` variant in `e2e/tests/tasks-mobile.spec.ts` covering the recurring complete flow.

- [x] **G.3 — Add E2E tests for deadline chip**
  In `e2e/tests/tasks.spec.ts`:
  - Test: create a task with `scheduled_date = today` and `deadline = today + 1` → verify deadline chip appears in orange on the task row.
  - Test: task with only `deadline` set (no `scheduled_date`) → appears in Today view on the deadline date.

  **Manual tests (all phases):**
  - Open the Add Task modal on desktop — verify two-column layout, sidebar fields in correct order (Priority → Scheduled Date → Repeat → Deadline → Tags).
  - Open the Add Task modal on mobile — verify bottom sheet, all fields tappable, inline calendar expands correctly without pushing content off-screen.
  - Create a "Weekly" recurring task → mark complete → confirm the scheduled date jumps to next week and the task stays in Upcoming.
  - Create a task with only a Deadline (no Scheduled Date) → verify it appears in Today on the deadline date.
  - Transition a task to In Progress → verify marching-ants animation in the task's priority color on the row. Verify `started_at` is set (check DB or network response).
  - Create a task with "After completion" anchor → complete it a day late → verify the next date is offset from today, not from the original scheduled date.
