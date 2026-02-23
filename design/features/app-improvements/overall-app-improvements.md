# App Improvements — Brainstorm

Three ideas to make the calorie log faster, smarter, and more accurate over time.

---

## 1. Favorites & Quick Picks

### Overview

Users who eat the same foods daily (same breakfast, same post-workout shake, same snacks) have to manually re-enter them every time. A favorites / quick-pick system saves item templates and lets the user re-log a known item in a single tap — no typing, no AI call, no form filling.

### Reference Apps

| App | What it does well | Pattern |
|-----|-------------------|---------|
| MyFitnessPal | "Recently eaten" and "Frequent" tabs in Add Food | Tabbed search results with history |
| Cronometer | Personal food library + autocomplete from past entries | Saved templates, search-first |
| Lose It! | "Frequent foods" one-tap list | Static list of top items |
| Fitbit | "Recently logged" at top of food search | Inline recents before search |

### UX Concepts

#### Concept A — Quick-pick chip row (inline)
When the inline add row opens, a horizontal scrollable chip row appears directly above the input fields, showing 4–6 favorited or most-frequent items for this meal type. Tapping a chip instantly pre-fills all fields and submits — one tap to re-log a known item.

```
┌─────────────────────────────────────────────────────────┐
│  Quick: [Oatmeal 320cal] [Protein bar 220cal] [Coffee 5cal] →  │
├─────────────────────────────────────────────────────────┤
│ [ Item name... ]  [ Qty ] [Unit] [Cal] [P] [C] [F] Add ✕ │
└─────────────────────────────────────────────────────────┘
```

#### Concept B — Name input dropdown
Focusing the name input shows a dropdown with "Favorites" and "Recent" tabs. Selecting an item pre-fills all fields — user can still adjust before submitting. AI suggestion fires normally for unrecognized text once the dropdown is dismissed.

#### Concept C — Persistent "Quick Add" bar
A collapsible panel at the top of the log (above meal groups) showing starred items as large tap tiles. Always visible, fastest access. Collapsed by default until user has at least one favorite.

**Recommended combination: Concept A (chip row) + Concept B (dropdown)**
- Chip row shows when inline add opens — handle the "I know exactly what I want" case
- Dropdown appears on name field focus — handle the "let me search my history" case
- AI fires as fallback for anything not in history

### Favoriting Mechanics

- **Star from context menu:** Long-press / right-click any logged item → context menu → "Add to favorites"
- **Star from hover (desktop):** Star icon appears on hover of any item row
- **Favorite templates** store: item name, qty, uom, calories, macros, meal type
- **Recents** are automatically derived from `calorie_log_items` (most-logged unique item names, last 30 days) — no separate table needed
- Up to 20 explicit favorites; recents fill remaining dropdown slots (capped at 10)

### Data

New table: `calorie_log_favorites`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | |
| `user_id` | int | |
| `item_name` | varchar | |
| `type` | varchar | Meal type (breakfast, lunch, etc.) |
| `qty` | numeric | Default quantity |
| `uom` | varchar | |
| `calories` | int | |
| `protein_g` | int | |
| `carbs_g` | int | |
| `fat_g` | int | |
| `log_count` | int | Incremented each time re-used |
| `last_used_at` | timestamp | |
| `created_at` | timestamp | |

### Open Questions

- Should chips be meal-type-specific? (Only show breakfast items in the Breakfast section.)
- When tapping a chip, should we auto-submit immediately or just pre-fill so user can adjust first?
- Should duplicated items (context menu "Duplicate") contribute to the recents frequency count?
- What if the user always logs the same item but with a different qty? Prompt for qty on chip tap?

---

## 2. Calorie Accuracy Score

### Overview

A persistent gap often exists between what users log and what they actually eat — portion estimates are wrong, small snacks are forgotten, or AI suggestions are systematically off for their body. By comparing the calorie deficit logged to actual measured weight change, we can compute a logging accuracy percentage. This surfaces calibration feedback to the user and optionally auto-corrects AI suggestions upward to compensate.

### The Math

```
Expected weight loss (lbs) = total_calorie_deficit / 3500
Actual weight loss (lbs)   = weight_at_period_start − weight_at_period_end
Accuracy%                  = (actual / expected) × 100
```

- **Accuracy < 100%** → user is under-logging (eating more than they record)
- **Accuracy > 100%** → user may be over-logging, or their TDEE is underestimated
- **Accuracy ≈ 100%** → logging matches reality well

**Example:**
- 30-day calorie deficit logged: 9,000 cal → expected loss: 2.57 lbs
- Actual weighed change: −1.8 lbs
- Accuracy: 70% — "Your entries tend to underestimate by ~30%"

### Minimum Data Requirements

- Rolling 30-day window
- At least 20 days with calorie log entries
- At least 2 weight check-ins (start + end of window, or more)
- If insufficient data: show "Log your weight regularly to unlock accuracy tracking" placeholder

### Where to Show It

1. **Settings page** — "Logging Accuracy" section with the % and a plain-language explanation. Shows trend over past 3 months if data exists.
2. **Weekly summary** — Small secondary indicator next to the weekly deficit: "Accuracy: 72% — may be underestimating"
3. **AI suggestion strip** — If accuracy < 80%, the suggestion row shows a small badge: "Adjusted +18% for your accuracy" indicating the AI suggestion has been corrected upward

