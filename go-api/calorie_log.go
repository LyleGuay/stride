package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// configForDate returns the calorie_budget and activity_level effective on the given
// date by scanning the history slice (sorted ascending by valid_until).
// The first history row whose valid_until >= dateStr covers that date.
// Falls back to current settings when no history row covers the date (i.e. the date
// is after all history records, so current settings apply).
func configForDate(
	history []calorieConfigHistory,
	settings *calorieLogUserSettings,
	dateStr string,
) (calorieBudget int, activityLevel string) {
	for _, h := range history {
		if h.ValidUntil.Format("2006-01-02") >= dateStr {
			al := ""
			if h.ActivityLevel != nil {
				al = *h.ActivityLevel
			} else if settings.ActivityLevel != nil {
				al = *settings.ActivityLevel
			}
			return h.CalorieBudget, al
		}
	}
	// No history covers this date — use current settings.
	al := ""
	if settings.ActivityLevel != nil {
		al = *settings.ActivityLevel
	}
	return settings.CalorieBudget, al
}

// validItemTypes is the set of allowed values for the calorie_log_item_type enum.
// Reject unknown values with 400 rather than letting the DB return a cryptic 500.
var validItemTypes = map[string]bool{
	"breakfast": true,
	"lunch":     true,
	"dinner":    true,
	"snack":     true,
	"exercise":  true,
}

