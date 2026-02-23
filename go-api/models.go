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
