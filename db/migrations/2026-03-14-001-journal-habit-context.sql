CREATE TYPE journal_entry_source AS ENUM ('habit');

ALTER TABLE journal_entries
  ADD COLUMN source      journal_entry_source,
  ADD COLUMN habit_level SMALLINT CHECK (habit_level IS NULL OR habit_level BETWEEN 0 AND 3);
