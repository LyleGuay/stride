package main

import (
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// validMealPlanEntryTypes is the set of allowed values for the meal_plan_entry_type enum.
var validMealPlanEntryTypes = map[string]bool{
	"food":    true,
	"takeout": true,
	"recipe":  true,
}

// validMealPlanMealTypes is the set of allowed values for the meal_plan_meal_type enum.
var validMealPlanMealTypes = map[string]bool{
	"breakfast": true,
	"lunch":     true,
	"dinner":    true,
	"snack":     true,
}

// getMealPlanEntries returns meal plan entries for a given date or week.
// GET /api/meal-plan/entries?date=YYYY-MM-DD  → entries for a single day.
// GET /api/meal-plan/entries?week_start=YYYY-MM-DD → entries for Mon–Sun of that week.
func (h *Handler) getMealPlanEntries(c *gin.Context) {
	userID := c.GetInt("user_id")
	dateParam := c.Query("date")
	weekStartParam := c.Query("week_start")

	if dateParam == "" && weekStartParam == "" {
		apiError(c, http.StatusBadRequest, "date or week_start query param is required")
		return
	}

	var entries []mealPlanEntry
	var err error

	if dateParam != "" {
		if _, err := time.Parse("2006-01-02", dateParam); err != nil {
			apiError(c, http.StatusBadRequest, "invalid date, expected YYYY-MM-DD")
			return
		}
		entries, err = queryMany[mealPlanEntry](h.db, c,
			`SELECT * FROM meal_plan_entries
			 WHERE user_id = @userID AND date = @date
			 ORDER BY meal_type, sort_order`,
			pgx.NamedArgs{"userID": userID, "date": dateParam})
	} else {
		weekStart, parseErr := time.Parse("2006-01-02", weekStartParam)
		if parseErr != nil {
			apiError(c, http.StatusBadRequest, "invalid week_start, expected YYYY-MM-DD")
			return
		}
		weekEnd := weekStart.AddDate(0, 0, 6)
		entries, err = queryMany[mealPlanEntry](h.db, c,
			`SELECT * FROM meal_plan_entries
			 WHERE user_id = @userID AND date >= @weekStart AND date <= @weekEnd
			 ORDER BY date ASC, meal_type, sort_order`,
			pgx.NamedArgs{
				"userID":    userID,
				"weekStart": weekStartParam,
				"weekEnd":   weekEnd.Format("2006-01-02"),
			})
	}

	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch entries")
		return
	}
	// Always return an array, never null.
	if entries == nil {
		entries = []mealPlanEntry{}
	}

	c.JSON(http.StatusOK, entries)
}

