CREATE TYPE "recipe_category" AS ENUM ('breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'other');

CREATE TABLE recipes (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  emoji        TEXT,
  category     recipe_category NOT NULL DEFAULT 'other',
  notes        TEXT,
  servings     NUMERIC(6,2) NOT NULL DEFAULT 1,
  calories     INT,
  protein_g    NUMERIC(6,1),
  carbs_g      NUMERIC(6,1),
  fat_g        NUMERIC(6,1),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE recipe_ingredients (
  id         SERIAL PRIMARY KEY,
  recipe_id  INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  qty        NUMERIC(10,2),
  uom        TEXT,
  note       TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE recipe_tools (
  id         SERIAL PRIMARY KEY,
  recipe_id  INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

-- Two step types: instruction (text only) and timer (has timer_seconds).
-- meanwhile_text is an optional note shown while the timer runs.
CREATE TABLE recipe_steps (
  id             SERIAL PRIMARY KEY,
  recipe_id      INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('instruction', 'timer')),
  text           TEXT NOT NULL,
  timer_seconds  INT,
  meanwhile_text TEXT,
  sort_order     INT NOT NULL DEFAULT 0
);
