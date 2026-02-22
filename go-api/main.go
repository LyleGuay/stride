package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

// staticFiles embeds the compiled frontend (web-client/dist) at build time.
// The Dockerfile copies dist into go-api/static/ before running go build.
//
//go:embed all:static
var staticFiles embed.FS

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

// Handler holds shared dependencies (db pool) for all route handlers.
type Handler struct {
	db *pgxpool.Pool
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

type habit struct {
	Id      int    `json:"id" db:"id"`
	Name    string `json:"name" db:"name"`
	Cadence string `json:"cadence" db:"cadence"`
}

// calorieLogItem maps to calorie_log_items. Nullable numeric fields use pointers
// so pgx can scan NULLs and JSON omits them naturally.
type calorieLogItem struct {
	ID        int      `json:"id" db:"id"`
	UserID    int      `json:"user_id" db:"user_id"`
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
	UserID          int     `json:"user_id"          db:"user_id"`
	CalorieBudget   int     `json:"calorie_budget"   db:"calorie_budget"`
	ProteinTargetG  int     `json:"protein_target_g" db:"protein_target_g"`
	CarbsTargetG    int     `json:"carbs_target_g"   db:"carbs_target_g"`
	FatTargetG      int     `json:"fat_target_g"     db:"fat_target_g"`
	BreakfastBudget        int     `json:"breakfast_budget"         db:"breakfast_budget"`
	LunchBudget            int     `json:"lunch_budget"             db:"lunch_budget"`
	DinnerBudget           int     `json:"dinner_budget"            db:"dinner_budget"`
	SnackBudget            int     `json:"snack_budget"             db:"snack_budget"`
	ExerciseTargetCalories int     `json:"exercise_target_calories" db:"exercise_target_calories"`

	// Profile fields — all nullable; zero-knowledge rows still work.
	Sex             *string   `json:"sex"              db:"sex"`
	DateOfBirth     *DateOnly `json:"date_of_birth"    db:"date_of_birth"`
	HeightCM        *float64  `json:"height_cm"        db:"height_cm"`
	WeightLBS       *float64  `json:"weight_lbs"       db:"weight_lbs"`
	ActivityLevel   *string   `json:"activity_level"   db:"activity_level"`
	TargetWeightLBS *float64  `json:"target_weight_lbs" db:"target_weight_lbs"`
	TargetDate      *DateOnly `json:"target_date"      db:"target_date"`
	Units           string    `json:"units"            db:"units"`
	BudgetAuto      bool      `json:"budget_auto"      db:"budget_auto"`
	SetupComplete   bool      `json:"setup_complete"   db:"setup_complete"`

	// Computed fields — populated server-side from profile; not stored in DB.
	// db:"-" tells RowToStructByName to skip these during scanning.
	ComputedBMR    *int     `json:"computed_bmr,omitempty"    db:"-"`
	ComputedTDEE   *int     `json:"computed_tdee,omitempty"   db:"-"`
	ComputedBudget *int     `json:"computed_budget,omitempty" db:"-"`
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

/* ─── Database helpers ────────────────────────────────────────────────── */

// queryOne runs a query and scans the first row into T using RowToStructByName.
// Logs query and scan errors for debugging (e.g. struct/column mismatches).
func queryOne[T any](pool *pgxpool.Pool, c *gin.Context, sql string, args pgx.NamedArgs) (T, error) {
	rows, err := pool.Query(c, sql, args)
	if err != nil {
		log.Printf("[queryOne] Query error: %v", err)
		var zero T
		return zero, err
	}
	result, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[T])
	if err != nil {
		log.Printf("[queryOne] Scan error: %v", err)
	}
	return result, err
}

// queryMany runs a query and scans all rows into []T using RowToStructByName.
func queryMany[T any](pool *pgxpool.Pool, c *gin.Context, sql string, args pgx.NamedArgs) ([]T, error) {
	rows, err := pool.Query(c, sql, args)
	if err != nil {
		log.Printf("[queryMany] Query error: %v", err)
		return nil, err
	}
	results, err := pgx.CollectRows(rows, pgx.RowToStructByName[T])
	if err != nil {
		log.Printf("[queryMany] Scan error: %v", err)
	}
	return results, err
}

// apiError returns a consistent JSON error response: {"error": "message"}.
func apiError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"error": message})
}

