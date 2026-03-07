package main

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

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

	populateComputedTDEE(&s)

	c.JSON(http.StatusOK, s)
}

// shouldRecordConfigHistory returns true if the patch request contains a change
// to calorie_budget or activity_level that differs from the current settings.
// Extracted as a pure function so it can be unit-tested without a DB.
func shouldRecordConfigHistory(body patchUserSettingsRequest, cur *calorieLogUserSettings) bool {
	if body.CalorieBudget != nil && *body.CalorieBudget != cur.CalorieBudget {
		return true
	}
	if body.ActivityLevel != nil {
		if cur.ActivityLevel == nil || *body.ActivityLevel != *cur.ActivityLevel {
			return true
		}
	}
	return false
}

// patchUserSettings updates only the provided calorie log settings fields.
// PATCH /api/calorie-log/user-settings. Uses pointer fields in the request body
// to distinguish "not provided" from zero — only non-nil fields get updated.
// When budget_auto is true after the update, the calorie_budget is overwritten
// with the TDEE-derived value if all required profile fields are present.
func (h *Handler) patchUserSettings(c *gin.Context) {
	userID := c.GetInt("user_id")

	var body patchUserSettingsRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate activity_level before saving — an unknown level silently breaks
	// all future TDEE auto-budget calculations with no visible error.
	if body.ActivityLevel != nil {
		if _, ok := activityMultipliers[*body.ActivityLevel]; !ok {
			apiError(c, http.StatusBadRequest, "activity_level must be one of: sedentary, light, moderate, active, very_active")
			return
		}
	}

	// If calorie_budget or activity_level is changing, snapshot the current values
	// into calorie_config_history before overwriting them. This lets the progress
	// endpoint resolve the correct budget/activity for any historical date.
	if body.CalorieBudget != nil || body.ActivityLevel != nil {
		cur, err := queryOne[calorieLogUserSettings](h.db, c,
			"SELECT * FROM calorie_log_user_settings WHERE user_id = @userID",
			pgx.NamedArgs{"userID": userID})
		if err != nil {
			log.Printf("[patchUserSettings] could not fetch current settings for history check (user %d): %v", userID, err)
		} else if !shouldRecordConfigHistory(body, &cur) {
			log.Printf("[patchUserSettings] skipping history record for user %d — values unchanged", userID)
		} else {
			yesterday := time.Now().UTC().Truncate(24 * time.Hour).AddDate(0, 0, -1)
			log.Printf("[patchUserSettings] writing config history for user %d: valid_until=%s budget=%d activity=%v",
				userID, yesterday.Format("2006-01-02"), cur.CalorieBudget, cur.ActivityLevel)
			_, histErr := h.db.Exec(c,
				`INSERT INTO calorie_config_history (user_id, valid_until, calorie_budget, activity_level)
				 VALUES (@userID, @validUntil, @calorieBudget, @activityLevel)
				 ON CONFLICT (user_id, valid_until) DO UPDATE
				   SET calorie_budget  = EXCLUDED.calorie_budget,
				       activity_level = EXCLUDED.activity_level`,
				pgx.NamedArgs{
					"userID":        userID,
					"validUntil":    yesterday.Format("2006-01-02"),
					"calorieBudget": cur.CalorieBudget,
					"activityLevel": cur.ActivityLevel,
				})
			if histErr != nil {
				// Non-fatal: log and continue — history is best-effort
				log.Printf("[patchUserSettings] failed to write config history for user %d: %v", userID, histErr)
			} else {
				log.Printf("[patchUserSettings] config history written for user %d", userID)
			}
		}
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

	// If budget_auto is on, compute TDEE and persist the resulting calorie_budget.
	// If the derived budget differs from the pre-update value, snapshot the old
	// budget into calorie_config_history so historical progress queries stay accurate.
	if s.BudgetAuto {
		if _, _, budget, _, ok := computeTDEE(&s); ok {
			oldBudget := s.CalorieBudget
			updated, err := queryOne[calorieLogUserSettings](h.db, c,
				"UPDATE calorie_log_user_settings SET calorie_budget = @budget WHERE user_id = @userID RETURNING *",
				pgx.NamedArgs{"budget": budget, "userID": userID})
			if err != nil {
				log.Printf("[patchUserSettings] auto-budget update failed for user %d: %v", userID, err)
			} else {
				s = updated
				// Record history when the auto-computed budget actually changed.
				if s.CalorieBudget != oldBudget {
					yesterday := time.Now().UTC().Truncate(24 * time.Hour).AddDate(0, 0, -1)
					log.Printf("[patchUserSettings] auto-budget changed for user %d (%d → %d), writing history valid_until=%s",
						userID, oldBudget, s.CalorieBudget, yesterday.Format("2006-01-02"))
					_, histErr := h.db.Exec(c,
						`INSERT INTO calorie_config_history (user_id, valid_until, calorie_budget, activity_level)
						 VALUES (@userID, @validUntil, @calorieBudget, @activityLevel)
						 ON CONFLICT (user_id, valid_until) DO UPDATE
						   SET calorie_budget  = EXCLUDED.calorie_budget,
						       activity_level = EXCLUDED.activity_level`,
						pgx.NamedArgs{
							"userID":        userID,
							"validUntil":    yesterday.Format("2006-01-02"),
							"calorieBudget": oldBudget,
							"activityLevel": s.ActivityLevel,
						})
					if histErr != nil {
						log.Printf("[patchUserSettings] failed to write auto-budget history for user %d: %v", userID, histErr)
					}
				}
			}
		}
	}

	populateComputedTDEE(&s)

	c.JSON(http.StatusOK, s)
}
