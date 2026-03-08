package main

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// DateOnly wraps time.Time to serialize as "YYYY-MM-DD" in JSON.
type DateOnly struct{ time.Time }

func (d DateOnly) MarshalJSON() ([]byte, error) {
	return []byte(`"` + d.Time.Format("2006-01-02") + `"`), nil
}

func (d *DateOnly) UnmarshalJSON(b []byte) error {
	t, err := time.Parse(`"2006-01-02"`, string(b))
	if err != nil {
		return err
	}
	d.Time = t
	return nil
}

// ScanDate implements pgtype.DateScanner so pgx can scan PostgreSQL date
// columns (OID 1082) into DateOnly. NULL values zero the time and return nil
// so that *DateOnly pointer fields can be set to nil by pgx's NULL handling.
func (d *DateOnly) ScanDate(v pgtype.Date) error {
	if !v.Valid {
		d.Time = time.Time{}
		return nil
	}
	d.Time = v.Time
	return nil
}

/* ─── Domain structs ─────────────────────────────────────────────────── */

// user maps to the users table. AuthToken and Password are hidden from JSON responses.
type user struct {
	ID        int        `json:"id" db:"id"`
	Username  string     `json:"username" db:"username"`
	Email     string     `json:"email" db:"email"`
	AuthToken string     `json:"-" db:"auth_token"`
	Password  string     `json:"-" db:"password"`
	CreatedAt *time.Time `json:"created_at" db:"created_at"`
}

// calorieLogItem maps to calorie_log_items. Nullable numeric fields use pointers
// so pgx can scan NULLs and JSON omits them naturally.
type calorieLogItem struct {
	ID        int        `json:"id" db:"id"`
	UserID    int        `json:"user_id" db:"user_id"`
	Date      DateOnly   `json:"date" db:"date"`
	ItemName  string     `json:"item_name" db:"item_name"`
	Type      string     `json:"type" db:"type"`
	Qty       *float64   `json:"qty" db:"qty"`
	Uom       *string    `json:"uom" db:"uom"`
	Calories  int        `json:"calories" db:"calories"`
	ProteinG  *float64   `json:"protein_g" db:"protein_g"`
	CarbsG    *float64   `json:"carbs_g" db:"carbs_g"`
	FatG      *float64   `json:"fat_g" db:"fat_g"`
	RecipeID  *int       `json:"recipe_id" db:"recipe_id"`
	CreatedAt *time.Time `json:"created_at" db:"created_at"`
	UpdatedAt *time.Time `json:"updated_at" db:"updated_at"`
}

// calorieLogUserSettings maps to calorie_log_user_settings. One row per user
// with daily calorie budget, macro targets, per-meal budgets, and body-profile
// fields used for auto TDEE computation.
type calorieLogUserSettings struct {
	UserID         int `json:"user_id"          db:"user_id"`
	CalorieBudget  int `json:"calorie_budget"   db:"calorie_budget"`
	ProteinTargetG int `json:"protein_target_g" db:"protein_target_g"`
	CarbsTargetG   int `json:"carbs_target_g"   db:"carbs_target_g"`
	FatTargetG     int `json:"fat_target_g"     db:"fat_target_g"`

	BreakfastBudget        int `json:"breakfast_budget"         db:"breakfast_budget"`
	LunchBudget            int `json:"lunch_budget"             db:"lunch_budget"`
	DinnerBudget           int `json:"dinner_budget"            db:"dinner_budget"`
	SnackBudget            int `json:"snack_budget"             db:"snack_budget"`
	ExerciseTargetCalories int `json:"exercise_target_calories" db:"exercise_target_calories"`

	// Profile fields — all nullable; zero-knowledge rows still work.
	Sex             *string   `json:"sex"               db:"sex"`
	DateOfBirth     *DateOnly `json:"date_of_birth"     db:"date_of_birth"`
	HeightCM        *float64  `json:"height_cm"         db:"height_cm"`
	WeightLBS       *float64  `json:"weight_lbs"        db:"weight_lbs"`
	ActivityLevel   *string   `json:"activity_level"    db:"activity_level"`
	TargetWeightLBS *float64  `json:"target_weight_lbs" db:"target_weight_lbs"`
	TargetDate      *DateOnly `json:"target_date"       db:"target_date"`
	Units           string    `json:"units"             db:"units"`
	BudgetAuto      bool      `json:"budget_auto"       db:"budget_auto"`
	SetupComplete   bool      `json:"setup_complete"    db:"setup_complete"`

	// Computed fields — populated server-side from profile; not stored in DB.
	// db:"-" tells RowToStructByName to skip these during scanning.
	ComputedBMR    *int     `json:"computed_bmr,omitempty"      db:"-"`
	ComputedTDEE   *int     `json:"computed_tdee,omitempty"     db:"-"`
	ComputedBudget *int     `json:"computed_budget,omitempty"   db:"-"`
	PaceLbsPerWeek *float64 `json:"pace_lbs_per_week,omitempty" db:"-"`
}