/* ─── TDEE computation ────────────────────────────────────────────────── */

// computeTDEE computes BMR (Mifflin-St Jeor), TDEE, suggested daily calorie
// budget, and weight-loss pace (lbs/week) from user profile settings.
// Returns ok=false when any required profile field is nil or the target date
// is in the past (budget would be meaningless in those cases).
func computeTDEE(s *calorieLogUserSettings) (bmr, tdee, budget int, paceLbsPerWeek float64, ok bool) {
	if s.Sex == nil || s.DateOfBirth == nil || s.HeightCM == nil ||
		s.WeightLBS == nil || s.ActivityLevel == nil ||
		s.TargetWeightLBS == nil || s.TargetDate == nil {
		return 0, 0, 0, 0, false
	}

	// Age derived from date of birth
	today := time.Now()
	age := today.Year() - s.DateOfBirth.Year()
	if today.Before(s.DateOfBirth.AddDate(age, 0, 0)) {
		age--
	}

	// BMR via Mifflin-St Jeor: different constant for male vs female
	weightKG := *s.WeightLBS / 2.20462
	bmrF := 10*weightKG + 6.25**s.HeightCM - 5*float64(age)
	if *s.Sex == "male" {
		bmrF += 5
	} else {
		bmrF -= 161
	}

	// TDEE: multiply BMR by activity level multiplier
	multipliers := map[string]float64{
		"sedentary":  1.2,
		"light":      1.375,
		"moderate":   1.55,
		"active":     1.725,
		"very_active": 1.9,
	}
	mult, found := multipliers[*s.ActivityLevel]
	if !found {
		return 0, 0, 0, 0, false
	}
	tdeeF := bmrF * mult

	// Pace from target weight delta and time remaining
	weeksUntil := time.Until(s.TargetDate.Time).Hours() / 24 / 7
	if weeksUntil <= 0 {
		return 0, 0, 0, 0, false
	}
	pace := (*s.WeightLBS - *s.TargetWeightLBS) / weeksUntil
	// Cap pace at 2 lbs/week (safe maximum), floor at 0.25
	if pace > 2 {
		pace = 2
	}
	if pace < 0.25 {
		pace = 0.25
	}

	// Budget = TDEE minus the caloric deficit implied by pace (3500 cal ≈ 1 lb fat)
	budgetF := tdeeF - pace*500
	return int(bmrF), int(tdeeF), int(budgetF), pace, true
}

/* ─── Auth routes ─────────────────────────────────────────────────────── */

