# Tasks Module

## Goal

Build a full personal task manager into Stride, replacing Todoist. The module covers a `tasks` + `task_tags` database schema, a Go CRUD API, and a React frontend with three tab views (Today, Upcoming, All), a bottom-sheet Add/Edit form with an inline date/time picker, status interactions (single-tap → completed, long-press → status dropdown), an undo toast, and an overdue badge in the sidebar nav. Includes the "overdue age" UX detail (show "3 days overdue" instead of just red text).

---

## Timezone

Due dates are **calendar dates, not timestamps**. All server-side "is this today / overdue?" comparisons use a `?today=YYYY-MM-DD` query param sent by the client — never `NOW()::date`. This matches the existing calorie-log and habits pattern. `due_time` is stored as `time without time zone` and treated as local clock time; no conversion is needed.

---

## Phases

### Phase A: Database Migration

- [x] **A.1 — Migration: `task_priority`, `task_status` enums + `tasks` + `task_tags` tables**
  Create `db/migrations/2026-03-22-001-tasks.sql` (project root, not inside `go-api/`) with the following SQL:

  ```sql
  CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'medium', 'low');
  CREATE TYPE task_status   AS ENUM ('todo', 'in_progress', 'completed', 'canceled');

  CREATE TABLE tasks (
    id           SERIAL PRIMARY KEY,
    user_id      INT         NOT NULL REFERENCES users(id),
    name         TEXT        NOT NULL,
    description  TEXT,
    due_date     DATE,
    due_time     TIME WITHOUT TIME ZONE,
    priority     task_priority NOT NULL DEFAULT 'medium',
    status       task_status   NOT NULL DEFAULT 'todo',
    completed_at TIMESTAMPTZ,
    canceled_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Index for the primary query pattern: user's tasks filtered by status/due_date.
  -- The compound index covers most listTasks queries without a full table scan.
  CREATE INDEX idx_tasks_user_status_due ON tasks (user_id, status, due_date);

  CREATE TABLE task_tags (
    task_id INT  NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag     TEXT NOT NULL,
    PRIMARY KEY (task_id, tag)
  );

  -- Index on tag alone for searching tasks by tag name.
  -- The PK already covers task_id lookups, so only tag needs a separate index.
  CREATE INDEX idx_task_tags_tag ON task_tags (tag);
  ```

  Tags live in a separate table (not an array column) so they are independently queryable, deletable, and searchable — unlike journal tags which are not queried individually.

  Run via: `go run ./cmd/migrate` in `go-api/`.
  - **Manual tests:** Verify `\d tasks` and `\d task_tags` look correct in psql after running migrate.

---

### Phase B: Go API — Models, Handlers, Routes

