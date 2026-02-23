# Setup & Settings — Profile, Body Metrics, and Goal

## Overview

A one-time setup wizard that collects the data needed to auto-compute a personalized calorie budget (via TDEE), and a persistent settings page where the user can update any of those values later. The calorie budget shown throughout the app is derived from these inputs rather than manually entered — once setup is complete, it recalculates automatically whenever any value changes.

## User Stories

- As a new user, I want to complete a quick setup so the app can compute a personalized calorie budget and weight loss timeline for me.
- As a user, I want to update my weight and goal periodically so the app recalculates my budget as I progress.
- As a user, I want to see exactly how my budget was calculated so I trust it.
- As a user, I want to override the auto-computed budget with a manual value if I prefer.

## References

| App | What it does well | Pattern |
|-----|-------------------|---------|
| MyFitnessPal | Goal-first flow, shows calorie result before asking you to sign up | Multi-step wizard: Goal → Gender → Age → Height → Weight → Goal weight → Pace |
| Lose It! | Big tap-to-select cards for goal/activity, very low friction | Card selection for pace; number pickers for body metrics |
| Cronometer | Shows full TDEE breakdown with formula explanation | Transparent math; expandable "how this is calculated" section |
| Noom | Conversational one-question-per-screen format | High engagement but too long for Stride's scope |
| Calculator.net TDEE | Immediate live recalculation as you change inputs | Settings-page approach: all fields visible, result updates inline |

**Chosen pattern for setup:** 5-step wizard with a progress bar. One focused topic per step. Live budget preview visible in step 4 onward so the user sees the result forming before they finish.

**Chosen pattern for settings:** Single scrollable page with three sections (Body, Activity, Goal) and a "Your Computed Plan" summary card that live-updates as the user edits fields.

---

## TDEE Formula

Uses the **Mifflin-St Jeor equation** (most accurate for general population):

```
BMR (male)   = 10 × weight_kg + 6.25 × height_cm - 5 × age + 5
BMR (female) = 10 × weight_kg + 6.25 × height_cm - 5 × age - 161
```

Activity multiplier — based on **background daily movement only**, not intentional workouts. Users log gym sessions, walks, and treadmill in the calorie log as exercise items. Those subtract from net calories automatically, so keeping the activity level = non-exercise baseline makes the budget accurate day-to-day (a treadmill day earns more calories; a rest day does not).

| Level | Label | Description | Multiplier |
|-------|-------|-------------|-----------|
| sedentary | Sedentary | Desk job or mostly seated. Little movement outside of logged exercise. | 1.2 |
| light | Lightly Active | On your feet some of the day — errands, light walking, standing desk. | 1.375 |
| moderate | Moderately Active | Standing or moving most of the day — retail, service work, active job. | 1.55 |
| active | Very Active | On your feet all day — construction, warehouse, nursing, physical trade. | 1.725 |
| very_active | Extra Active | Intense physical job plus an active lifestyle. Rare. | 1.9 |

```
TDEE = BMR × activity_multiplier
daily_budget = TDEE - (target_lbs_per_week × 500)
```

`target_lbs_per_week` is derived from target weight + target date:
```
target_lbs_per_week = (current_weight - target_weight) / weeks_until_target
```

Cap at 2 lbs/week (medical safety limit). Floor at 0.25 lbs/week if the timeline is very long.

---

## Screens

### Setup Wizard (5 steps)

Entry point: shown automatically after first login if `setup_complete = false`. Also accessible via Settings → "Re-run setup".

---

#### Step 1 — About You

**Purpose:** Units preference and display name confirmation.

**Fields:**
- Display name (text input, pre-filled from account)
- Units: `US` (lbs, ft/in) vs `Metric` (kg, cm) — large toggle buttons

**Notes:** Units choice affects all subsequent inputs and all displays throughout the app.

---

#### Step 2 — Your Body

**Purpose:** Collect the physical measurements needed for BMR.

**Fields:**
- Sex (Male / Female — two large pill buttons; note: used for BMR formula only)
- Age (number input, 18–100)
- Height (ft + in dropdowns for US; cm number input for metric)
- Current weight (number input with unit label)

**Notes:** Use `date_of_birth` in the DB so age stays accurate over time, but show an "Age" number input in the UI (compute DOB from age on submit). Or store age directly — simpler.

---

#### Step 3 — How Active Are You?

**Purpose:** Capture activity level for TDEE multiplier.

