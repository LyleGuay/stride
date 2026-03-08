CREATE TYPE habit_frequency AS ENUM ('daily', 'weekly');

CREATE TABLE habits (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  emoji         TEXT,
  color         TEXT,
  frequency     habit_frequency NOT NULL DEFAULT 'daily',
  weekly_target INTEGER,                      -- NULL for daily; 1–7 for weekly
  level1_label  TEXT NOT NULL,
  level2_label  TEXT,
  level3_label  TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE habit_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  level      SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, habit_id, date)
);