// weekDayDBRow is the shape of each row returned by the week-summary GROUP BY query.
// Used only for scanning; the final response uses weekDaySummary.
type weekDayDBRow struct {
	Date             DateOnly `db:"date"`
	CaloriesFood     int      `db:"calories_food"`
	CaloriesExercise int      `db:"calories_exercise"`
	ProteinG         float64  `db:"protein_g"`
	CarbsG           float64  `db:"carbs_g"`
	FatG             float64  `db:"fat_g"`
}

// weekDaySummary is one day's entry in the GET /calorie-log/week-summary response.
// Days with no logged items have HasData=false and zero calorie fields.
type weekDaySummary struct {
	Date             DateOnly `json:"date"`
	CalorieBudget    int      `json:"calorie_budget"`
	CaloriesFood     int      `json:"calories_food"`
	CaloriesExercise int      `json:"calories_exercise"`
	NetCalories      int      `json:"net_calories"`
	CaloriesLeft     int      `json:"calories_left"`
	ProteinG         float64  `json:"protein_g"`
	CarbsG           float64  `json:"carbs_g"`
	FatG             float64  `json:"fat_g"`
	HasData          bool     `json:"has_data"`
}

// dailySummary is the response shape for GET /calorie-log/daily.
// Includes the day's items, user settings, and computed totals.
type dailySummary struct {
	Date             string                 `json:"date"`
	CalorieBudget    int                    `json:"calorie_budget"`
	CaloriesFood     int                    `json:"calories_food"`
	CaloriesExercise int                    `json:"calories_exercise"`
	NetCalories      int                    `json:"net_calories"`
	CaloriesLeft     int                    `json:"calories_left"`
	ProteinG         float64                `json:"protein_g"`
	CarbsG           float64                `json:"carbs_g"`
	FatG             float64                `json:"fat_g"`
	Items            []calorieLogItem       `json:"items"`
	Settings         calorieLogUserSettings `json:"settings"`
}

// calorieConfigHistory records a historical calorie budget and activity level snapshot.
// When the user changes their budget or activity level, the previous values are written
// here with valid_until = yesterday. The progress endpoint uses these to resolve per-day
// config rather than applying today's settings uniformly across all historical dates.
// To find the config for date D: select the first row with valid_until >= D;
// fall back to current calorie_log_user_settings if no such row exists.
type calorieConfigHistory struct {
	ID            int        `json:"id"             db:"id"`
	UserID        int        `json:"user_id"        db:"user_id"`
	ValidUntil    DateOnly   `json:"valid_until"    db:"valid_until"`
	CalorieBudget int        `json:"calorie_budget" db:"calorie_budget"`
	ActivityLevel *string    `json:"activity_level" db:"activity_level"`
	CreatedAt     *time.Time `json:"created_at"     db:"created_at"`
}

// weightEntry maps to the weight_log table. One entry per user per date;
// the UNIQUE(user_id, date) constraint enables upsert via ON CONFLICT.
type weightEntry struct {
	ID        int        `json:"id"         db:"id"`
	UserID    int        `json:"user_id"    db:"user_id"`
	Date      DateOnly   `json:"date"       db:"date"`
	WeightLBS float64    `json:"weight_lbs" db:"weight_lbs"`
	CreatedAt *time.Time `json:"created_at" db:"created_at"`
}

// progressStats holds aggregate stats computed from a date range for the Progress tab.
type progressStats struct {
	DaysTracked              int      `json:"days_tracked"`
	DaysOnBudget             int      `json:"days_on_budget"`
	AvgCaloriesFood          int      `json:"avg_calories_food"`
	AvgCaloriesExercise      int      `json:"avg_calories_exercise"`
	AvgNetCalories           int      `json:"avg_net_calories"`
	TotalCaloriesLeft        int      `json:"total_calories_left"`
	// EstimatedWeightChangeLbs is the TDEE-based estimated weight change over the period.
	// Positive = gaining, negative = losing. Omitted when TDEE profile is incomplete.
	EstimatedWeightChangeLbs *float64 `json:"estimated_weight_change_lbs,omitempty"`
}