// createMealPlanEntry inserts a new meal plan entry.
// POST /api/meal-plan/entries.
// For recipe entries, looks up the recipe, rejects if calories are null, and
// snapshots calories/macros scaled to the requested servings at save time.
func (h *Handler) createMealPlanEntry(c *gin.Context) {
	userID := c.GetInt("user_id")

	var body createMealPlanEntryRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if !validMealPlanMealTypes[body.MealType] {
		apiError(c, http.StatusBadRequest, "meal_type must be one of: breakfast, lunch, dinner, snack")
		return
	}
	if !validMealPlanEntryTypes[body.EntryType] {
		apiError(c, http.StatusBadRequest, "entry_type must be one of: food, takeout, recipe")
		return
	}
	if body.Date == "" {
		body.Date = time.Now().Format("2006-01-02")
	}

	// Validate required fields per entry type.
	switch body.EntryType {
	case "food":
		if body.ItemName == nil || *body.ItemName == "" {
			apiError(c, http.StatusBadRequest, "item_name is required for food entries")
			return
		}
		if body.Calories == nil {
			apiError(c, http.StatusBadRequest, "calories is required for food entries")
			return
		}
	case "takeout":
		if body.TakeoutName == nil || *body.TakeoutName == "" {
			apiError(c, http.StatusBadRequest, "takeout_name is required for takeout entries")
			return
		}
		if body.CalorieLimit == nil {
			apiError(c, http.StatusBadRequest, "calorie_limit is required for takeout entries")
			return
		}
	case "recipe":
		if body.RecipeID == nil {
			apiError(c, http.StatusBadRequest, "recipe_id is required for recipe entries")
			return
		}
		if body.Servings == nil || *body.Servings <= 0 {
			apiError(c, http.StatusBadRequest, "servings must be a positive number for recipe entries")
			return
		}
	}

	// For recipe entries: fetch the recipe, validate it has calories, then snapshot
	// calories/macros scaled by (servings / recipe.servings) at save time.
	if body.EntryType == "recipe" {
		rec, err := queryOne[recipe](h.db, c,
			`SELECT * FROM recipes WHERE id = @id AND user_id = @userID`,
			pgx.NamedArgs{"id": *body.RecipeID, "userID": userID})
		if err != nil {
			apiError(c, http.StatusNotFound, "recipe not found")
			return
		}
		if rec.Calories == nil {
			apiError(c, http.StatusBadRequest, "recipe has no calorie data; add calories to the recipe before planning with it")
			return
		}

		// Scale macros to requested servings. Only calories is required; protein/carbs/fat
		// are stored as-is if the recipe has them, otherwise kept null.
		scale := *body.Servings / rec.Servings
		scaledCalories := int(math.Round(float64(*rec.Calories) * scale))
		body.Calories = &scaledCalories
		body.ItemName = &rec.Name
		if rec.ProteinG != nil {
			v := *rec.ProteinG * scale
			body.ProteinG = &v
		}
		if rec.CarbsG != nil {
			v := *rec.CarbsG * scale
			body.CarbsG = &v
		}
		if rec.FatG != nil {
			v := *rec.FatG * scale
			body.FatG = &v
		}
	}

	// Compute sort_order = MAX(sort_order) + 1 within (user_id, date, meal_type).
	// COALESCE handles the empty-cell case (MAX returns NULL when no rows exist).
	sortOrderRow, _ := queryOne[struct {
		Max int `db:"max"`
	}](h.db, c,
		`SELECT COALESCE(MAX(sort_order), -1) AS max
		 FROM meal_plan_entries
		 WHERE user_id = @userID AND date = @date AND meal_type = @mealType`,
		pgx.NamedArgs{"userID": userID, "date": body.Date, "mealType": body.MealType})
	sortOrder := sortOrderRow.Max + 1

	entry, err := queryOne[mealPlanEntry](h.db, c,
		`INSERT INTO meal_plan_entries
		 (user_id, date, meal_type, entry_type, sort_order,
		  item_name, qty, uom, calories, protein_g, carbs_g, fat_g,
		  recipe_id, servings, takeout_name, calorie_limit, no_snacks, no_sides)
		 VALUES
		 (@userID, @date, @mealType, @entryType, @sortOrder,
		  @itemName, @qty, @uom, @calories, @proteinG, @carbsG, @fatG,
		  @recipeID, @servings, @takeoutName, @calorieLimit, @noSnacks, @noSides)
		 RETURNING *`,
		pgx.NamedArgs{
			"userID": userID, "date": body.Date, "mealType": body.MealType,
			"entryType": body.EntryType, "sortOrder": sortOrder,
			"itemName": body.ItemName, "qty": body.Qty, "uom": body.Uom,
			"calories": body.Calories, "proteinG": body.ProteinG,
			"carbsG": body.CarbsG, "fatG": body.FatG,
			"recipeID": body.RecipeID, "servings": body.Servings,
			"takeoutName": body.TakeoutName, "calorieLimit": body.CalorieLimit,
			"noSnacks": body.NoSnacks, "noSides": body.NoSides,
		})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to create entry")
		return
	}

	c.JSON(http.StatusCreated, entry)
}

// updateMealPlanEntry updates an existing meal plan entry.
// PUT /api/meal-plan/entries/:id. Uses COALESCE so omitted fields keep their current value.
// Pointer booleans (no_snacks, no_sides) allow explicit false updates via COALESCE.
func (h *Handler) updateMealPlanEntry(c *gin.Context) {
	userID := c.GetInt("user_id")
	id := c.Param("id")

	var body updateMealPlanEntryRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.MealType != nil && !validMealPlanMealTypes[*body.MealType] {
		apiError(c, http.StatusBadRequest, "meal_type must be one of: breakfast, lunch, dinner, snack")
		return
	}
	if body.EntryType != nil && !validMealPlanEntryTypes[*body.EntryType] {
		apiError(c, http.StatusBadRequest, "entry_type must be one of: food, takeout, recipe")
		return
	}

	entry, err := queryOne[mealPlanEntry](h.db, c,
		`UPDATE meal_plan_entries SET
			meal_type     = COALESCE(@mealType, meal_type),
			entry_type    = COALESCE(@entryType, entry_type),
			sort_order    = COALESCE(@sortOrder, sort_order),
			item_name     = COALESCE(@itemName, item_name),
			qty           = COALESCE(@qty, qty),
			uom           = COALESCE(@uom, uom),
			calories      = COALESCE(@calories, calories),
			protein_g     = COALESCE(@proteinG, protein_g),
			carbs_g       = COALESCE(@carbsG, carbs_g),
			fat_g         = COALESCE(@fatG, fat_g),
			recipe_id     = COALESCE(@recipeID, recipe_id),
			servings      = COALESCE(@servings, servings),
			takeout_name  = COALESCE(@takeoutName, takeout_name),
			calorie_limit = COALESCE(@calorieLimit, calorie_limit),
			no_snacks     = COALESCE(@noSnacks, no_snacks),
			no_sides      = COALESCE(@noSides, no_sides),
			updated_at    = now()
		 WHERE id = @id AND user_id = @userID
		 RETURNING *`,
		pgx.NamedArgs{
			"id": id, "userID": userID,
			"mealType": body.MealType, "entryType": body.EntryType,
			"sortOrder": body.SortOrder,
			"itemName": body.ItemName, "qty": body.Qty, "uom": body.Uom,
			"calories": body.Calories, "proteinG": body.ProteinG,
			"carbsG": body.CarbsG, "fatG": body.FatG,
			"recipeID": body.RecipeID, "servings": body.Servings,
			"takeoutName": body.TakeoutName, "calorieLimit": body.CalorieLimit,
			"noSnacks": body.NoSnacks, "noSides": body.NoSides,
		})
	if err != nil {
		apiError(c, http.StatusNotFound, "entry not found")
		return
	}

	c.JSON(http.StatusOK, entry)
}

