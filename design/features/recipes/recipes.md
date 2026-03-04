# Recipes

## Overview

The Recipes module lets users create, organize, and execute cooking recipes — with AI assistance for generation and modification. Recipes integrate with the Calorie Log via a "Log from Recipe" action that scales macros to the chosen serving size. A dedicated Execution Mode turns the phone into a hands-free kitchen assistant: one step at a time, live timers that float as you advance, and screen-on. Nutrition is entered at the recipe level (not per-ingredient) with an optional AI auto-calculate from the ingredient list.

## Decisions Made

- **Nutrition**: Recipe-level only (not per-ingredient). AI can auto-calculate from ingredients.
- **Timers**: Tap to start; no auto-start. Timer floats as a pill when you advance steps.
- **Pre/post eliminated**: Every timer step shows instruction text first, timer below. Optional "Meanwhile…" text on a timer step replaces the continuation step type entirely.
- **Step types**: Two types only — **instruction** and **timer** (timer has optional "meanwhile" field).
- **AI actions**: Two distinct modes — **AI Modify** (edits current recipe in place) and **AI Copy** (modifies and saves as new recipe).
- **AI Generate flow**: Prompt → loading → opens recipe detail directly (no preview sheet).
- **Photos**: Skipped for V1.
- **Edit Mode**: Separate view and edit modes. Edit mode shows all editable fields, step management (add/edit/delete/reorder), and AI Modify/Copy.

## User Stories

- As a user, I want to generate a recipe from a text prompt so that I can quickly capture new ideas without manually typing everything.
- As a user, I want to execute a recipe step-by-step with timers so that I don't lose my place while cooking.
- As a user, I want timers to float as I advance steps so that I can keep track of multiple things at once.
- As a user, I want to log a recipe as a calorie entry so that my nutrition tracking reflects home-cooked meals.
- As a user, I want AI to auto-calculate calories and macros from my ingredient list so that I don't have to look up values manually.
- As a user, I want to modify an existing recipe using AI — either editing it or saving a new copy — so that I can iterate on variations.
- As a user, I want a separate edit mode so that I don't accidentally modify a recipe while reading it.

## References

