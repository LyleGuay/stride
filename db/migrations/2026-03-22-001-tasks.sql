CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'medium', 'low');
CREATE TYPE task_status   AS ENUM ('todo', 'in_progress', 'completed', 'canceled');

CREATE TABLE tasks (
  id           SERIAL PRIMARY KEY,
  user_id      INT           NOT NULL REFERENCES users(id),
  name         TEXT          NOT NULL,
  description  TEXT,
  due_date     DATE,
  due_time     TIME WITHOUT TIME ZONE,
  priority     task_priority NOT NULL DEFAULT 'medium',
  status       task_status   NOT NULL DEFAULT 'todo',
  completed_at TIMESTAMPTZ,
  canceled_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
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