// login verifies username/password and returns the user's auth token.
// POST /api/login (public — no auth required).
func (h *Handler) login(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	u, err := queryOne[user](h.db, c,
		"SELECT * FROM users WHERE username = @username",
		pgx.NamedArgs{"username": body.Username})
	if err != nil {
		apiError(c, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(body.Password)); err != nil {
		apiError(c, http.StatusUnauthorized, "invalid credentials")
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": u.AuthToken, "user_id": u.ID})
}

// authMiddleware validates the Bearer token and sets user_id on the context.
func (h *Handler) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			apiError(c, http.StatusUnauthorized, "missing or invalid authorization header")
			c.Abort()
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")

		var userID int
		err := h.db.QueryRow(c, "SELECT id FROM users WHERE auth_token = $1", token).Scan(&userID)
		if err != nil {
			apiError(c, http.StatusUnauthorized, "invalid token")
			c.Abort()
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}

/* ─── Calorie log routes ──────────────────────────────────────────────── */

// getDailySummary returns calorie log items and computed totals for a given date.
// GET /api/calorie-log/daily?date=YYYY-MM-DD (defaults to today).
func (h *Handler) getDailySummary(c *gin.Context) {
	userID := c.GetInt("user_id")
	date := c.DefaultQuery("date", time.Now().Format("2006-01-02"))
	args := pgx.NamedArgs{"userID": userID, "date": date}

	items, err := queryMany[calorieLogItem](h.db, c,
		`SELECT * FROM calorie_log_items
		 WHERE user_id = @userID AND date = @date
		 ORDER BY created_at`, args)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch items")
		return
	}
	// Ensure items is an empty array (not null) in JSON
	if items == nil {
		items = []calorieLogItem{}
	}

	settings, err := queryOne[calorieLogUserSettings](h.db, c,
		"SELECT * FROM calorie_log_user_settings WHERE user_id = @userID",
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch settings")
		return
	}

	// Compute totals. Exercise calories are stored as positive integers; the
	// type field is the source of truth for direction (food adds, exercise subtracts).
	var caloriesFood, caloriesExercise int
	var proteinG, carbsG, fatG float64
	for _, item := range items {
		if item.Type == "exercise" {
			caloriesExercise += item.Calories
		} else {
			caloriesFood += item.Calories
		}
		if item.ProteinG != nil {
			proteinG += *item.ProteinG
		}
		if item.CarbsG != nil {
			carbsG += *item.CarbsG
		}
		if item.FatG != nil {
			fatG += *item.FatG
		}
	}

	// Populate computed TDEE fields so the frontend can show estimated pace.
	if bmr, tdee, budget, pace, ok := computeTDEE(&settings); ok {
		settings.ComputedBMR = &bmr
		settings.ComputedTDEE = &tdee
		settings.ComputedBudget = &budget
		settings.PaceLbsPerWeek = &pace
	}

	// Net = food minus exercise, left = budget minus net
	net := caloriesFood - caloriesExercise
	left := settings.CalorieBudget - net

	c.JSON(http.StatusOK, dailySummary{
		Date:             date,
		CalorieBudget:    settings.CalorieBudget,
		CaloriesFood:     caloriesFood,
		CaloriesExercise: caloriesExercise,
		NetCalories:      net,
		CaloriesLeft:     left,
		ProteinG:         proteinG,
		CarbsG:           carbsG,
		FatG:             fatG,
		Items:            items,
		Settings:         settings,
	})
}

// currentMonday returns the Monday of the current week at midnight UTC.
func currentMonday() time.Time {
	now := time.Now().UTC()
	weekday := int(now.Weekday()) // 0=Sun
	if weekday == 0 {
		weekday = 7 // treat Sunday as day 7 so Mon=1..Sun=7
	}
	return time.Date(now.Year(), now.Month(), now.Day()-weekday+1, 0, 0, 0, 0, time.UTC)
}

// getWeekSummary returns per-day calorie totals for the Mon–Sun week containing
// week_start. Days with no logged items are included with has_data=false.
// GET /api/calorie-log/week-summary?week_start=YYYY-MM-DD (defaults to current week).
func (h *Handler) getWeekSummary(c *gin.Context) {
	userID := c.GetInt("user_id")

	// Parse week_start; default to the current Monday.
	var weekStart time.Time
	if s := c.Query("week_start"); s != "" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			apiError(c, http.StatusBadRequest, "invalid week_start, expected YYYY-MM-DD")
			return
		}
		weekStart = t
	} else {
		weekStart = currentMonday()
	}
	weekEnd := weekStart.AddDate(0, 0, 6)

	// Get the user's calorie budget from settings.
	settings, err := queryOne[calorieLogUserSettings](h.db, c,
		"SELECT * FROM calorie_log_user_settings WHERE user_id = @userID",
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch settings")
		return
	}

	// Query per-day totals across the 7-day window. Exercise calories are positive
	// in the DB; the type column determines direction (food adds, exercise subtracts).
	rows, err := queryMany[weekDayDBRow](h.db, c,
		`SELECT
			date,
			SUM(CASE WHEN type != 'exercise' THEN calories ELSE 0 END) AS calories_food,
			SUM(CASE WHEN type  = 'exercise' THEN calories ELSE 0 END) AS calories_exercise,
			COALESCE(SUM(protein_g), 0) AS protein_g,
			COALESCE(SUM(carbs_g),   0) AS carbs_g,
			COALESCE(SUM(fat_g),     0) AS fat_g
		 FROM calorie_log_items
		 WHERE user_id = @userID AND date >= @weekStart AND date <= @weekEnd
		 GROUP BY date`,
		pgx.NamedArgs{
			"userID":    userID,
			"weekStart": weekStart.Format("2006-01-02"),
			"weekEnd":   weekEnd.Format("2006-01-02"),
		})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch week data")
		return
	}

	// Index DB rows by date string for O(1) merge.
	rowByDate := make(map[string]weekDayDBRow, len(rows))
	for _, r := range rows {
		rowByDate[r.Date.Time.Format("2006-01-02")] = r
	}

	// Build a full 7-day response, filling zeros for days with no data.
	result := make([]weekDaySummary, 7)
	for i := 0; i < 7; i++ {
		d := weekStart.AddDate(0, 0, i)
		dateStr := d.Format("2006-01-02")
		day := weekDaySummary{
			Date:          DateOnly{d},
			CalorieBudget: settings.CalorieBudget,
		}
		if row, ok := rowByDate[dateStr]; ok {
			day.HasData = true
			day.CaloriesFood = row.CaloriesFood
			day.CaloriesExercise = row.CaloriesExercise
			day.ProteinG = row.ProteinG
			day.CarbsG = row.CarbsG
			day.FatG = row.FatG
		}
		day.NetCalories = day.CaloriesFood - day.CaloriesExercise
		day.CaloriesLeft = settings.CalorieBudget - day.NetCalories
		result[i] = day
	}

	c.JSON(http.StatusOK, result)
}