// weekSummaryResponse is the response for GET /api/calorie-log/week-summary.
// EstimatedWeightChangeLbs is the TDEE-based estimate for the week; omitted when
// the TDEE profile (sex, DOB, height, activity) is incomplete.
type weekSummaryResponse struct {
	Days                     []weekDaySummary `json:"days"`
	EstimatedWeightChangeLbs *float64         `json:"estimated_weight_change_lbs,omitempty"`
}

// progressResponse is the response for GET /api/calorie-log/progress.
// Days contains only dates with logged items (no gap-filling from the API);
// the frontend fills visual gaps for the month view.
type progressResponse struct {
	Days  []weekDaySummary `json:"days"`
	Stats progressStats    `json:"stats"`
}

/* ─── Habit structs ──────────────────────────────────────────────────── */

// habit maps to the habits table. Levels are stored inline (level1–3_label)
// because max 3 levels is a fixed product constraint, not a dynamic list.
// archived_at is non-nil when the habit has been soft-deleted.
type habit struct {
	ID           int        `json:"id"            db:"id"`
	UserID       int        `json:"user_id"       db:"user_id"`
	Name         string     `json:"name"          db:"name"`
	Emoji        *string    `json:"emoji"         db:"emoji"`
	Color        *string    `json:"color"         db:"color"`
	Frequency    string     `json:"frequency"     db:"frequency"` // 'daily' | 'weekly'
	WeeklyTarget *int       `json:"weekly_target" db:"weekly_target"`
	Level1Label  string     `json:"level1_label"  db:"level1_label"`
	Level2Label  *string    `json:"level2_label"  db:"level2_label"`
	Level3Label  *string    `json:"level3_label"  db:"level3_label"`
	SortOrder    int        `json:"sort_order"    db:"sort_order"`
	ArchivedAt   *time.Time `json:"archived_at"   db:"archived_at"`
	CreatedAt    time.Time  `json:"created_at"    db:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"    db:"updated_at"`
}