| App | What it does well | Pattern |
|-----|-------------------|---------|
| [Paprika](https://www.paprikaapp.com/) | Cook Mode with screen-on, auto-detected tap-to-start timers that float | Inline timer detection; floating timer badge |
| [Mela](https://mela.recipes/) | Clean distraction-free reader; floating timer pill stays visible across steps | Persistent floating timer |
| [SideChef](https://www.sidechef.com/) | Explicit "Wait" steps — instruction text above, timer button below | Text-first, timer-below layout |
| [KitchenStories](https://www.kitchenstories.com/en) | "Meanwhile" sub-text shown alongside a wait step | Secondary text on timer steps |
| [Whisk](https://whisk.com/) | Clean ingredient scaling, recipe card list | Card grid; inline serving scaler |

---

## Screens

### 1. Recipe List

**Purpose:** Browse all saved recipes; create a new one manually or via AI.

**Layout:**
- Header: "Recipes" title + recipe count
- Action row: [✦ AI Generate] button (primary) + [+] new recipe button
- Search input
- Category filter chips: All · Breakfast · Lunch · Dinner · Dessert · Snack · Other (horizontal scroll)
- Card grid (2-col desktop, 1-col mobile): emoji avatar, name, category badge, cal/serving, step count, estimated time

**Interactions:**
- Tap card → Recipe Detail (view mode)
- Long-press card → context menu: Duplicate, Delete
- Tap [✦ AI Generate] → AI prompt sheet slides up → on submit, loading state → opens new Recipe Detail directly
- Tap [+] → blank Recipe Detail in edit mode

**States:**
- Empty: illustration + "Generate your first recipe" CTA
- Loaded: card grid
- Filtered/searched: live results or "No results"

---

### 2. Recipe Detail — View Mode

**Purpose:** Read a recipe's full content; start cooking or log calories.

**Layout:**
- Sticky header: back button, recipe name, category badge, [Edit] button
- Action bar: [▶ Cook] [🍽 Log Calories]
- Nutrition panel: Calories / P / C / F per serving, serving count display
- Collapsible sections: Notes → Tools → Ingredients → Instructions
- Instructions rendered read-only with step type styling

**Step type rendering (view mode):**
- **Instruction step**: step number badge + instruction text
- **Timer step**: step number badge (amber) + instruction text + timer chip showing duration + "Meanwhile…" block below (if present)

**Interactions:**
- [▶ Cook] → Execution Mode
- [🍽 Log Calories] → Log from Recipe sheet
- [Edit] → switches to Edit Mode

---

### 3. Recipe Detail — Edit Mode

**Purpose:** Make manual edits to any field; manage steps; trigger AI actions.

**Layout:**
- Sticky header: back button (exits edit mode with unsaved-changes guard), recipe name (editable), category selector, [Save] button
- AI action bar: [✦ AI Modify] [✦ AI Copy] buttons
- Nutrition panel: editable fields + [✦ AI Auto-calculate] button
- Sections: Notes (textarea), Tools (add/delete list), Ingredients (inline edit rows), Instructions (step list with edit/delete/reorder)

**Step management:**
- Each step: drag handle (⠿) + step content (inline editable) + delete (🗑) button
- Timer steps additionally show: duration input + "Meanwhile…" textarea
- At the bottom of the step list: [+ Instruction] [⏱ Timer] add buttons
- Drag to reorder

**Interactions:**
- [✦ AI Modify] → AI prompt sheet → AI rewrites the recipe in place; user can undo
- [✦ AI Copy] → AI prompt sheet → AI generates a copy with modifications; user names the copy
- [✦ AI Auto-calculate] → sends ingredient list to AI → fills Calories/P/C/F
- [Save] → persists changes
- Tap any field → editable inline

---

### 4. Execution Mode (Cook Mode)

**Purpose:** Guide step-by-step with timers; keep screen on.

**Layout:**
- Full-screen dark takeover
- Top bar: recipe name + step label + ✕ exit + [≡ Ingredients] button
- Thin progress bar (one segment per step)
- Step type badge (instruction / timer)
- Large readable step text
- Timer panel (timer steps only): instruction text shown first, timer control below
  - Circular countdown ring + MM:SS display
  - [Start Timer] / [Pause] / [Resume] button
  - If timer is running and user advances: timer shrinks to a floating pill in the top bar
- "Meanwhile…" card (when timer step has it): shown below the timer panel
- Bottom: [← Prev] [Next Step →] / [Finish Cooking]

**Timer persistence:**
- When a timer is running and user taps Next, the timer detaches from the step panel and shows as a small floating pill: "⏱ 3:42" in the top bar
- Tapping the pill re-expands the timer inline
- Multiple concurrent timers: pill shows the shortest remaining time; tapping cycles through them

**Interactions:**
- Prev / Next navigate steps
- Tap [Start Timer] → countdown begins; pill appears on advance
- Tap floating pill → expand back to full timer
- [≡ Ingredients] → slide-up sheet with checklist
- Final step → "Finish Cooking" → optional "Log Calories?" prompt → back to detail

---

### 5. Log from Recipe Sheet

**Purpose:** Log a calorie entry from a recipe with serving-based scaling.

**Layout (bottom sheet):**
- Recipe name (read-only)
- Serving size input (number spinner, 0.5 step, default 1)
- Live nutrition preview: Cal / P / C / F auto-scaled
- Meal type selector
- [Save to Log] button

**Interactions:**
- Serving change → macros update live (proportional scaling)
- [Save to Log] → creates `calorie_log_item` with `recipe_id` stored, scaled macros, chosen meal type

---

### 6. AI Generate Sheet

**Purpose:** Generate a new recipe from a text prompt.

**Layout:**
- Bottom sheet: textarea + [Generate] button
- On submit: sheet shows loading state with spinner
- On completion: sheet closes and app navigates directly to the new Recipe Detail in view mode
- If error: error message inline with [Try again]

---

### 7. AI Modify / AI Copy Sheet

**Purpose:** Rewrite or fork the current recipe using AI.

**Layout (bottom sheet):**
- Title: "Modify Recipe" or "Create a Copy"
- Textarea: "Describe the changes…"
- [Modify] / [Create Copy] button
- Loading state with "Rewriting recipe…" / "Creating copy…"
- On Modify success: recipe detail refreshes with new content (undo available for ~10s via toast)
- On Copy success: navigates to the new recipe detail with the copy

---

## Data

### New tables

```sql
-- recipes: top-level recipe record
CREATE TABLE recipes (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'other',  -- breakfast/lunch/dinner/dessert/snack/other
  notes        TEXT,
  servings     NUMERIC(6,2) NOT NULL DEFAULT 1,
  calories     INT,          -- per serving, entered manually or AI-calculated
  protein_g    NUMERIC(6,1),
  carbs_g      NUMERIC(6,1),
  fat_g        NUMERIC(6,1),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- recipe_ingredients: ordered list
CREATE TABLE recipe_ingredients (
  id           SERIAL PRIMARY KEY,
  recipe_id    INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  qty          NUMERIC(10,2),
  uom          TEXT,
  note         TEXT,
  sort_order   INT NOT NULL DEFAULT 0
);

-- recipe_tools: equipment needed
CREATE TABLE recipe_tools (
  id           SERIAL PRIMARY KEY,
  recipe_id    INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0
);

-- recipe_steps: two types — instruction and timer
-- timer steps have timer_seconds; both may have meanwhile_text
CREATE TABLE recipe_steps (
  id              SERIAL PRIMARY KEY,
  recipe_id       INT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('instruction', 'timer')),
  text            TEXT NOT NULL,
  timer_seconds   INT,          -- timer steps only
  meanwhile_text  TEXT,         -- optional: shown below timer, replaces continuation step type
  sort_order      INT NOT NULL DEFAULT 0
);
```

### calorie_log_items addition

```sql
ALTER TABLE calorie_log_items ADD COLUMN recipe_id INT REFERENCES recipes(id);
```

## Open Questions

1. **Undo for AI Modify** — Full undo (store previous state) or just a "revert" that refetches the pre-modify version? A simple approach: store a snapshot of the recipe before AI modify begins, keep it for the session.
2. **Multiple concurrent timers UI** — The floating pill cycling design is simple but may be confusing if 3+ timers are running. Could show a scrollable row of pills instead.
3. **Ingredient "meanwhile" as separate step vs. field on timer step** — Current decision is a field, which simplifies the step model. Trade-off: less flexibility (one "meanwhile" per timer step).