// deleteMealPlanEntry removes a meal plan entry. Returns 204 on success.
// DELETE /api/meal-plan/entries/:id.
func (h *Handler) deleteMealPlanEntry(c *gin.Context) {
	userID := c.GetInt("user_id")
	id := c.Param("id")

	result, err := h.db.Exec(c,
		"DELETE FROM meal_plan_entries WHERE id = @id AND user_id = @userID",
		pgx.NamedArgs{"id": id, "userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to delete entry")
		return
	}
	if result.RowsAffected() == 0 {
		apiError(c, http.StatusNotFound, "entry not found")
		return
	}

	c.Status(http.StatusNoContent)
}

// copyMealPlanWeek copies entries from a source week into a target week.
// POST /api/meal-plan/copy-week.
// Accepts a filter of days (0=Mon…6=Sun) and meal_types to copy; empty slices = copy all.
// Existing entries in the target week are not removed — copies are added alongside them.
func (h *Handler) copyMealPlanWeek(c *gin.Context) {
	userID := c.GetInt("user_id")

	var body copyWeekInput
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	sourceWeek, err := time.Parse("2006-01-02", body.SourceWeek)
	if err != nil {
		apiError(c, http.StatusBadRequest, "invalid source_week, expected YYYY-MM-DD")
		return
	}
	if _, err := time.Parse("2006-01-02", body.TargetWeek); err != nil {
		apiError(c, http.StatusBadRequest, "invalid target_week, expected YYYY-MM-DD")
		return
	}

	sourceEnd := sourceWeek.AddDate(0, 0, 6)

	// Fetch all entries from the source week.
	sourceEntries, err := queryMany[mealPlanEntry](h.db, c,
		`SELECT * FROM meal_plan_entries
		 WHERE user_id = @userID AND date >= @weekStart AND date <= @weekEnd
		 ORDER BY date ASC, meal_type, sort_order`,
		pgx.NamedArgs{
			"userID":    userID,
			"weekStart": body.SourceWeek,
			"weekEnd":   sourceEnd.Format("2006-01-02"),
		})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch source entries")
		return
	}

	// Build fast lookup sets. Empty slice = no filter (copy all).
	daySet := make(map[int]bool, len(body.Days))
	for _, d := range body.Days {
		daySet[d] = true
	}
	mealTypeSet := make(map[string]bool, len(body.MealTypes))
	for _, mt := range body.MealTypes {
		mealTypeSet[mt] = true
	}

	// Parse target week to compute the date offset from source.
	targetWeek, _ := time.Parse("2006-01-02", body.TargetWeek)
	weekOffsetDays := int(targetWeek.Sub(sourceWeek).Hours() / 24)

	var created []mealPlanEntry
	for _, src := range sourceEntries {
		// Convert time.Weekday (Sun=0, Mon=1…Sat=6) to our 0=Mon…6=Sun convention.
		dayOfWeek := (int(src.Date.Weekday()) + 6) % 7

		if len(daySet) > 0 && !daySet[dayOfWeek] {
			continue
		}
		if len(mealTypeSet) > 0 && !mealTypeSet[src.MealType] {
			continue
		}

		targetDate := src.Date.AddDate(0, 0, weekOffsetDays).Format("2006-01-02")

		entry, err := queryOne[mealPlanEntry](h.db, c,
			`INSERT INTO meal_plan_entries
			 (user_id, date, meal_type, entry_type, sort_order,
			  item_name, qty, uom, calories, protein_g, carbs_g, fat_g,
			  recipe_id, servings, takeout_name, calorie_limit, no_snacks, no_sides)
			 VALUES
			 (@userID, @date, @mealType, @entryType, @sortOrder,
			  @itemName, @qty, @uom, @calories, @proteinG, @carbsG, @fatG,
			  @recipeID, @servings, @takeoutName, @calorieLimit, @noSnacks, @noSides)
			 RETURNING *`,
			pgx.NamedArgs{
				"userID": userID, "date": targetDate,
				"mealType": src.MealType, "entryType": src.EntryType, "sortOrder": src.SortOrder,
				"itemName": src.ItemName, "qty": src.Qty, "uom": src.Uom,
				"calories": src.Calories, "proteinG": src.ProteinG,
				"carbsG": src.CarbsG, "fatG": src.FatG,
				"recipeID": src.RecipeID, "servings": src.Servings,
				"takeoutName": src.TakeoutName, "calorieLimit": src.CalorieLimit,
				"noSnacks": src.NoSnacks, "noSides": src.NoSides,
			})
		if err != nil {
			apiError(c, http.StatusInternalServerError, "failed to copy entry")
			return
		}
		created = append(created, entry)
	}

	if created == nil {
		created = []mealPlanEntry{}
	}

	c.JSON(http.StatusCreated, created)
}