// createCalorieLogItem inserts a new calorie log entry.
// POST /api/calorie-log/items. Defaults date to today if omitted.
func (h *Handler) createCalorieLogItem(c *gin.Context) {
	userID := c.GetInt("user_id")

	var body struct {
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
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.ItemName == "" {
		apiError(c, http.StatusBadRequest, "item_name is required")
		return
	}
	if body.Type == "" {
		apiError(c, http.StatusBadRequest, "type is required")
		return
	}
	if body.Date == "" {
		body.Date = time.Now().Format("2006-01-02")
	}

	item, err := queryOne[calorieLogItem](h.db, c,
		`INSERT INTO calorie_log_items (user_id, date, item_name, type, qty, uom, calories, protein_g, carbs_g, fat_g)
		 VALUES (@userID, @date, @itemName, @type, @qty, @uom, @calories, @proteinG, @carbsG, @fatG)
		 RETURNING *`,
		pgx.NamedArgs{
			"userID": userID, "date": body.Date, "itemName": body.ItemName,
			"type": body.Type, "qty": body.Qty, "uom": body.Uom,
			"calories": body.Calories, "proteinG": body.ProteinG,
			"carbsG": body.CarbsG, "fatG": body.FatG,
		})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to create item")
		return
	}

	c.JSON(http.StatusCreated, item)
}

