CREATE TYPE journal_tag AS ENUM (
  -- emotions
  'happy', 'excited', 'motivated', 'energized', 'calm', 'content', 'grateful',
  'neutral', 'bored', 'unmotivated', 'anxious', 'overwhelmed', 'low',
  'sad', 'angry', 'frustrated', 'depressed',
  -- entry types
  'thoughts', 'idea', 'venting', 'open_loop', 'reminder', 'life_update', 'feelings'
);

CREATE TABLE journal_entries (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  entry_time TIMETZ NOT NULL DEFAULT NOW(),
  body       TEXT NOT NULL,
  tags       journal_tag[] NOT NULL DEFAULT '{}',
  habit_id   INTEGER REFERENCES habits(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup for daily timeline view
CREATE INDEX ON journal_entries (user_id, entry_date);

-- GIN index for future tag-based search
CREATE INDEX ON journal_entries USING GIN (tags);
