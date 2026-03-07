-- Normalize exercise calorie entries to positive values.
-- Convention: calories are always stored as positive integers; the item type
-- determines direction (food adds to net, exercise subtracts). This fixes rows
-- that were inserted as negative before the convention was established.
UPDATE calorie_log_items
SET calories = ABS(calories)
WHERE type = 'exercise' AND calories < 0;