// getDailySummary returns calorie log items and computed totals for a given date.
// GET /api/calorie-log/daily?date=YYYY-MM-DD (defaults to today).
func (h *Handler) getDailySummary(c *gin.Context) {
	userID := c.GetInt("user_id")
	date := c.DefaultQuery("date", time.Now().Format("2006-01-02"))

	// Validate date format before querying — an invalid value silently returns no rows.
	if _, err := time.Parse("2006-01-02", date); err != nil {
		apiError(c, http.StatusBadRequest, "invalid date, expected YYYY-MM-DD")
		return
	}

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

	// Fetch config history and weight log so we can resolve the historically
	// correct budget and TDEE for this date (not just today's values).
	configHistory, _ := queryMany[calorieConfigHistory](h.db, c,
		`SELECT * FROM calorie_config_history WHERE user_id = @userID ORDER BY valid_until ASC`,
		pgx.NamedArgs{"userID": userID})
	weightEntries, _ := queryMany[weightEntry](h.db, c,
		`SELECT * FROM weight_log WHERE user_id = @userID AND date <= @date ORDER BY date ASC`,
		pgx.NamedArgs{"userID": userID, "date": date})

	// Override budget with historically correct value for the requested date.
	historicalBudget, actLevel := configForDate(configHistory, &settings, date)
	settings.CalorieBudget = historicalBudget

	// Populate computed TDEE fields (BMR, budget, pace) using today's profile —
	// then override ComputedTDEE with the historically accurate value so the
	// frontend's daily weight impact card reflects actual TDEE at that date.
	populateComputedTDEE(&settings)

	var fallbackWeight float64
	if settings.WeightLBS != nil {
		fallbackWeight = *settings.WeightLBS
	}
	w := weightAtOrBefore(weightEntries, date, fallbackWeight)
	asOf, _ := time.Parse("2006-01-02", date)
	if dayTDEE, ok := tdeeForDay(&settings, w, actLevel, asOf); ok {
		tdeeInt := int(dayTDEE)
		settings.ComputedTDEE = &tdeeInt
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

// currentMonday is defined in tdee.go.

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

	// Fetch settings, config history, and weight log — needed for per-day budget
	// and TDEE resolution across the 7-day window.
	settings, err := queryOne[calorieLogUserSettings](h.db, c,
		"SELECT * FROM calorie_log_user_settings WHERE user_id = @userID",
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch settings")
		return
	}

	configHistory, _ := queryMany[calorieConfigHistory](h.db, c,
		`SELECT * FROM calorie_config_history WHERE user_id = @userID ORDER BY valid_until ASC`,
		pgx.NamedArgs{"userID": userID})

	weightEntries, _ := queryMany[weightEntry](h.db, c,
		`SELECT * FROM weight_log WHERE user_id = @userID AND date <= @weekEnd ORDER BY date ASC`,
		pgx.NamedArgs{"userID": userID, "weekEnd": weekEnd.Format("2006-01-02")})

	var fallbackWeight float64
	if settings.WeightLBS != nil {
		fallbackWeight = *settings.WeightLBS
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
	// Accumulate TDEE-based deficit for the weekly weight impact estimate.
	result := make([]weekDaySummary, 7)
	var totalDeficit float64
	tdeeAvailable := true
	for i := 0; i < 7; i++ {
		d := weekStart.AddDate(0, 0, i)
		dateStr := d.Format("2006-01-02")
		budget, actLevel := configForDate(configHistory, &settings, dateStr)
		day := weekDaySummary{
			Date:          DateOnly{d},
			CalorieBudget: budget,
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
		day.CaloriesLeft = budget - day.NetCalories

		// Accumulate TDEE-based deficit only for days with logged data.
		if tdeeAvailable && day.HasData {
			w := weightAtOrBefore(weightEntries, dateStr, fallbackWeight)
			asOf, _ := time.Parse("2006-01-02", dateStr)
			if dayTDEE, ok := tdeeForDay(&settings, w, actLevel, asOf); ok {
				totalDeficit += dayTDEE - float64(day.NetCalories)
			} else {
				tdeeAvailable = false
			}
		}
		result[i] = day
	}

	// Compute weekly estimated weight change when TDEE profile is complete.
	var estimatedWC *float64
	dataDays := 0
	for _, d := range result {
		if d.HasData {
			dataDays++
		}
	}
	if tdeeAvailable && dataDays > 0 {
		// 3500 kcal ≈ 1 lb of body fat
		wc := totalDeficit / 3500
		estimatedWC = &wc
	}

	c.JSON(http.StatusOK, weekSummaryResponse{Days: result, EstimatedWeightChangeLbs: estimatedWC})
}

// getProgress returns per-day calorie totals and aggregate stats for an arbitrary date range.
// GET /api/calorie-log/progress?start=YYYY-MM-DD&end=YYYY-MM-DD. Both params required.
// Only days with logged items are returned (no gap-filling — the frontend handles that).
func (h *Handler) getProgress(c *gin.Context) {
	userID := c.GetInt("user_id")
	start := c.Query("start")
	end := c.Query("end")

	if start == "" || end == "" {
		apiError(c, http.StatusBadRequest, "start and end query params are required")
		return
	}
	if _, err := time.Parse("2006-01-02", start); err != nil {
		apiError(c, http.StatusBadRequest, "invalid start, expected YYYY-MM-DD")
		return
	}
	if _, err := time.Parse("2006-01-02", end); err != nil {
		apiError(c, http.StatusBadRequest, "invalid end, expected YYYY-MM-DD")
		return
	}
	if start > end {
		apiError(c, http.StatusBadRequest, "start must not be after end")
		return
	}

	// Get the user's settings, config history, and weight log in parallel via
	// separate queries — all are needed for per-day TDEE and budget resolution.
	settings, err := queryOne[calorieLogUserSettings](h.db, c,
		"SELECT * FROM calorie_log_user_settings WHERE user_id = @userID",
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch settings")
		return
	}

	// Fetch all config history sorted ascending — configForDate scans from oldest
	// to newest to find the first row whose valid_until >= the query date.
	configHistory, _ := queryMany[calorieConfigHistory](h.db, c,
		`SELECT * FROM calorie_config_history WHERE user_id = @userID ORDER BY valid_until ASC`,
		pgx.NamedArgs{"userID": userID})

	// Fetch weight log up to range end with no lower bound so we can find the
	// weight "in effect" at range start even if it was logged before the range.
	weightEntries, _ := queryMany[weightEntry](h.db, c,
		`SELECT * FROM weight_log WHERE user_id = @userID AND date <= @end ORDER BY date ASC`,
		pgx.NamedArgs{"userID": userID, "end": end})

	// Fallback weight when no weight log entry precedes a given day.
	var fallbackWeight float64
	if settings.WeightLBS != nil {
		fallbackWeight = *settings.WeightLBS
	}

	// Query per-day totals across the requested range. Same GROUP BY as getWeekSummary
	// but with arbitrary start/end and no gap-filling.
	rows, err := queryMany[weekDayDBRow](h.db, c,
		`SELECT
			date,
			SUM(CASE WHEN type != 'exercise' THEN calories ELSE 0 END) AS calories_food,
			SUM(CASE WHEN type  = 'exercise' THEN calories ELSE 0 END) AS calories_exercise,
			COALESCE(SUM(protein_g), 0) AS protein_g,
			COALESCE(SUM(carbs_g),   0) AS carbs_g,
			COALESCE(SUM(fat_g),     0) AS fat_g
		 FROM calorie_log_items
		 WHERE user_id = @userID AND date >= @start AND date <= @end
		 GROUP BY date
		 ORDER BY date ASC`,
		pgx.NamedArgs{"userID": userID, "start": start, "end": end})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch progress data")
		return
	}

	// Build weekDaySummary slice (same shape as getWeekSummary) and compute stats.
	// For each day, resolve the historically correct budget and TDEE using config
	// history and the weight log so long-range estimates are accurate.
	days := make([]weekDaySummary, 0, len(rows))
	var stats progressStats
	var totalDeficit float64
	tdeeAvailable := true
	for _, row := range rows {
		dateStr := row.Date.Format("2006-01-02")
		budget, actLevel := configForDate(configHistory, &settings, dateStr)
		net := row.CaloriesFood - row.CaloriesExercise
		left := budget - net
		days = append(days, weekDaySummary{
			Date:             row.Date,
			CalorieBudget:    budget,
			CaloriesFood:     row.CaloriesFood,
			CaloriesExercise: row.CaloriesExercise,
			NetCalories:      net,
			CaloriesLeft:     left,
			ProteinG:         row.ProteinG,
			CarbsG:           row.CarbsG,
			FatG:             row.FatG,
			HasData:          true,
		})
		stats.DaysTracked++
		if net <= budget {
			stats.DaysOnBudget++
		}
		stats.AvgCaloriesFood += row.CaloriesFood
		stats.AvgCaloriesExercise += row.CaloriesExercise
		stats.AvgNetCalories += net
		stats.TotalCaloriesLeft += left

		// Per-day TDEE using historical weight and age at that date.
		if tdeeAvailable {
			asOf, _ := time.Parse("2006-01-02", dateStr)
			w := weightAtOrBefore(weightEntries, dateStr, fallbackWeight)
			if dayTDEE, ok := tdeeForDay(&settings, w, actLevel, asOf); ok {
				totalDeficit += dayTDEE - float64(net)
			} else {
				tdeeAvailable = false
			}
		}
	}

	// Convert totals to averages.
	if stats.DaysTracked > 0 {
		stats.AvgCaloriesFood /= stats.DaysTracked
		stats.AvgCaloriesExercise /= stats.DaysTracked
		stats.AvgNetCalories /= stats.DaysTracked
	}

	// Set TDEE-based weight change estimate when profile is complete.
	// Positive = calorie surplus (gaining), negative = deficit (losing).
	if tdeeAvailable && stats.DaysTracked > 0 {
		// 3500 kcal ≈ 1 lb of body fat; dividing cumulative deficit by this
		// converts total calorie surplus/deficit to estimated lbs gained/lost.
		wc := totalDeficit / 3500
		stats.EstimatedWeightChangeLbs = &wc
	}

	c.JSON(http.StatusOK, progressResponse{Days: days, Stats: stats})
}

// getEarliestLogDate returns the earliest date the user has a calorie log entry.
// GET /api/calorie-log/earliest-date. Used by the frontend to compute the "All Time" range start.
// Returns { "date": "YYYY-MM-DD" } or { "date": null } if no entries exist.
func (h *Handler) getEarliestLogDate(c *gin.Context) {
	userID := c.GetInt("user_id")

	// SELECT MIN returns a nullable date — use *string to handle the NULL case.
	var result struct {
		Date *string `db:"date"`
	}
	rows, err := h.db.Query(c,
		`SELECT TO_CHAR(MIN(date), 'YYYY-MM-DD') AS date
		 FROM calorie_log_items WHERE user_id = @userID`,
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch earliest date")
		return
	}
	defer rows.Close()
	if rows.Next() {
		if err := rows.Scan(&result.Date); err != nil {
			apiError(c, http.StatusInternalServerError, "failed to scan earliest date")
			return
		}
	}
	if err := rows.Err(); err != nil {
		apiError(c, http.StatusInternalServerError, "failed to read earliest date")
		return
	}

	c.JSON(http.StatusOK, gin.H{"date": result.Date})
}

// createCalorieLogItem inserts a new calorie log entry.
// POST /api/calorie-log/items. Defaults date to today if omitted.
func (h *Handler) createCalorieLogItem(c *gin.Context) {
	userID := c.GetInt("user_id")

	var body createCalorieLogItemRequest
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
	// Validate type against the enum; prevents a cryptic 500 from the DB constraint.
	if !validItemTypes[body.Type] {
		apiError(c, http.StatusBadRequest, "type must be one of: breakfast, lunch, dinner, snack, exercise")
		return
	}
	if body.Date == "" {
		body.Date = time.Now().Format("2006-01-02")
	}

	item, err := queryOne[calorieLogItem](h.db, c,
		`INSERT INTO calorie_log_items (user_id, date, item_name, type, qty, uom, calories, protein_g, carbs_g, fat_g, recipe_id)
		 VALUES (@userID, @date, @itemName, @type, @qty, @uom, @calories, @proteinG, @carbsG, @fatG, @recipeID)
		 RETURNING *`,
		pgx.NamedArgs{
			"userID": userID, "date": body.Date, "itemName": body.ItemName,
			"type": body.Type, "qty": body.Qty, "uom": body.Uom,
			"calories": body.Calories, "proteinG": body.ProteinG,
			"carbsG": body.CarbsG, "fatG": body.FatG,
			"recipeID": body.RecipeID,
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
		RecipeID *int     `json:"recipe_id"`
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
			recipe_id = COALESCE(@recipeID, recipe_id),
			updated_at = now()
		 WHERE id = @id AND user_id = @userID
		 RETURNING *`,
		pgx.NamedArgs{
			"id": id, "userID": userID,
			"date": body.Date, "itemName": body.ItemName, "type": body.Type,
			"qty": body.Qty, "uom": body.Uom, "calories": body.Calories,
			"proteinG": body.ProteinG, "carbsG": body.CarbsG, "fatG": body.FatG,
			"recipeID": body.RecipeID,
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
