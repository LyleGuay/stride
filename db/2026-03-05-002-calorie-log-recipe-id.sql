-- Links a calorie log item back to the recipe it was logged from.
-- ON DELETE SET NULL: deleting a recipe nulls this column rather than blocking the delete.
ALTER TABLE calorie_log_items ADD COLUMN recipe_id INT REFERENCES recipes(id) ON DELETE SET NULL;
