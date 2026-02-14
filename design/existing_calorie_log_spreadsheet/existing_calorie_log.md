I have an existing calorie logger that is basically just a google spreadsheet for entering daily calories.

It uses apps scripts to automate saving the dashboard logged items and creating the daily summary.

## Sheets

### 1. Dashboard (main input sheet)

The primary data entry interface. Top section shows summary stats, bottom section is where items are logged.

**Header stats:**
- Name, Starting Weight (270), Target Weight (170), Current Date, Last Modified
- Calorie Budget (2300), Calories Food, Calories Exercise, Calories Total, Calories Left
- Macro breakdowns: Protein %, Protein (g), Carbs %, Carbs (g), Fat %, Fat (g)
- Weekly calorie budgets table (MON–SUN) with per-day budget and weekly total

**Item entry table (below header):**
Each row is a food or exercise item for the current day:
- ITEM — name (e.g. "Banana Smoothie", "Walk")
- TYPE — dropdown: Breakfast, Lunch, Dinner, Snack, Exercise
- QTY — numeric quantity
- UOM — unit of measure: Each, Miles, KM, Minutes, g
- CALORIES — calorie value (negative for exercise)
- PROTEIN (g), CARBS (g), FAT (g) — macros

**Daily summary panel (right side of dashboard):**
Shows current vs budget by type:
- TOTAL, Breakfast, Lunch, Dinner, Snack, Exercise, Total Food
- CUR (current calories), TOTAL (budget for that type), PERCENT
- Color-coded: green when under budget, red/orange when over

### 2. Items (historical log)

Append-only log of every item ever entered. Each row has:
- Date (YYYY-MM-DD)
- ITEM, TYPE, QTY, UOM, CALORIES, PROTEIN (g), CARBS (g), FAT (g)
- Last Modified timestamp

Sorted by date descending. Exercise entries have negative calorie values. Items without full macro data just have calories filled in.

### 3. Day Summaries

One row per day with aggregated totals:
- DATE, CALORIE BUDGET, CALORIES FOOD, CALORIES EXERCISE, NET CALORIES, CALORIES LEFT
- PROTEIN (g), CARBS (g), FAT (g)

CALORIES LEFT = CALORIE BUDGET - NET CALORIES. Negative values (over budget) shown in red, positive (under budget) in green.

### 4. Weight History

Weekly weigh-in tracking:
- DATE, WEIGHT, CHANGE (week-over-week delta)
- Header shows: TOTAL LOST (41.8 lbs), YTD Lost, Last Modified
- Two charts: Weight vs Date (YTD) and Weight vs Date (All Time)
- Change column is color-coded: red for gains, green for losses

## Workflow

1. Open the dashboard, log food/exercise items throughout the day using the item entry table
2. Dashboard auto-calculates calorie totals, macros, and budget remaining in real time
3. Apps Script automation saves the day's items to the Items sheet and creates/updates the Day Summaries row
4. Weight is logged weekly on the Weight History sheet separately
