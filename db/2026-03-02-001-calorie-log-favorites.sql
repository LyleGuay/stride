CREATE TABLE "calorie_log_favorites" (
  "id"         SERIAL PRIMARY KEY,
  "user_id"    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "item_name"  TEXT NOT NULL,
  "type"       calorie_log_item_type NOT NULL,
  "qty"        NUMERIC(10,2) DEFAULT 1,
  "uom"        calorie_log_item_uom DEFAULT 'each',
  "calories"   INT NOT NULL,
  "protein_g"  NUMERIC(6,1),
  "carbs_g"    NUMERIC(6,1),
  "fat_g"      NUMERIC(6,1),
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_calorie_log_favorites_user_id
  ON calorie_log_favorites (user_id);
