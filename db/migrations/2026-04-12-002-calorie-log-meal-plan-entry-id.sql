ALTER TABLE calorie_log_items
  ADD COLUMN meal_plan_entry_id INT REFERENCES meal_plan_entries(id) ON DELETE SET NULL;