**Layout:** 5 stacked cards, tap to select. Each shows:
- Label (e.g. "Lightly Active")
- One-line description (e.g. "Light exercise or sports 1–3 days/week")
- Icon or emoji

**Notes:** This is the most impactful single input for TDEE accuracy. Worth a full dedicated step with clear descriptions to reduce guessing.

---

#### Step 4 — Your Goal

**Purpose:** Collect target weight and target date to compute required pace and budget.

**Fields:**
- Target weight (number input)
- Target date (date picker) — drives the lbs/week computation
- Live computed preview card (updates as user types):
  - Pace: X lbs/week
  - Daily deficit: X cal
  - Estimated daily budget: **X,XXX cal**
- Pace warning if > 2 lbs/week: "That pace is aggressive. Doctors recommend a maximum of 2 lbs/week."

**Secondary:** A pace selector (0.5 / 1 / 1.5 / 2 lbs per week) with "Update target date" link — lets the user pick a pace and have the target date auto-adjust instead.

---

#### Step 5 — Your Plan

**Purpose:** Show the full computed plan before committing. Confirmation screen.

**Layout:**
- Heading: "Here's your personalized plan"
- TDEE breakdown: BMR → × activity → = Maintenance (X,XXX cal)
- Goal: "Lose X lbs by [date] = X lbs/week"
- Daily budget: large bold number
- Timeline visualization: simple horizontal bar from "Today" → "Goal date" with current position marked
- CTA: "Start Stride →"
- Secondary: "Adjust" (goes back to step 4)

---

### Settings Page

Entry point: sidebar nav link "Settings" (to be added to AppShell).

**Layout:** Scrollable page, `max-w-xl` centered. No AppShell sidebar changes needed — just a new route `/settings`.

**Sections:**

1. **Your Computed Plan** — sticky summary card at top (or prominent card, not sticky).
   - Maintenance: X,XXX cal/day
   - Daily budget: X,XXX cal/day
   - Target pace: X lbs/week
   - Expected goal date: [date]
   - Updates live as fields below change, before saving.

2. **Body Metrics**
   - Sex (pill toggle)
   - Age (number input)
   - Height (ft/in or cm)
   - Current weight (number input)

3. **Activity Level** (same 5-card selector as setup step 3)

4. **Goal**
   - Target weight
   - Target date
   - Pace override toggle: "Use custom pace instead" → shows lbs/week input

5. **Budget**
   - Auto-computed toggle (default on)
   - When off: manual daily budget input
   - When on: shows computed value read-only

6. **Units**
   - US / Metric toggle (converts displayed values, not stored values)

**Save button:** Sticky at bottom (or "Save Changes" at end of page). Changes don't apply until saved — except the summary card previews live.

---

## Data

**Extend `calorie_log_user_settings` table with new columns:**

| Column | Type | Notes |
|--------|------|-------|
| `sex` | `varchar(10)` | 'male' or 'female' |
| `age_years` | `int` | Updated by user |
| `height_cm` | `numeric(5,1)` | Always stored in cm; UI converts |
| `weight_lbs` | `numeric(5,1)` | Current weight; always stored in lbs; UI converts |
| `activity_level` | `varchar(20)` | enum: sedentary, light, moderate, active, very_active |
| `target_weight_lbs` | `numeric(5,1)` | |
| `target_date` | `date` | |
| `units` | `varchar(10)` | 'us' or 'metric' |
| `budget_auto` | `boolean` | Default true; false = manual override |
| `setup_complete` | `boolean` | Default false; set to true on wizard completion |

When `budget_auto = true`, the Go API computes `calorie_budget` from these fields at read time (or on save). When false, uses the stored `calorie_budget` directly.

**Migration:** `db/YYYY-MM-DD-001-user-settings-profile.sql`

## Open Questions

- **Sex vs gender:** The BMR formula requires biological sex (male/female). We ask for it for that purpose only. Label it "Biological sex (used for calorie calculation)" to be clear.
- **Weight history:** Should saving a new current weight in settings also log a weight history entry? Yes — this feeds into a future Weight History module (mirrors the spreadsheet sheet 4).
- **Age vs DOB:** Store `date_of_birth` (date). Compute age at query time so it stays accurate without the user re-entering it. Show an age number input in the UI — convert to DOB on save (approximate: `today - age years`).
- **Multiple weight loss goals in the future?** Just one goal for now — simplify.
- **"Prefer not to say" for sex:** If we add it, default to average of male/female BMR formulas? For now, skip — user can pick whichever is closer.
