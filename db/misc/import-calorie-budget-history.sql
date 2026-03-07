-- One-time import of historical calorie budget periods from the legacy spreadsheet.
-- Source: docs/legacy-calorie-log-data/Calorie Log - Day Summaries.csv
-- Run once: psql $DB_URL -f go-api/db/seed/import-calorie-budget-history.sql
--
-- Algorithm:
--   1. Group CSV rows by ISO week (Mon–Sun).
--   2. Average the calorie_budget across all days in the week, round to nearest 100.
--   3. Emit one record per week-to-week budget change, with valid_until = Sunday
--      before the new week (last day the old budget applied).
--   4. Weeks with the same rounded budget as the current settings (2300) at the
--      end of the dataset are omitted — current settings cover those dates.
--
-- activity_level is NULL — configForDate inherits it from current settings.
-- Assumes user_id = 1. Adjust if needed.

INSERT INTO calorie_config_history (user_id, valid_until, calorie_budget, activity_level)
VALUES
  (3, '2024-02-25', 2400, NULL),
  (3, '2024-03-31', 2500, NULL),
  (3, '2024-05-05', 2300, NULL),
  (3, '2024-05-12', 2200, NULL),
  (3, '2024-07-14', 2100, NULL),
  (3, '2024-07-21', 2300, NULL),
  (3, '2024-07-28', 2400, NULL),
  (3, '2024-08-04', 2700, NULL),
  (3, '2024-08-11', 2500, NULL),
  (3, '2024-10-27', 2400, NULL),
  (3, '2024-11-24', 2500, NULL),
  (3, '2025-01-12', 2400, NULL),
  (3, '2025-01-19', 2300, NULL),
  (3, '2025-03-09', 2400, NULL),
  (3, '2025-05-25', 2300, NULL),
  (3, '2025-08-17', 2200, NULL),
  (3, '2025-10-19', 2300, NULL),
  (3, '2025-10-26', 2200, NULL),
  (3, '2025-11-09', 2100, NULL),
  (3, '2025-11-16', 2300, NULL),
  (3, '2025-12-14', 2500, NULL)
ON CONFLICT (user_id, valid_until) DO NOTHING;
