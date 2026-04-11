-- Task date enhancements: scheduled_date vs deadline split, recurrence, started_at.
-- Covers LYL-48 (recurring tasks) and LYL-49 (scheduled date vs deadline).

-- ── 1. Rename due_date → scheduled_date, due_time → scheduled_time ──────────
-- Add new columns, copy existing values, then drop the old ones so the rename
-- is safe and reversible if anything goes wrong mid-migration.
ALTER TABLE tasks ADD COLUMN scheduled_date DATE;
ALTER TABLE tasks ADD COLUMN scheduled_time TIME WITHOUT TIME ZONE;
UPDATE tasks SET scheduled_date = due_date, scheduled_time = due_time;
ALTER TABLE tasks DROP COLUMN due_date;
ALTER TABLE tasks DROP COLUMN due_time;

-- ── 2. New columns ───────────────────────────────────────────────────────────

-- Hard must-be-done-by date. When scheduled_date is NULL, deadline is used as
-- the fallback routing date (COALESCE(scheduled_date, deadline)) for Today/Upcoming.
ALTER TABLE tasks ADD COLUMN deadline DATE;

-- Set automatically on the first transition to in_progress. Never user-editable.
-- Not reset when a task is undone — preserves the original start time.
ALTER TABLE tasks ADD COLUMN started_at TIMESTAMPTZ;

-- Recurrence pattern. NULL = non-recurring.
-- Shape: { frequency, interval, unit, days_of_week, anchor }
ALTER TABLE tasks ADD COLUMN recurrence_rule JSONB;

-- ── 3. task_completions table ────────────────────────────────────────────────
-- Tracks every completion event for all tasks (recurring and one-off).
-- previous_scheduled_date stores the scheduled_date before completion so that
-- undo can restore it precisely on recurring tasks.
CREATE TABLE task_completions (
  id                      SERIAL PRIMARY KEY,
  task_id                 INT         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_scheduled_date DATE
);

-- Primary access pattern: fetch completions for a task, newest first.
CREATE INDEX idx_task_completions_task_id ON task_completions (task_id, completed_at DESC);

-- ── 4. Backfill completions for already-completed tasks ──────────────────────
-- One completion record per existing completed task, using completed_at as the
-- timestamp. previous_scheduled_date left NULL (no prior scheduled_date to restore).
INSERT INTO task_completions (task_id, completed_at)
SELECT id, completed_at
FROM tasks
WHERE status = 'completed' AND completed_at IS NOT NULL;

-- ── 5. Create the scheduled_date equivalent of the old due_date index ───────
-- The old idx_tasks_user_status_due was automatically dropped by PostgreSQL
-- when due_date was dropped above (dependent object removal).
CREATE INDEX idx_tasks_user_status_scheduled ON tasks (user_id, status, scheduled_date);