// updateCalorieLogItem updates an existing calorie log entry.
// PUT /api/calorie-log/items/:id. Uses COALESCE so omitted fields keep their current value.
func (h *Handler) updateCalorieLogItem(c *gin.Context) {
	userID := c.GetInt("user_id")
	id := c.Param("id")

	var body struct {
		Date     *string  `json:"date"`
		ItemName *string  `json:"item_name"`
		Type     *string  `json:"type"`
		Qty      *float64 `json:"qty"`
		Uom      *string  `json:"uom"`
		Calories *int     `json:"calories"`
		ProteinG *float64 `json:"protein_g"`
		CarbsG   *float64 `json:"carbs_g"`
		FatG     *float64 `json:"fat_g"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	item, err := queryOne[calorieLogItem](h.db, c,
		`UPDATE calorie_log_items SET
			date = COALESCE(@date, date),
			item_name = COALESCE(@itemName, item_name),
			type = COALESCE(@type, type),
			qty = COALESCE(@qty, qty),
			uom = COALESCE(@uom, uom),
			calories = COALESCE(@calories, calories),
			protein_g = COALESCE(@proteinG, protein_g),
			carbs_g = COALESCE(@carbsG, carbs_g),
			fat_g = COALESCE(@fatG, fat_g),
			updated_at = now()
		 WHERE id = @id AND user_id = @userID
		 RETURNING *`,
		pgx.NamedArgs{
			"id": id, "userID": userID,
			"date": body.Date, "itemName": body.ItemName, "type": body.Type,
			"qty": body.Qty, "uom": body.Uom, "calories": body.Calories,
			"proteinG": body.ProteinG, "carbsG": body.CarbsG, "fatG": body.FatG,
		})
	if err != nil {
		apiError(c, http.StatusNotFound, "item not found")
		return
	}

	c.JSON(http.StatusOK, item)
}

// deleteCalorieLogItem removes a calorie log entry. Returns 204 on success.
// DELETE /api/calorie-log/items/:id.
func (h *Handler) deleteCalorieLogItem(c *gin.Context) {
	userID := c.GetInt("user_id")
	id := c.Param("id")

	result, err := h.db.Exec(c,
		"DELETE FROM calorie_log_items WHERE id = @id AND user_id = @userID",
		pgx.NamedArgs{"id": id, "userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to delete item")
		return
	}
	if result.RowsAffected() == 0 {
		apiError(c, http.StatusNotFound, "item not found")
		return
	}

	c.Status(http.StatusNoContent)
}

/* ─── User settings routes ────────────────────────────────────────────── */

// getUserSettings returns the calorie log settings for the authenticated user.
// Computed TDEE fields (bmr, tdee, budget, pace) are populated when all profile
// fields are present.
// GET /api/calorie-log/user-settings.
func (h *Handler) getUserSettings(c *gin.Context) {
	userID := c.GetInt("user_id")

	s, err := queryOne[calorieLogUserSettings](h.db, c,
		"SELECT * FROM calorie_log_user_settings WHERE user_id = @userID",
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		apiError(c, http.StatusNotFound, "settings not found")
		return
	}

	// Populate computed TDEE fields when all required profile data is present
	if bmr, tdee, budget, pace, ok := computeTDEE(&s); ok {
		s.ComputedBMR = &bmr
		s.ComputedTDEE = &tdee
		s.ComputedBudget = &budget
		s.PaceLbsPerWeek = &pace
	}

	c.JSON(http.StatusOK, s)
}

// patchUserSettings updates only the provided calorie log settings fields.
// PATCH /api/calorie-log/user-settings. Uses pointer fields in the request body
// to distinguish "not provided" from zero — only non-nil fields get updated.
// When budget_auto is true after the update, the calorie_budget is overwritten
// with the TDEE-derived value if all required profile fields are present.
func (h *Handler) patchUserSettings(c *gin.Context) {
	userID := c.GetInt("user_id")

	var body struct {
		CalorieBudget   *int     `json:"calorie_budget"`
		ProteinTargetG  *int     `json:"protein_target_g"`
		CarbsTargetG    *int     `json:"carbs_target_g"`
		FatTargetG      *int     `json:"fat_target_g"`
		BreakfastBudget        *int     `json:"breakfast_budget"`
		LunchBudget            *int     `json:"lunch_budget"`
		DinnerBudget           *int     `json:"dinner_budget"`
		SnackBudget            *int     `json:"snack_budget"`
		ExerciseTargetCalories *int     `json:"exercise_target_calories"`
		Sex             *string  `json:"sex"`
		DateOfBirth     *string  `json:"date_of_birth"` // YYYY-MM-DD string, stored as date
		HeightCM        *float64 `json:"height_cm"`
		WeightLBS       *float64 `json:"weight_lbs"`
		ActivityLevel   *string  `json:"activity_level"`
		TargetWeightLBS *float64 `json:"target_weight_lbs"`
		TargetDate      *string  `json:"target_date"` // YYYY-MM-DD string, stored as date
		Units           *string  `json:"units"`
		BudgetAuto      *bool    `json:"budget_auto"`
		SetupComplete   *bool    `json:"setup_complete"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	// Build SET clause dynamically — only update fields the client actually sent
	setClauses := []string{}
	args := pgx.NamedArgs{"userID": userID}

	if body.CalorieBudget != nil {
		setClauses = append(setClauses, "calorie_budget = @calorieBudget")
		args["calorieBudget"] = *body.CalorieBudget
	}
	if body.ProteinTargetG != nil {
		setClauses = append(setClauses, "protein_target_g = @proteinTargetG")
		args["proteinTargetG"] = *body.ProteinTargetG
	}
	if body.CarbsTargetG != nil {
		setClauses = append(setClauses, "carbs_target_g = @carbsTargetG")
		args["carbsTargetG"] = *body.CarbsTargetG
	}
	if body.FatTargetG != nil {
		setClauses = append(setClauses, "fat_target_g = @fatTargetG")
		args["fatTargetG"] = *body.FatTargetG
	}
	if body.BreakfastBudget != nil {
		setClauses = append(setClauses, "breakfast_budget = @breakfastBudget")
		args["breakfastBudget"] = *body.BreakfastBudget
	}
	if body.LunchBudget != nil {
		setClauses = append(setClauses, "lunch_budget = @lunchBudget")
		args["lunchBudget"] = *body.LunchBudget
	}
	if body.DinnerBudget != nil {
		setClauses = append(setClauses, "dinner_budget = @dinnerBudget")
		args["dinnerBudget"] = *body.DinnerBudget
	}
	if body.SnackBudget != nil {
		setClauses = append(setClauses, "snack_budget = @snackBudget")
		args["snackBudget"] = *body.SnackBudget
	}
	if body.ExerciseTargetCalories != nil {
		setClauses = append(setClauses, "exercise_target_calories = @exerciseTargetCalories")
		args["exerciseTargetCalories"] = *body.ExerciseTargetCalories
	}
	if body.Sex != nil {
		setClauses = append(setClauses, "sex = @sex")
		args["sex"] = *body.Sex
	}
	if body.DateOfBirth != nil {
		setClauses = append(setClauses, "date_of_birth = @dateOfBirth")
		args["dateOfBirth"] = *body.DateOfBirth
	}
	if body.HeightCM != nil {
		setClauses = append(setClauses, "height_cm = @heightCM")
		args["heightCM"] = *body.HeightCM
	}
	if body.WeightLBS != nil {
		setClauses = append(setClauses, "weight_lbs = @weightLBS")
		args["weightLBS"] = *body.WeightLBS
	}
	if body.ActivityLevel != nil {
		setClauses = append(setClauses, "activity_level = @activityLevel")
		args["activityLevel"] = *body.ActivityLevel
	}
	if body.TargetWeightLBS != nil {
		setClauses = append(setClauses, "target_weight_lbs = @targetWeightLBS")
		args["targetWeightLBS"] = *body.TargetWeightLBS
	}
	if body.TargetDate != nil {
		setClauses = append(setClauses, "target_date = @targetDate")
		args["targetDate"] = *body.TargetDate
	}
	if body.Units != nil {
		setClauses = append(setClauses, "units = @units")
		args["units"] = *body.Units
	}
	if body.BudgetAuto != nil {
		setClauses = append(setClauses, "budget_auto = @budgetAuto")
		args["budgetAuto"] = *body.BudgetAuto
	}
	if body.SetupComplete != nil {
		setClauses = append(setClauses, "setup_complete = @setupComplete")
		args["setupComplete"] = *body.SetupComplete
	}

	if len(setClauses) == 0 {
		apiError(c, http.StatusBadRequest, "no fields to update")
		return
	}

	query := "UPDATE calorie_log_user_settings SET " +
		strings.Join(setClauses, ", ") +
		" WHERE user_id = @userID RETURNING *"

	s, err := queryOne[calorieLogUserSettings](h.db, c, query, args)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to update settings")
		return
	}

	// If budget_auto is on, compute TDEE and persist the resulting calorie_budget
	if s.BudgetAuto {
		if _, _, budget, _, ok := computeTDEE(&s); ok {
			updated, err := queryOne[calorieLogUserSettings](h.db, c,
				"UPDATE calorie_log_user_settings SET calorie_budget = @budget WHERE user_id = @userID RETURNING *",
				pgx.NamedArgs{"budget": budget, "userID": userID})
			if err == nil {
				s = updated
			}
		}
	}

	// Populate computed TDEE fields for the response
	if bmr, tdee, budget, pace, ok := computeTDEE(&s); ok {
		s.ComputedBMR = &bmr
		s.ComputedTDEE = &tdee
		s.ComputedBudget = &budget
		s.PaceLbsPerWeek = &pace
	}

	c.JSON(http.StatusOK, s)
}