- [x] **B.1 — Add task structs to `go-api/models.go`**
  Add:
  - `task` — maps to `tasks` table. `Tags []string db:"tags"` is a computed column (see handler note below). `DueTime *string db:"due_time"` scans the `time` column as a nullable string ("HH:MM").
  - `createTaskRequest` — `Name` (required), `Description *string`, `DueDate *string` (YYYY-MM-DD), `DueTime *string` (HH:MM), `Priority string`, `Tags []string`
  - `updateTaskRequest` — all fields as pointers (nil = don't update); `Tags *[]string` (non-nil = full replace)

- [x] **B.2 — Create `go-api/tasks.go` with all handlers**
  Implement the following. Tag query pattern: fetch tags in bulk via a single `SELECT task_id, tag FROM task_tags WHERE task_id = ANY(@ids)` query and join in Go — avoids N+1. Alternatively, use a subquery `ARRAY(SELECT tag FROM task_tags WHERE task_id = t.id ORDER BY tag) AS tags` in the main task query if pgx can scan it; use whichever is cleaner.

  **`listTasks`** — `GET /api/tasks`
  Query params:
  - `today=YYYY-MM-DD` (client's local date — never use NOW() for date comparisons)
  - `view=today|upcoming|all|backlog|completed|canceled` (default: `today`)
  - `search=` (optional; searches name, description, and tags — applied server-side across all views)
  - `limit=N` (default: 25)
  - `offset=N` (default: 0)

  Response shape: `{ "tasks": [...], "has_more": bool }`. `has_more` is true when the number of returned rows equals `limit` — signals the client to offer another page.

  View logic:
  - `today`: `due_date <= @today AND status IN ('todo','in_progress')` — overdue + today tasks
  - `upcoming`: `due_date > @today AND due_date <= (@today::date + 7) AND status IN ('todo','in_progress')`
  - `all`: `status IN ('todo','in_progress')` — all active tasks regardless of due date
  - `backlog`: `status IN ('todo','in_progress') AND due_date IS NULL`
  - `completed`: `status = 'completed'`, ORDER BY `completed_at DESC`
  - `canceled`: `status = 'canceled'`, ORDER BY `canceled_at DESC`

  Sort for active views (`today`, `upcoming`, `all`, `backlog`): `due_date ASC NULLS LAST`, then `created_at ASC`, then `id ASC` (stable tiebreak for consistent pagination).

  Search filter (when `search` is non-empty): append to any view's WHERE clause:
  ```sql
  AND (
    name ILIKE '%' || @search || '%'
    OR description ILIKE '%' || @search || '%'
    OR EXISTS (SELECT 1 FROM task_tags WHERE task_id = t.id AND tag ILIKE '%' || @search || '%')
  )
  ```

  **`getOverdueCount`** — `GET /api/tasks/overdue-count`
  Returns `{"count": N}`. Query: `status IN ('todo','in_progress') AND due_date < @today`. Uses `?today=YYYY-MM-DD`.

  **`createTask`** — `POST /api/tasks`
  Insert into `tasks`, then insert any tags into `task_tags`. Return the full task with tags.

  **`getTask`** — `GET /api/tasks/:id`
  Returns single task with tags. Used by edit sheet to pre-populate.

  **`updateTask`** — `PATCH /api/tasks/:id`
  Dynamic SET clause (only non-nil fields). If `status` changes to `completed`, set `completed_at = NOW()`, clear `canceled_at`. If `status` changes to `canceled`, set `canceled_at = NOW()`, clear `completed_at`. If `status` changes back to `todo`/`in_progress`, clear both timestamps. If `Tags` is non-nil, full-replace: `DELETE FROM task_tags WHERE task_id = @id`, then re-insert.

  **`deleteTask`** — `DELETE /api/tasks/:id`
  Hard delete. `task_tags` rows are removed by CASCADE.

  - **Unit tests:** No pure functions to extract in this file. Skip Go unit tests for this handler — the logic is SQL-driven. Integration tests would require a test DB which is out of scope for v1.

- [x] **B.3 — Register task routes in `go-api/handler.go`**
  In `registerRoutes`, add to the authenticated group:
  ```
  // Task routes — overdue-count must be registered before /:id to avoid param capture
  api.GET("/tasks/overdue-count", h.getOverdueCount)
  api.GET("/tasks", h.listTasks)
  api.POST("/tasks", h.createTask)
  api.GET("/tasks/:id", h.getTask)
  api.PATCH("/tasks/:id", h.updateTask)
  api.DELETE("/tasks/:id", h.deleteTask)
  ```
  - **Manual tests:** `curl` each endpoint with a Bearer token and verify correct responses. Check that overdue-count returns 0 when no tasks exist.

---

### Phase C: Frontend Infrastructure

- [x] **C.1 — Add Task types to `packages/shared/src/types.ts`**
  Add:
  - `Task` interface — mirrors the Go `task` struct. Includes `tags: string[]`, `due_date: string | null`, `due_time: string | null`, `completed_at: string | null`, `canceled_at: string | null`.
  - `TaskListResponse` — `{ tasks: Task[], has_more: boolean }`
  - `CreateTaskInput` — matches `createTaskRequest`
  - `UpdateTaskInput` — all fields optional

- [x] **C.2 — Add task API functions to `web-client/src/api.ts`**
  Add:
  - `fetchTasks(params: { view: string; today: string; search?: string; limit?: number; offset?: number }): Promise<TaskListResponse>`
  - `fetchOverdueTaskCount(today: string): Promise<{ count: number }>`
  - `createTask(input: CreateTaskInput): Promise<Task>`
  - `fetchTask(id: number): Promise<Task>`
  - `updateTask(id: number, input: UpdateTaskInput): Promise<Task>`
  - `deleteTask(id: number): Promise<void>`

- [x] **C.3 — Create `web-client/src/hooks/useTasks.ts`**
  Supports infinite scroll pagination. Signature: `useTasks(params: { view: string; today: string; search?: string })`.

  Returns:
  - `tasks: Task[]` — accumulated across all loaded pages
  - `loading: boolean` — true only on the initial fetch (first page)
  - `loadingMore: boolean` — true when fetching subsequent pages
  - `hasMore: boolean` — whether there are more pages to load
  - `error: string | null`
  - `loadMore(): void` — fetches the next page and appends to `tasks`
  - `reload(): void` — resets to page 0 and re-fetches

  When `view` or `search` changes, reset `tasks`, `offset`, and `hasMore`, then fetch from offset 0.

  Page size: 25 (constant). Each `loadMore` call increments offset by 25 and appends the returned tasks.

  - **Vitest tests:** Create `web-client/src/hooks/useTasks.test.ts`. Use `msw` to mock `GET /api/tasks`. Test: initial load populates tasks; `loadMore` appends next page; `has_more: false` sets `hasMore` to false; view change resets and re-fetches.

- [x] **C.4 — Create reusable `Toast` component at `web-client/src/components/Toast.tsx`**
  A fixed bottom-center banner (z-50, above FAB). Props: `message: string`, `action?: { label: string; onClick: () => void }`, `duration?: number` (default 4000ms), `onClose: () => void`. Auto-dismisses after `duration`. Used by the undo flow in task status changes; designed to be reused across modules (e.g., future habit undo). No library — simple controlled component.
  - **Manual tests:** Verify it appears, auto-dismisses, and the action button fires correctly.

---

### Phase D: Page Scaffold, Routing, Nav

- [x] **D.1 — Create `web-client/src/pages/TasksPage.tsx`**
  Tab state: `today | upcoming | all` (default: `today`). Use `MobileModuleHeader` for mobile (hamburger + tab dropdown, matching `HabitsPage` pattern). Desktop: sticky header with underline tabs (Today | Upcoming | All). FAB (stride-indigo) opens Add Task sheet. Renders `TodayView`, `UpcomingView`, or `AllView` based on active tab — stub these as empty placeholders for now.

- [x] **D.2 — Add `/tasks` route to `web-client/src/router.tsx`**
  Import `TasksPage` and add `<Route path="tasks" element={<TasksPage />} />` inside the authenticated group, alongside the other module routes.

- [x] **D.3 — Add Tasks nav link + overdue badge to `web-client/src/components/AppShell.tsx`**
  Add a `NavLink` to `/tasks` with a checklist/list icon (matching the mockup's `M8.25 6.75h12...` path SVG). Show a red badge (`bg-red-500 text-white text-[10px]`) with the overdue count when count > 0. Fetch the count with a `useEffect` that calls `fetchOverdueTaskCount(todayString())` on mount and after any navigation (re-run when `location.pathname` changes via `useLocation`). Refetch is also triggered by a callback prop passed down to TasksPage so mutations can invalidate it — see Phase J.
  - **Manual tests:** Navigate to /tasks, verify nav item is highlighted. Create an overdue task (due yesterday), verify badge shows "1". Complete it, verify badge disappears.

---

### Phase E: TaskRow Component

- [x] **E.1 — Create `web-client/src/components/tasks/TaskRow.tsx`**
  The core visual unit rendered in all three views.

  **Anatomy (left → right):**
  - **Priority border** — 4px left edge: `urgent=bg-red-500`, `high=bg-orange-400`, `medium=bg-indigo-500`, `low=bg-gray-300`. Same pattern as meal-type borders in the Calorie Log.
  - **Status circle** — 20px circle button:
    - `todo`: white fill, priority-colored border
    - `in_progress`: conic-gradient half-filled indigo (CSS: `background: conic-gradient(#6366f1 180deg, transparent 180deg); border-color: #6366f1`)
    - `completed`: filled green with checkmark SVG
    - `canceled`: gray fill with × mark
    - Single tap → calls `onStatusChange('completed')`. Long-press and hover behavior added in Phase J.
  - **Task name** — `text-sm font-medium`. Strikethrough + `text-gray-400` on completed/canceled.
  - **Due date chip** — right-aligned. Display logic (all client-side, using `today` prop):
    - Overdue: show days overdue — e.g., `"3 days overdue"` (red text). Compute `Math.floor((today - dueDate) / 86400000)`. Show "1 day overdue" for 1 day.
    - Due today: `"Today"` (amber text). If `due_time` is set: `"Today · 2:00 PM"`.
    - Future: `"Mar 25"` (gray). If `due_time` is set: `"Mar 25 · 10:00 AM"`.
    - No due date: hidden.
  - **Tags** — second line, small gray pills.
  - **Description preview** — second line, single truncated line in `text-gray-400` if description exists.
  - **··· menu** — `opacity-0 group-hover:opacity-100` on desktop, always visible on mobile (use `sm:opacity-0 sm:group-hover:opacity-100`). Opens a small dropdown: Edit | Delete.

  Props: `task: Task`, `today: string`, `onStatusChange: (id: number, status: string) => void`, `onEdit: (task: Task) => void`, `onDelete: (id: number) => void`.

  - **Vitest component tests:** Create `web-client/src/components/tasks/__tests__/TaskRow.test.tsx`. Test:
    - Overdue age display: 0 days = "Today", 1 day = "1 day overdue", 3 days = "3 days overdue"
    - Priority border color class applied correctly for each priority
    - Done task has strikethrough on name
    - Canceled task has strikethrough + lighter gray
    - Tags render as pills

---

### Phase F: Today View

- [x] **F.1 — Create `web-client/src/components/tasks/TodayView.tsx`**
  Receives `tasks: Task[]` and `today: string` as props (fetched by `TasksPage` using `useTasks({ view: 'today', today })`).

  **Groups:**
  1. **Overdue** — tasks where `due_date < today`, sorted by `due_date ASC`. Show a red count badge next to the section label: `"Overdue (2)"`. If empty, omit the section.
  2. **Today** — tasks where `due_date === today`, sorted by priority order (`urgent` first) then `created_at`.
  3. **Completed / Canceled** — collapsed by default. `"Show X completed"` toggle button. Shows completed and canceled tasks (re-fetch with status filter or filter client-side from a separate fetch). On expand, shows tasks with completed/canceled styling.

  **Empty state:** If both Overdue and Today are empty, render centered `"You're all caught up."` with a checkmark icon.

  - **Manual tests:** Add a task due today → appears in Today group. Add a task due yesterday → appears in Overdue group with "1 day overdue". Complete a task → moves to completed section (undo toast appears). All caught up state shows when no active tasks.

---

### Phase G: Upcoming View

- [x] **G.1 — Create `web-client/src/components/tasks/UpcomingView.tsx`**
  Receives `tasks: Task[]` from `useTasks({ view: 'upcoming', today })`.

  Group tasks by `due_date`. For each date:
  - Label: `"Tomorrow"` if date = today+1, otherwise weekday name + date (`"Wednesday, Mar 25"`).
  - Render `TaskRow` for each task in the group.

  Sort tasks within each day: by `due_time ASC NULLS LAST`, then `created_at ASC`.

  **Empty state:** `"Nothing scheduled in the next 7 days."` centered.

  - **Manual tests:** Add tasks with due dates across the next week. Verify they group correctly by day. Verify "Tomorrow" label appears for tomorrow.

---

### Phase H: All View

- [x] **H.1 — Create `web-client/src/components/tasks/AllView.tsx`**
  Filter pill state: `all | backlog | completed | canceled` (default: `all`).

  **All** filter: tasks with status `todo | in_progress` (regardless of due date), grouped by priority (`urgent → high → medium → low`). Each priority group has a header label. Within group: sorted by `due_date ASC NULLS LAST`, then `created_at ASC`.

  **Backlog** filter: tasks with status `todo | in_progress` AND `due_date IS NULL`, same priority grouping. Each row has a **Schedule** button (calendar icon) on the right that opens the edit sheet pre-focused on the due date field.

  **Completed** filter: tasks with status `completed`, sorted by `completed_at DESC`. No grouping.

  **Canceled** filter: canceled tasks sorted by `canceled_at DESC`. No grouping.

  **Search bar** (visible on all filters): controlled text input, debounced ~300ms. Passed to `useTasks` as `search` param — filtering is server-side (name + tags + description ILIKE). Positioned above the task list, below the filter pills. Clears when switching filters.

  Each filter maps directly to a `view` param: `all` → `view=all`, `backlog` → `view=backlog`, `completed` → `view=completed`, `canceled` → `view=canceled`. Infinite scroll applies to all filters — when the user scrolls near the bottom, call `loadMore()`.

  - **Manual tests:** Create tasks with various priorities, due dates, and no due date. Verify grouping in All filter. Add task to Backlog, verify Schedule button opens sheet with date field focused. Search filters correctly in real time.

---

### Phase I: Add / Edit Task Sheet

- [x] **I.1 — Create `web-client/src/components/tasks/TaskSheet.tsx`**
  Used for both create (FAB) and edit (tapping a task row body or ··· → Edit).

  **Layout:**
  - Mobile: bottom sheet (slides up, `rounded-t-2xl`, drag handle)
  - Desktop (`lg:`): centered modal (`max-w-lg`, `rounded-2xl`, backdrop)
  - Matching pattern of existing `AddHabitSheet.tsx` and `AddItemSheet.tsx`

  **Fields:**
  1. **Name** — large text input, autofocus on open
  2. **Description** — collapsible markdown editor (same component used in Journal entries); show "Add notes…" placeholder; toggle visibility with a chevron. Rendered as formatted markdown when displayed in the task row preview (single truncated line, stripped of markdown syntax for the preview).
  3. **Due Date row** — two inline buttons side by side:
     - *Date button*: shows selected date or "No date". Click opens inline calendar panel below (not a separate overlay):
       - Month navigator (← Month Year →)
       - 7-column day grid with `today` highlighted, selected date filled indigo
       - Quick shortcuts: Today | Tomorrow | Next week | No date
       - At bottom: **Time row** — "Add time" label + `<input type="time">` + clear ×
     - *Time button*: shows "HH:MM AM/PM" or "Add time". Click scrolls calendar panel to time row.
     - Removing date clears time too.
  4. **Priority** — four pill buttons (single-select): Emergency | High | Medium | Low. Color-coded: red, orange, indigo, gray. Default: Medium.
  5. **Status** (edit mode only) — four option buttons matching the status dropdown: ○ Todo | ◑ In Progress | ✓ Done | × Canceled
  6. **Tags** — freeform chip input. Press Enter or comma to add a tag. Display existing tags as removable chips (×). Placeholder: "Add tags…"
  7. **Footer** — Cancel | Save buttons

  Props: `task?: Task` (null = create mode), `open: boolean`, `onClose: () => void`, `onSave: (task: Task) => void`, `initialFocusDueDate?: boolean` (for Backlog Schedule button).

  On save: call `createTask` or `updateTask`, then call `onSave` with the returned task and close.

  - **Manual tests:**
    - Open via FAB: sheet slides up (mobile), modal appears (desktop). Name autofocuses.
    - Select "Today" shortcut: date button shows today's date.
    - Add a time: time button updates. Clear time: reverts to date-only.
    - Add tag via Enter key and via comma. Remove tag via ×.
    - Save creates task — appears in Today view.
    - Edit a task: all fields pre-populated correctly.
    - Status field only visible in edit mode.
    - Manually verify on Android (physical Pixel): sheet slides from bottom, keyboard raises sheet, tag input works with mobile keyboard.

---

### Phase J: Status Interactions + Undo Toast

- [x] **J.1 — Add long-press / hover status dropdown to `TaskRow`**
  Update `web-client/src/components/tasks/TaskRow.tsx` to support a status popover anchored to the status circle.

  **Trigger:**
  - Desktop: hover on status circle for 400ms (via `onMouseEnter` + `setTimeout`) shows popover with all 4 options
  - Mobile: `onContextMenu` or long-press (`onPointerDown` + 500ms timeout cleared by `onPointerUp`) opens popover

  **Popover content:** 4 buttons — `○ Todo`, `◑ In Progress`, `✓ Done`, `× Canceled`. Clicking sets status immediately and closes. Current status is highlighted. Popover is a small `absolute` positioned card with `z-50`, closed by a click-away div (same pattern as `ProfileDropdown.tsx`).

  - **Manual tests:** On desktop: hover status circle, dropdown appears. Click "In Progress" — circle updates to half-filled indigo. On Android: long-press status circle, dropdown appears. Tap "Canceled" — task goes gray/strikethrough.

- [x] **J.2 — Wire undo toast to status changes in `TasksPage.tsx`**
  When a task's status changes to `completed` or `canceled` (via single-tap or dropdown), capture the previous status. Show the `Toast` component: `"Task completed"` or `"Task canceled"` with an **Undo** button. On undo: call `updateTask(id, { status: previousStatus })` and reload the task list. Toast auto-dismisses after 5 seconds.

  After toast dismisses (no undo), the task disappears from the active list — this is already handled by the reload triggered by the status change.

  Re-expose an `onTaskMutation` callback to `AppShell` (or use a custom event / context) so the overdue badge count refetches after any status change. The simplest approach: pass a `reloadOverdueCount` callback from `AppShell` down via context or as a prop to TasksPage, and call it after any mutation.

  - **Manual tests:** Complete a task → toast appears with Undo. Wait 5s → task gone, toast dismissed. Complete a task → tap Undo within 5s → task reappears with original status.

---

### Phase K: E2E Tests

- [x] **K.1 — Playwright E2E for core task flows**
  Create `e2e/tests/tasks.spec.ts` and `e2e/tests/tasks-mobile.spec.ts`.

  **Desktop flows (`tasks.spec.ts`):**
  - Navigate to /tasks — Today tab is default
  - Click FAB → sheet opens → fill name "Buy groceries", set due date to today, set priority High → Save → task appears in Today group
  - Click status circle → task marked done, toast appears → Undo → task back to active
  - Let toast expire → task gone from Today list
  - Navigate to Upcoming tab → empty state shown
  - Navigate to All tab → task appears in All filter after undoing

  **Mobile Chrome flows (`tasks-mobile.spec.ts`):**
  - Add `{ name: 'Mobile Chrome', use: { ...devices['Pixel 7'] } }` to `e2e/playwright.config.ts` if not already present
  - Verify FAB visible on mobile, sheet slides up from bottom
  - Verify task row shows ··· menu (always visible on mobile, not hover-gated)

---

## Implementation Notes

**1. `due_time` scanning in Go — resolved**
The journal module already solves this. Store `due_time` as `TIME WITHOUT TIME ZONE` in PostgreSQL. In SELECT queries, format it with `TO_CHAR(due_time, 'HH24:MI') AS due_time` so pgx scans it into a `string` / `*string` in Go. The same pattern is used for `entry_time` in `go-api/journal.go`. When `due_time` is NULL, use `NULLIF` or a left join pattern so the field scans as a nil pointer. Tags scanning as `[]string` is also already proven in the journal.

**2. Completed/Canceled section in Upcoming view — resolved**
Not needed. Upcoming only shows active tasks.

**3. Overdue badge refresh — resolved**
Update the badge optimistically on local mutations (same as we do for all data — don't wait for a round-trip). Also refetch on page load. Use a `TaskMutationContext` (similar to `SidebarContext`) so `TasksPage` can signal mutations to `AppShell`'s badge counter without prop-drilling through `<Outlet />`. The tab badge (Today/Upcoming/All) should also update in-page when a task is completed.

**4. Search scope — resolved**
Search in the All tab searches **name + tags + description** (case-insensitive). Apply client-side across the already-fetched task list.

**5. All filter includes Backlog tasks — resolved**
Yes. "All" shows all active tasks regardless of due date. Backlog is a filtered subset of the same list (no due date only).
