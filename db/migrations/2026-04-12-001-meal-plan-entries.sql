CREATE TYPE meal_plan_entry_type AS ENUM ('food', 'takeout', 'recipe');

-- Separate from calorie_log_item_type — meal planning never has 'exercise'.
CREATE TYPE meal_plan_meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

CREATE TABLE meal_plan_entries (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id),
  date         DATE NOT NULL,
  meal_type    meal_plan_meal_type NOT NULL,
  entry_type   meal_plan_entry_type NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,

  -- food type fields (also used when instantiated from a favorite)
  item_name    TEXT,
  qty          NUMERIC(10,2),
  uom          calorie_log_item_uom,
  calories     INT,
  protein_g    NUMERIC(6,1),
  carbs_g      NUMERIC(6,1),
  fat_g        NUMERIC(6,1),

  -- recipe type fields (calories/macros snapshotted from recipe × servings at save time)
  recipe_id    INT REFERENCES recipes(id) ON DELETE SET NULL,
  servings     NUMERIC(6,2),

  -- takeout type fields
  takeout_name   TEXT,
  calorie_limit  INT,
  no_snacks      BOOLEAN NOT NULL DEFAULT false,
  no_sides       BOOLEAN NOT NULL DEFAULT false,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX meal_plan_entries_user_date ON meal_plan_entries (user_id, date);