// habitLog maps to the habit_logs table. Sparse model: no row = not completed.
// level is 1–3; the CHECK constraint on the DB enforces this.
type habitLog struct {
	ID        int      `json:"id"         db:"id"`
	UserID    int      `json:"user_id"    db:"user_id"`
	HabitID   int      `json:"habit_id"   db:"habit_id"`
	Date      DateOnly `json:"date"       db:"date"`
	Level     int      `json:"level"      db:"level"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// habitWithLog is the response shape for GET /api/habits. Extends habit with
// the log entry for the requested date and precomputed streak/consistency stats.
type habitWithLog struct {
	habit
	Log            *habitLog `json:"log"`
	CurrentStreak  int       `json:"current_streak"`
	LongestStreak  int       `json:"longest_streak"`
	Consistency30d int       `json:"consistency_30d"` // 0–100 percentage
	AvgLevel30d    float64   `json:"avg_level_30d"`
}

// habitWeekEntry is one item in the GET /api/habits/week response.
// Habit includes streak/stats computed from the last 30 days (Log is nil — use Logs instead).
// Logs contains every log in the requested 7-day window for this habit.
type habitWeekEntry struct {
	Habit habitWithLog `json:"habit"`
	Logs  []habitLog   `json:"logs"`
}

// createHabitRequest is the request body for POST /api/habits.
type createHabitRequest struct {
	Name         string  `json:"name"          binding:"required"`
	Emoji        *string `json:"emoji"`
	Color        *string `json:"color"`
	Frequency    string  `json:"frequency"`     // 'daily' | 'weekly'; defaults to 'daily'
	WeeklyTarget *int    `json:"weekly_target"` // required when frequency='weekly'
	Level1Label  string  `json:"level1_label"  binding:"required"`
	Level2Label  *string `json:"level2_label"`
	Level3Label  *string `json:"level3_label"`
	SortOrder    int     `json:"sort_order"`
}

// updateHabitRequest is the request body for PATCH /api/habits/:id.
// All fields are optional — only non-nil values are written to the DB.
type updateHabitRequest struct {
	Name         *string  `json:"name"`
	Emoji        *string  `json:"emoji"`
	Color        *string  `json:"color"`
	Frequency    *string  `json:"frequency"`
	WeeklyTarget *int     `json:"weekly_target"`
	Level1Label  *string  `json:"level1_label"`
	Level2Label  *string  `json:"level2_label"`
	Level3Label  *string  `json:"level3_label"`
	SortOrder    *int     `json:"sort_order"`
}

// upsertHabitLogRequest is the request body for PUT /api/habit-logs.
// Level=0 deletes the log row (reset); 1–3 upserts it.
type upsertHabitLogRequest struct {
	HabitID int    `json:"habit_id" binding:"required"`
	Date    string `json:"date"     binding:"required"` // YYYY-MM-DD
	Level   int    `json:"level"`                       // 0 = delete, 1–3 = upsert
}

/* ─── Recipe structs ─────────────────────────────────────────────────── */

// recipe maps to the recipes table — top-level recipe record.
type recipe struct {
	ID        int        `json:"id"         db:"id"`
	UserID    int        `json:"user_id"    db:"user_id"`
	Name      string     `json:"name"       db:"name"`
	Emoji     *string    `json:"emoji"      db:"emoji"`
	Category  string     `json:"category"   db:"category"` // recipe_category enum, scans as string
	Notes     *string    `json:"notes"      db:"notes"`
	Servings  float64    `json:"servings"   db:"servings"`
	Calories  *int       `json:"calories"   db:"calories"`
	ProteinG  *float64   `json:"protein_g"  db:"protein_g"`
	CarbsG    *float64   `json:"carbs_g"    db:"carbs_g"`
	FatG      *float64   `json:"fat_g"      db:"fat_g"`
	CreatedAt *time.Time `json:"created_at" db:"created_at"`
	UpdatedAt *time.Time `json:"updated_at" db:"updated_at"`
}

// recipeListItem is the shape returned by GET /api/recipes — recipe plus computed
// step count and total timer duration (sum of timer_seconds across all timer steps).
type recipeListItem struct {
	recipe
	StepCount         int `json:"step_count"          db:"step_count"`
	TotalTimerSeconds int `json:"total_timer_seconds" db:"total_timer_seconds"`
}

// recipeIngredient maps to recipe_ingredients.
type recipeIngredient struct {
	ID        int      `json:"id"         db:"id"`
	RecipeID  int      `json:"recipe_id"  db:"recipe_id"`
	Name      string   `json:"name"       db:"name"`
	Qty       *float64 `json:"qty"        db:"qty"`
	Uom       *string  `json:"uom"        db:"uom"`
	Note      *string  `json:"note"       db:"note"`
	SortOrder int      `json:"sort_order" db:"sort_order"`
}

// recipeTool maps to recipe_tools.
type recipeTool struct {
	ID        int    `json:"id"         db:"id"`
	RecipeID  int    `json:"recipe_id"  db:"recipe_id"`
	Name      string `json:"name"       db:"name"`
	SortOrder int    `json:"sort_order" db:"sort_order"`
}

// recipeStep maps to recipe_steps. Type is 'instruction' or 'timer'.
// TimerSeconds and MeanwhileText are only populated for timer steps.
type recipeStep struct {
	ID            int     `json:"id"             db:"id"`
	RecipeID      int     `json:"recipe_id"      db:"recipe_id"`
	Type          string  `json:"type"           db:"type"`
	Text          string  `json:"text"           db:"text"`
	TimerSeconds  *int    `json:"timer_seconds"  db:"timer_seconds"`
	MeanwhileText *string `json:"meanwhile_text" db:"meanwhile_text"`
	SortOrder     int     `json:"sort_order"     db:"sort_order"`
}

// recipeDetail is the full recipe response — recipe fields plus all sub-lists.
// Returned by GET /api/recipes/:id and write endpoints.
type recipeDetail struct {
	recipe
	Ingredients []recipeIngredient `json:"ingredients"`
	Tools       []recipeTool       `json:"tools"`
	Steps       []recipeStep       `json:"steps"`
}

// ingredientInput is a single ingredient in a create/update request.
type ingredientInput struct {
	Name      string   `json:"name"`
	Qty       *float64 `json:"qty"`
	Uom       *string  `json:"uom"`
	Note      *string  `json:"note"`
	SortOrder int      `json:"sort_order"`
}

// toolInput is a single tool in a create/update request.
type toolInput struct {
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
}

// stepInput is a single step in a create/update request.
type stepInput struct {
	Type          string  `json:"type"`
	Text          string  `json:"text"`
	TimerSeconds  *int    `json:"timer_seconds"`
	MeanwhileText *string `json:"meanwhile_text"`
	SortOrder     int     `json:"sort_order"`
}

// createRecipeRequest is the request body for POST /api/recipes.
type createRecipeRequest struct {
	Name        string            `json:"name"        binding:"required"`
	Emoji       *string           `json:"emoji"`
	Category    string            `json:"category"`
	Notes       *string           `json:"notes"`
	Servings    *float64          `json:"servings"`
	Calories    *int              `json:"calories"`
	ProteinG    *float64          `json:"protein_g"`
	CarbsG      *float64          `json:"carbs_g"`
	FatG        *float64          `json:"fat_g"`
	Ingredients []ingredientInput `json:"ingredients"`
	Tools       []toolInput       `json:"tools"`
	Steps       []stepInput       `json:"steps"`
}

// updateRecipeRequest is the request body for PUT /api/recipes/:id.
// Sub-lists, when present, fully replace the existing ones.
type updateRecipeRequest struct {
	Name        *string            `json:"name"`
	Emoji       *string            `json:"emoji"`
	Category    *string            `json:"category"`
	Notes       *string            `json:"notes"`
	Servings    *float64           `json:"servings"`
	Calories    *int               `json:"calories"`
	ProteinG    *float64           `json:"protein_g"`
	CarbsG      *float64           `json:"carbs_g"`
	FatG        *float64           `json:"fat_g"`
	Ingredients *[]ingredientInput `json:"ingredients"`
	Tools       *[]toolInput       `json:"tools"`
	Steps       *[]stepInput       `json:"steps"`
}

// validRecipeCategories is the set of allowed values for the recipe_category enum.
// Reject unknown values before hitting the DB.
var validRecipeCategories = map[string]bool{
	"breakfast": true,
	"lunch":     true,
	"dinner":    true,
	"dessert":   true,
	"snack":     true,
	"other":     true,
}

// calorieLogFavorite is a saved item template for quick re-logging.
// Stored in calorie_log_favorites; returned by GET /api/calorie-log/favorites.
type calorieLogFavorite struct {
	ID        int        `json:"id"         db:"id"`
	UserID    int        `json:"user_id"    db:"user_id"`
	ItemName  string     `json:"item_name"  db:"item_name"`
	Type      string     `json:"type"       db:"type"`
	Qty       *float64   `json:"qty"        db:"qty"`
	Uom       *string    `json:"uom"        db:"uom"`
	Calories  int        `json:"calories"   db:"calories"`
	ProteinG  *float64   `json:"protein_g"  db:"protein_g"`
	CarbsG    *float64   `json:"carbs_g"    db:"carbs_g"`
	FatG      *float64   `json:"fat_g"      db:"fat_g"`
	CreatedAt *time.Time `json:"created_at" db:"created_at"`
}

// createFavoriteRequest is the request body for POST /api/calorie-log/favorites.
type createFavoriteRequest struct {
	ItemName string   `json:"item_name" binding:"required"`
	Type     string   `json:"type"      binding:"required"`
	Qty      *float64 `json:"qty"`
	Uom      *string  `json:"uom"`
	Calories int      `json:"calories"  binding:"required"`
	ProteinG *float64 `json:"protein_g"`
	CarbsG   *float64 `json:"carbs_g"`
	FatG     *float64 `json:"fat_g"`
}

// createCalorieLogItemRequest is the request body for POST /api/calorie-log/items.
type createCalorieLogItemRequest struct {
	Date     string   `json:"date"`
	ItemName string   `json:"item_name"`
	Type     string   `json:"type"`
	Qty      *float64 `json:"qty"`
	Uom      *string  `json:"uom"`
	Calories int      `json:"calories"`
	ProteinG *float64 `json:"protein_g"`
	CarbsG   *float64 `json:"carbs_g"`
	FatG     *float64 `json:"fat_g"`
	RecipeID *int     `json:"recipe_id"`
}

// patchUserSettingsRequest is the request body for PATCH /api/calorie-log/user-settings.
// All fields are pointers — only non-nil fields get written to the database.
type patchUserSettingsRequest struct {
	CalorieBudget          *int     `json:"calorie_budget"`
	ProteinTargetG         *int     `json:"protein_target_g"`
	CarbsTargetG           *int     `json:"carbs_target_g"`
	FatTargetG             *int     `json:"fat_target_g"`
	BreakfastBudget        *int     `json:"breakfast_budget"`
	LunchBudget            *int     `json:"lunch_budget"`
	DinnerBudget           *int     `json:"dinner_budget"`
	SnackBudget            *int     `json:"snack_budget"`
	ExerciseTargetCalories *int     `json:"exercise_target_calories"`
	Sex                    *string  `json:"sex"`
	DateOfBirth            *string  `json:"date_of_birth"` // YYYY-MM-DD string, stored as date
	HeightCM               *float64 `json:"height_cm"`
	WeightLBS              *float64 `json:"weight_lbs"`
	ActivityLevel          *string  `json:"activity_level"`
	TargetWeightLBS        *float64 `json:"target_weight_lbs"`
	TargetDate             *string  `json:"target_date"` // YYYY-MM-DD string, stored as date
	Units                  *string  `json:"units"`
	BudgetAuto             *bool    `json:"budget_auto"`
	SetupComplete          *bool    `json:"setup_complete"`
}