func (h *Handler) getHabits(c *gin.Context) {
	habits, err := queryMany[habit](h.db, c, "SELECT * FROM habits", pgx.NamedArgs{})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch habits")
		return
	}

	c.JSON(http.StatusOK, habits)
}

func (h *Handler) postHabit(c *gin.Context) {
	var newHabit habit
	if err := c.ShouldBindJSON(&newHabit); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	c.JSON(http.StatusCreated, newHabit)
}

/* ─── Server setup ────────────────────────────────────────────────────── */

// getDBPool creates a connection pool. We use a pool (not a single conn) because
// Neon closes idle connections after ~5 minutes.
func getDBPool() *pgxpool.Pool {
	config, err := pgxpool.ParseConfig(os.Getenv("DB_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to parse DB URL: %v\n", err)
		os.Exit(1)
	}
	// Use simple query protocol to avoid "cached plan must not change result type"
	// errors from Neon's server-side prepared statement cache after schema changes.
	config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("DB pool ready!")
	return pool
}

func main() {
	log.SetPrefix("stride-api: ")
	log.SetFlags(0)

	// Load .env for local development. In production (Railway) env vars are
	// injected directly, so a missing file is not an error.
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	pool := getDBPool()
	defer pool.Close()
	handler := Handler{db: pool}

	router := gin.Default()
	router.SetTrustedProxies(nil)

	// Public routes
	router.POST("/api/login", handler.login)

	// Authenticated routes
	api := router.Group("/api", handler.authMiddleware())
	api.GET("/habits", handler.getHabits)
	api.POST("/habits", handler.postHabit)
	api.GET("/calorie-log/daily", handler.getDailySummary)
	api.GET("/calorie-log/week-summary", handler.getWeekSummary)
	api.POST("/calorie-log/items", handler.createCalorieLogItem)
	api.PUT("/calorie-log/items/:id", handler.updateCalorieLogItem)
	api.DELETE("/calorie-log/items/:id", handler.deleteCalorieLogItem)
	api.GET("/calorie-log/user-settings", handler.getUserSettings)
	api.PATCH("/calorie-log/user-settings", handler.patchUserSettings)

	// Serve the embedded React frontend for all non-/api routes.
	// Files with extensions (JS, CSS, images, etc.) are served directly from the FS.
	// Everything else serves index.html so react-router handles client-side navigation.
	// Avoids http.FileServer to prevent redirect loops on directory paths like "/".
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal("failed to create static sub-FS: ", err)
	}
	// Read index.html once at startup for the SPA fallback.
	indexHTML, err := fs.ReadFile(staticFS, "index.html")
	if err != nil {
		log.Println("Warning: index.html not found in embedded static files (expected in production)")
	}
	router.NoRoute(func(c *gin.Context) {
		path := strings.TrimPrefix(c.Request.URL.Path, "/")
		// Serve files with an extension (JS, CSS, images, etc.) directly from the FS.
		if strings.Contains(path, ".") {
			c.FileFromFS(path, http.FS(staticFS))
			return
		}
		// SPA route — send index.html bytes directly. We avoid c.FileFromFS("index.html")
		// because Go's http.FileServer always redirects /index.html → ./ causing a loop.
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	})

	// PORT is injected by Railway in production; default to 3000 for local dev.
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	router.Run(":" + port)
}
