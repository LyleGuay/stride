package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// listFavorites returns all favorites for the current user, newest first.
func (h *Handler) listFavorites(c *gin.Context) {
	userID := c.GetInt("user_id")
	favs, err := queryMany[calorieLogFavorite](h.db, c, `
		SELECT * FROM calorie_log_favorites
		WHERE user_id = @userID
		ORDER BY id DESC
	`, pgx.NamedArgs{"userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch favorites")
		return
	}
	// Return empty array instead of null when no favorites exist.
	if favs == nil {
		favs = []calorieLogFavorite{}
	}
	c.JSON(http.StatusOK, favs)
}

// createFavorite saves a new favorite template for the current user.
func (h *Handler) createFavorite(c *gin.Context) {
	userID := c.GetInt("user_id")
	var body createFavoriteRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}
	fav, err := queryOne[calorieLogFavorite](h.db, c, `
		INSERT INTO calorie_log_favorites
			(user_id, item_name, type, qty, uom, calories, protein_g, carbs_g, fat_g)
		VALUES
			(@userID, @itemName, @type, @qty, @uom, @calories, @proteinG, @carbsG, @fatG)
		RETURNING *
	`, pgx.NamedArgs{
		"userID":   userID,
		"itemName": body.ItemName,
		"type":     body.Type,
		"qty":      body.Qty,
		"uom":      body.Uom,
		"calories": body.Calories,
		"proteinG": body.ProteinG,
		"carbsG":   body.CarbsG,
		"fatG":     body.FatG,
	})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to create favorite")
		return
	}
	c.JSON(http.StatusCreated, fav)
}

// deleteFavorite removes a favorite by id, scoped to the current user.
func (h *Handler) deleteFavorite(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		apiError(c, http.StatusBadRequest, "invalid id")
		return
	}
	result, err := h.db.Exec(c, `
		DELETE FROM calorie_log_favorites
		WHERE id = @id AND user_id = @userID
	`, pgx.NamedArgs{"id": id, "userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to delete favorite")
		return
	}
	if result.RowsAffected() == 0 {
		apiError(c, http.StatusNotFound, "favorite not found")
		return
	}
	c.Status(http.StatusNoContent)
}
