CREATE TYPE "calorie_log_item_type" AS ENUM ('breakfast', 'lunch', 'dinner', 'snack', 'exercise');
CREATE TYPE "calorie_log_item_uom" AS ENUM ('each', 'g', 'miles', 'km', 'minutes');

CREATE TABLE "calorie_log_items" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INT NOT NULL REFERENCES users(id),
  "date" DATE NOT NULL,
  "item_name" TEXT NOT NULL,
  "type" calorie_log_item_type NOT NULL,
  "qty" NUMERIC(10,2) DEFAULT 1,
  "uom" calorie_log_item_uom DEFAULT 'each',
  "calories" INT NOT NULL,
  "protein_g" NUMERIC(6,1),
  "carbs_g" NUMERIC(6,1),
  "fat_g" NUMERIC(6,1),
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_calorie_log_items_user_date ON calorie_log_items (user_id, date);

CREATE TABLE "calorie_log_user_settings" (
  "user_id" INT PRIMARY KEY REFERENCES users(id),
  "calorie_budget" INT DEFAULT 2300,
  "protein_target_g" INT DEFAULT 150,
  "carbs_target_g" INT DEFAULT 250,
  "fat_target_g" INT DEFAULT 80,
  "breakfast_budget" INT DEFAULT 400,
  "lunch_budget" INT DEFAULT 400,
  "dinner_budget" INT DEFAULT 1000,
  "snack_budget" INT DEFAULT 600
);