### AI Auto-Correction

When accuracy is below a threshold, the suggest endpoint applies a correction multiplier before returning:

```
corrected_calories = ai_estimate × (1 / accuracy_ratio)
```

Example: AI returns 300 cal, user accuracy is 0.75 → corrected = 400 cal. The suggestion strip shows the corrected value with the badge explaining why.

**Toggle in settings:** "Auto-correct AI suggestions based on my accuracy" — on by default once enough data exists.

### Data

New table: `weight_log`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial | |
| `user_id` | int | |
| `date` | date | |
| `weight_lbs` | numeric(5,1) | Always stored in lbs |
| `created_at` | timestamp | |

Accuracy is computed at read time from `weight_log` + `calorie_log_items` — nothing pre-computed to keep stale.

A "Log today's weight" shortcut lives on the daily view header (or the summary panel). This keeps the friction very low — one tap + one number.

### Open Questions

- Is 30 days the right window? Shorter = noisier signal; longer = less current.
- Should we show a confidence range rather than a single %? ("~70–85% accurate")
- Water retention, hormonal cycles, and TDEE estimation errors all add noise. How do we communicate uncertainty without confusing users?
- Should accuracy tracking be opt-in (requires understanding) or opt-out (on by default, user can disable)?
- Combined food + exercise accuracy, or food-only? Logging both affects the deficit calculation.

---

## 3. Exercise AI with User Profile

### Overview

Extends the food AI suggestion feature to handle exercise entries. When a user types a natural-language exercise description in the Exercise section, the AI estimates calories burned using their physical stats (weight, height, age, sex) for a personalized result — not a generic average. The same debounce + suggestion-row UX as the food feature, but returning a calorie burn estimate instead of macros.

### Examples

| User input | Profile used | Estimated output |
|-----------|-------------|-----------------|
| "Walked 1.5 miles, 30 min" | 185 lbs, 5'11", 32M | ~130 cal |
| "30 min treadmill, moderate pace" | same | ~250 cal |
| "45 min weight training" | same | ~200 cal |
| "10,000 steps" | same | ~380 cal |
| "1 hour yoga" | same | ~150 cal |
| "20 min HIIT" | same | ~220 cal |

### UX

Identical to the food suggestion flow — debounce → suggestion row below inline add → Apply fills fields — with these differences:

- **Fires only in the Exercise section's inline add row** (and in the bottom sheet when type = Exercise)
- Suggestion shows: `[Activity name] · [duration] · [~X cal burned]` — no macros row
- Calories fill in as a positive integer (exercise items are stored as positive and subtracted from net by the backend, same as current behavior)
- If user profile is incomplete (no weight/height in settings), show a soft prompt: "Complete your profile for personalized estimates"

```
Inline add — exercise section:

[ 30 min treadmill moderate ]  [ 1 ] [Minutes] [  Cal ] [Add] [✕]

┌────────────────────────────────────────────────────────────┐
│  ✦  Treadmill (Moderate)  ·  30 min  ·  ~248 cal burned   [Apply] [✕]  │
└────────────────────────────────────────────────────────────┘
```

### API

Separate endpoint from food suggestions for clarity:

**`POST /api/calorie-log/suggest-exercise`**

Request:
```json
{
  "description": "Walked 1.5 miles for 30 minutes",
  "weight_lbs": 185,
  "height_cm": 180,
  "age_years": 32,
  "sex": "male"
}
```

Success response:
```json
{
  "activity_name": "Walking",
  "duration_minutes": 30,
  "distance": "1.5 miles",
  "calories_burned": 130
}
```

Unrecognized:
```json
{ "error": "unrecognized" }
```

**Prompt strategy:**

System: *"You are a fitness assistant. Estimate calories burned for the described activity using MET-based formulas and the user's physical stats. Return JSON with: `activity_name` (string, title case), `duration_minutes` (integer or null), `distance` (string or null, e.g. '1.5 miles'), `calories_burned` (integer). If you cannot confidently estimate, return `{ \"error\": \"unrecognized\" }`. Return only valid JSON, no explanation."*

User stats are injected into the system prompt: "User stats: weight=185lbs, height=180cm, age=32, sex=male."

### Interaction with Accuracy Score (Feature 2)

If the user has an accuracy score from feature 2, the exercise AI can factor that in too. For example, if the user's net accuracy is 70%, exercise calories might be slightly over-estimated (to partially compensate). This is speculative — would need data to validate whether it helps.

### Data

No new tables. User profile data comes from `calorie_log_user_settings` (already stores `weight_lbs`, `height_cm`, `age_years`, `sex` after setup). Suggestion is stateless.

### Open Questions

- What if the user hasn't completed setup? Fall back to a generic 150 lbs / average stats, or show a prompt to complete profile first?
- Should we cache exercise suggestions? "30 min walk" at the same weight always returns the same result — a simple in-memory cache on the Go side would work.
- Should the AI parse out `duration_minutes` and fill the `qty` field as well? (e.g., "30 min treadmill" → qty=30, uom=minutes, calories=250). This would be extra helpful but requires mapping the AI's output to the qty/uom fields.
- Wearable integration (Fitbit, Apple Health) would make this much more accurate. File under "future iteration."
