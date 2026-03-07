-- calorie_config_history stores historical snapshots of a user's calorie budget
-- and activity level. A record is written whenever either value changes, with
-- valid_until = yesterday (the last date the old config was in effect).
-- To find the config for date D: the first row with valid_until >= D applies.
-- If no such row exists, the current calorie_log_user_settings are used instead.
CREATE TABLE calorie_config_history (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL REFERENCES users(id),
  valid_until    DATE NOT NULL,
  calorie_budget INT NOT NULL,
  activity_level VARCHAR(20),     -- nullable; NULL = inherit from current settings
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, valid_until)
);

CREATE INDEX calorie_config_history_user_date
  ON calorie_config_history (user_id, valid_until);
