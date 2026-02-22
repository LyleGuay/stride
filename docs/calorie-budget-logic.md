# Calorie Budget Logic

How Stride computes a personalized daily calorie budget, and how exercise fits in.

---

## BMR — Basal Metabolic Rate

Stride uses the **Mifflin-St Jeor** formula to estimate BMR (calories burned at complete rest):

| Sex    | Formula |
|--------|---------|
| Male   | `10 × weight_kg + 6.25 × height_cm − 5 × age + 5` |
| Female | `10 × weight_kg + 6.25 × height_cm − 5 × age − 161` |

**Example:** 32-year-old male, 5'10" (177.8 cm), 230 lbs (104.3 kg)
```
BMR = 10×104.3 + 6.25×177.8 − 5×32 + 5 ≈ 2,000 cal/day
```

---

## TDEE — Total Daily Energy Expenditure

BMR is multiplied by an activity factor to get TDEE, which estimates total daily calorie burn including day-to-day movement (walking, standing, errands, etc.).

| Activity Level  | Multiplier | Description |
|-----------------|-----------|-------------|
| Sedentary       | ×1.2      | Desk job, little movement outside logged exercise |
| Lightly Active  | ×1.375    | On your feet some of the day — errands, light walking |
| Moderately Active | ×1.55   | Standing or moving most of the day |
| Very Active     | ×1.725    | On your feet all day — physical trade, nursing, etc. |
| Extra Active    | ×1.9      | Intense physical job + active lifestyle |

**Example (sedentary):** 2,000 × 1.2 = **2,400 cal TDEE**

> **Important:** These multipliers are intended to capture *non-exercise* daily movement (known as NEAT — Non-Exercise Activity Thermogenesis), not deliberate workout sessions. See the [Exercise section](#exercise-and-double-counting) below.

---

## Calorie Budget

The daily food calorie budget is derived from TDEE adjusted for your weight goal:

```
budget = TDEE − daily_deficit
daily_deficit = pace_lbs_per_week × 500
```

A deficit of 500 cal/day = 1 lb/week loss (based on ~3,500 cal per pound of body fat).

**Example:** TDEE 2,400 − (1 lb/wk × 500) = **1,900 cal/day budget**

Pace is capped at ±2 lbs/week (±1,000 cal/day deficit) and floored at ±0.25 lbs/week for goals where a target date is set. Gaining weight (target > current) produces a positive surplus instead of a deficit.

---

## Exercise and Double-Counting

This is the most important thing to understand when configuring your settings.

### How Stride tracks exercise

Stride uses a **log-exercise-as-negative** model. Exercise entries in the calorie log are negative calories that reduce your net calories for the day:

```
net_calories = calories_food − calories_exercise
calories_left = calorie_budget − net_calories
```

This means if you eat 2,300 cal and log a 200-cal workout, your net is 2,100.

### The double-counting risk

The TDEE activity multipliers already factor in some daily activity. If you pick **Moderately Active** (assumes 3–5 days/week of exercise) *and* also log those same workouts, you are counting that exercise twice:

1. Once in the multiplier → higher TDEE → higher food budget
2. Again as a logged entry → reduces net calories further

**Recommended approach for most users: pick Sedentary, log exercise separately.**

- Set activity level to **Sedentary** (captures only your baseline movement)
- Log workouts as exercise entries in the calorie log
- The app subtracts logged calories from your net, giving you accurate remaining budget

This keeps the two signals clean. Your activity level reflects your resting lifestyle; your logged exercise reflects what you actually did that day.

### When to use a higher activity level

Use a higher multiplier *only* if you have consistent physical activity baked into your job or lifestyle that you won't be logging (e.g., a construction worker who walks 8 hours a day). Do not also log exercise in that case.

---

## Meal Budgets

The daily calorie budget can be split across meals. By default Stride auto-splits the budget proportionally:

| Meal      | Default share |
|-----------|--------------|
| Breakfast | 20%          |
| Lunch     | 20%          |
| Dinner    | 40%          |
| Snack     | 20%          |

These can be customized manually in Settings → Daily Budget.

---

## Manual Budget Mode

If auto-compute is off, you enter a fixed daily calorie budget directly. The app then works backwards to display:

- **TDEE** (still computed from your profile if filled in)
- **Deficit/surplus** = TDEE − manual budget
- **Implied pace** = deficit ÷ 500 lbs/week
- **Implied goal date** = how long to reach your target weight at that pace

This lets you verify whether a manually-entered budget is realistic for your goal.

---

## How Other Apps Handle This

For reference, the two dominant approaches in popular calorie tracking apps:

| App | Approach | Exercise adds to food budget? | Double-count risk |
|-----|----------|------------------------------|-------------------|
| MyFitnessPal | Hybrid: activity level (NEAT) + log workouts | Yes | High if activity level misconfigured |
| Lose It! | Same as MFP | Yes | Medium |
| Noom | Fixed budget, exercise does not adjust food budget | No | None (intentional) |
| Cronometer | User's choice | Optional | Depends |
| MacroFactor | Adaptive: infers TDEE from weight trend over time | No | None |

**MacroFactor's approach** is the most accurate long-term — it back-calculates your real TDEE from actual weight changes vs. logged food, so the activity multiplier problem disappears entirely. It requires 4–6 weeks of consistent logging to converge. This is a potential future direction for Stride.

**Noom's approach** (fixed budget, exercise is for health not math) is behaviorally sound — it avoids compensatory eating ("I earned a burger by running") — but is less accurate for users with variable activity.

Stride currently follows the **MFP model**: sedentary baseline + log exercise explicitly. The key risk to communicate to users is the activity level selection.
