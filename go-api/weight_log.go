package main

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// getWeightLog returns weight entries for the authenticated user within [start, end].
// GET /api/weight-log?start=YYYY-MM-DD&end=YYYY-MM-DD. Both params required.
// Returns an empty array (not null) if no entries exist in the range.
func (h *Handler) getWeightLog(c *gin.Context) {
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

	entries, err := queryMany[weightEntry](h.db, c,
		`SELECT * FROM weight_log
		 WHERE user_id = @userID AND date >= @start AND date <= @end
		 ORDER BY date ASC`,
		pgx.NamedArgs{"userID": userID, "start": start, "end": end})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch weight log")
		return
	}
	// Ensure empty array (not null) in JSON
	if entries == nil {
		entries = []weightEntry{}
	}

	c.JSON(http.StatusOK, entries)
}

// upsertWeightEntry creates or updates the weight entry for the given date.
// POST /api/weight-log. Body: { "date": "YYYY-MM-DD", "weight_lbs": 185.5 }.
// The UNIQUE(user_id, date) constraint means posting the same date updates in place.
func (h *Handler) upsertWeightEntry(c *gin.Context) {
	userID := c.GetInt("user_id")

	var body struct {
		Date      string  `json:"date"`
		WeightLBS float64 `json:"weight_lbs"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Date == "" {
		apiError(c, http.StatusBadRequest, "date is required")
		return
	}
	if _, err := time.Parse("2006-01-02", body.Date); err != nil {
		apiError(c, http.StatusBadRequest, "invalid date, expected YYYY-MM-DD")
		return
	}
	if body.WeightLBS <= 0 || body.WeightLBS > 9999.9 {
		apiError(c, http.StatusBadRequest, "weight_lbs must be between 0 and 9999.9")
		return
	}

	entry, err := queryOne[weightEntry](h.db, c,
		`INSERT INTO weight_log (user_id, date, weight_lbs)
		 VALUES (@userID, @date, @weightLBS)
		 ON CONFLICT (user_id, date) DO UPDATE SET weight_lbs = EXCLUDED.weight_lbs
		 RETURNING *`,
		pgx.NamedArgs{"userID": userID, "date": body.Date, "weightLBS": body.WeightLBS})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to upsert weight entry")
		return
	}

	c.JSON(http.StatusCreated, entry)
}

// updateWeightEntry partially updates an existing weight entry.
// PUT /api/weight-log/:id. Body: { "date"?, "weight_lbs"? }.
// Uses COALESCE so omitted fields keep their current values (same pattern as updateCalorieLogItem).
func (h *Handler) updateWeightEntry(c *gin.Context) {
	userID := c.GetInt("user_id")
	id := c.Param("id")

	var body struct {
		Date      *string  `json:"date"`
		WeightLBS *float64 `json:"weight_lbs"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Date != nil {
		if _, err := time.Parse("2006-01-02", *body.Date); err != nil {
			apiError(c, http.StatusBadRequest, "invalid date, expected YYYY-MM-DD")
			return
		}
	}
	if body.WeightLBS != nil && (*body.WeightLBS <= 0 || *body.WeightLBS > 9999.9) {
		apiError(c, http.StatusBadRequest, "weight_lbs must be between 0 and 9999.9")
		return
	}

	entry, err := queryOne[weightEntry](h.db, c,
		`UPDATE weight_log SET
			date       = COALESCE(@date, date),
			weight_lbs = COALESCE(@weightLBS, weight_lbs)
		 WHERE id = @id AND user_id = @userID
		 RETURNING *`,
		pgx.NamedArgs{"id": id, "userID": userID, "date": body.Date, "weightLBS": body.WeightLBS})
	if err != nil {
		// Distinguish a missing row from a real DB failure so callers get an
		// actionable status code rather than a misleading 404.
		if errors.Is(err, pgx.ErrNoRows) {
			apiError(c, http.StatusNotFound, "weight entry not found")
		} else {
			apiError(c, http.StatusInternalServerError, "failed to update weight entry")
		}
		return
	}

	c.JSON(http.StatusOK, entry)
}

// deleteWeightEntry removes a weight log entry by ID.
// DELETE /api/weight-log/:id. Returns 204 on success, 404 if not found.
// Ownership is enforced by requiring both id and user_id to match.
func (h *Handler) deleteWeightEntry(c *gin.Context) {
	userID := c.GetInt("user_id")
	id := c.Param("id")

	result, err := h.db.Exec(c,
		"DELETE FROM weight_log WHERE id = @id AND user_id = @userID",
		pgx.NamedArgs{"id": id, "userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to delete weight entry")
		return
	}
	if result.RowsAffected() == 0 {
		apiError(c, http.StatusNotFound, "weight entry not found")
		return
	}

	c.Status(http.StatusNoContent)
}
