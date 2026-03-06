package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

/* ─── Helpers ────────────────────────────────────────────────────────── */

// insertSubLists inserts ingredients, tools, and steps for a recipe within
// an existing transaction. Called by both createRecipe and updateRecipe.
func insertSubLists(tx pgx.Tx, ctx *gin.Context, recipeID int, req createRecipeRequest) error {
	for i, ing := range req.Ingredients {
		if ing.SortOrder == 0 {
			ing.SortOrder = i
		}
		_, err := tx.Exec(ctx,
			`INSERT INTO recipe_ingredients (recipe_id, name, qty, uom, note, sort_order)
			 VALUES (@recipeID, @name, @qty, @uom, @note, @sortOrder)`,
			pgx.NamedArgs{
				"recipeID":  recipeID,
				"name":      ing.Name,
				"qty":       ing.Qty,
				"uom":       ing.Uom,
				"note":      ing.Note,
				"sortOrder": ing.SortOrder,
			})
		if err != nil {
			return err
		}
	}
	for i, tool := range req.Tools {
		if tool.SortOrder == 0 {
			tool.SortOrder = i
		}
		_, err := tx.Exec(ctx,
			`INSERT INTO recipe_tools (recipe_id, name, sort_order)
			 VALUES (@recipeID, @name, @sortOrder)`,
			pgx.NamedArgs{"recipeID": recipeID, "name": tool.Name, "sortOrder": tool.SortOrder})
		if err != nil {
			return err
		}
	}
	for i, step := range req.Steps {
		if step.SortOrder == 0 {
			step.SortOrder = i
		}
		_, err := tx.Exec(ctx,
			`INSERT INTO recipe_steps (recipe_id, type, text, timer_seconds, meanwhile_text, sort_order)
			 VALUES (@recipeID, @type, @text, @timerSeconds, @meanwhileText, @sortOrder)`,
			pgx.NamedArgs{
				"recipeID":      recipeID,
				"type":          step.Type,
				"text":          step.Text,
				"timerSeconds":  step.TimerSeconds,
				"meanwhileText": step.MeanwhileText,
				"sortOrder":     step.SortOrder,
			})
		if err != nil {
			return err
		}
	}
	return nil
}

// fetchRecipeDetail loads the full recipe + sub-lists for the given recipe ID.
func fetchRecipeDetail(h *Handler, c *gin.Context, id int) (recipeDetail, error) {
	r, err := queryOne[recipe](h.db, c,
		`SELECT * FROM recipes WHERE id = @id`,
		pgx.NamedArgs{"id": id})
	if err != nil {
		return recipeDetail{}, err
	}

	ingredients, err := queryMany[recipeIngredient](h.db, c,
		`SELECT * FROM recipe_ingredients WHERE recipe_id = @id ORDER BY sort_order`,
		pgx.NamedArgs{"id": id})
	if err != nil {
		return recipeDetail{}, err
	}
	if ingredients == nil {
		ingredients = []recipeIngredient{}
	}

	tools, err := queryMany[recipeTool](h.db, c,
		`SELECT * FROM recipe_tools WHERE recipe_id = @id ORDER BY sort_order`,
		pgx.NamedArgs{"id": id})
	if err != nil {
		return recipeDetail{}, err
	}
	if tools == nil {
		tools = []recipeTool{}
	}

	steps, err := queryMany[recipeStep](h.db, c,
		`SELECT * FROM recipe_steps WHERE recipe_id = @id ORDER BY sort_order`,
		pgx.NamedArgs{"id": id})
	if err != nil {
		return recipeDetail{}, err
	}
	if steps == nil {
		steps = []recipeStep{}
	}

	return recipeDetail{
		recipe:      r,
		Ingredients: ingredients,
		Tools:       tools,
		Steps:       steps,
	}, nil
}

/* ─── Handlers ───────────────────────────────────────────────────────── */

// listRecipes returns all recipes for the authenticated user, with computed
// step count and total timer seconds from recipe_steps.
// GET /api/recipes
func (h *Handler) listRecipes(c *gin.Context) {
	userID := c.GetInt("user_id")

	items, err := queryMany[recipeListItem](h.db, c,
		`SELECT r.*,
		   (SELECT COUNT(*)           FROM recipe_steps WHERE recipe_id = r.id) AS step_count,
		   (SELECT COALESCE(SUM(timer_seconds), 0) FROM recipe_steps WHERE recipe_id = r.id AND type = 'timer') AS total_timer_seconds
		 FROM recipes r
		 WHERE r.user_id = @userID
		 ORDER BY r.updated_at DESC`,
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch recipes")
		return
	}
	if items == nil {
		items = []recipeListItem{}
	}
	c.JSON(http.StatusOK, items)
}

// getRecipe returns a full recipe detail by ID.
// GET /api/recipes/:id
func (h *Handler) getRecipe(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		apiError(c, http.StatusBadRequest, "invalid recipe id")
		return
	}

	detail, err := fetchRecipeDetail(h, c, id)
	if err != nil {
		apiError(c, http.StatusNotFound, "recipe not found")
		return
	}
	// Ensure the recipe belongs to this user
	if detail.UserID != userID {
		apiError(c, http.StatusNotFound, "recipe not found")
		return
	}
	c.JSON(http.StatusOK, detail)
}

// createRecipe inserts a new recipe with its ingredients, tools, and steps.
// POST /api/recipes
func (h *Handler) createRecipe(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req createRecipeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	// Default and validate category
	if req.Category == "" {
		req.Category = "other"
	}
	if !validRecipeCategories[req.Category] {
		apiError(c, http.StatusBadRequest, "invalid category")
		return
	}

	servings := 1.0
	if req.Servings != nil {
		servings = *req.Servings
	}

	tx, err := h.db.Begin(c)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(c)

	// Insert the recipe record and get the new ID
	var newID int
	err = tx.QueryRow(c,
		`INSERT INTO recipes (user_id, name, emoji, category, notes, servings, calories, protein_g, carbs_g, fat_g)
		 VALUES (@userID, @name, @emoji, @category, @notes, @servings, @calories, @proteinG, @carbsG, @fatG)
		 RETURNING id`,
		pgx.NamedArgs{
			"userID":   userID,
			"name":     req.Name,
			"emoji":    req.Emoji,
			"category": req.Category,
			"notes":    req.Notes,
			"servings": servings,
			"calories": req.Calories,
			"proteinG": req.ProteinG,
			"carbsG":   req.CarbsG,
			"fatG":     req.FatG,
		}).Scan(&newID)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to create recipe")
		return
	}

	if err := insertSubLists(tx, c, newID, req); err != nil {
		apiError(c, http.StatusInternalServerError, "failed to insert recipe sub-lists")
		return
	}

	if err := tx.Commit(c); err != nil {
		apiError(c, http.StatusInternalServerError, "failed to commit")
		return
	}

	detail, err := fetchRecipeDetail(h, c, newID)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch created recipe")
		return
	}
	c.JSON(http.StatusCreated, detail)
}

// updateRecipe updates a recipe's fields and optionally replaces its sub-lists.
// When ingredients/tools/steps are included in the request, the existing rows are
// deleted and replaced entirely (simplest correct approach for ordered lists).
// PUT /api/recipes/:id
func (h *Handler) updateRecipe(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		apiError(c, http.StatusBadRequest, "invalid recipe id")
		return
	}

	var req updateRecipeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Category != nil && !validRecipeCategories[*req.Category] {
		apiError(c, http.StatusBadRequest, "invalid category")
		return
	}

	tx, err := h.db.Begin(c)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(c)

	// Verify ownership and update fields
	tag, err := tx.Exec(c,
		`UPDATE recipes SET
		   name       = COALESCE(@name, name),
		   emoji      = COALESCE(@emoji, emoji),
		   category   = COALESCE(@category::recipe_category, category),
		   notes      = COALESCE(@notes, notes),
		   servings   = COALESCE(@servings, servings),
		   calories   = COALESCE(@calories, calories),
		   protein_g  = COALESCE(@proteinG, protein_g),
		   carbs_g    = COALESCE(@carbsG, carbs_g),
		   fat_g      = COALESCE(@fatG, fat_g),
		   updated_at = now()
		 WHERE id = @id AND user_id = @userID`,
		pgx.NamedArgs{
			"id": id, "userID": userID,
			"name": req.Name, "emoji": req.Emoji, "category": req.Category,
			"notes": req.Notes, "servings": req.Servings,
			"calories": req.Calories, "proteinG": req.ProteinG,
			"carbsG": req.CarbsG, "fatG": req.FatG,
		})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to update recipe")
		return
	}
	if tag.RowsAffected() == 0 {
		apiError(c, http.StatusNotFound, "recipe not found")
		return
	}

	// Replace sub-lists if provided
	if req.Ingredients != nil {
		if _, err := tx.Exec(c, `DELETE FROM recipe_ingredients WHERE recipe_id = @id`, pgx.NamedArgs{"id": id}); err != nil {
			apiError(c, http.StatusInternalServerError, "failed to update ingredients")
			return
		}
		createReq := createRecipeRequest{Ingredients: *req.Ingredients}
		if err := insertSubLists(tx, c, id, createReq); err != nil {
			apiError(c, http.StatusInternalServerError, "failed to insert ingredients")
			return
		}
	}
	if req.Tools != nil {
		if _, err := tx.Exec(c, `DELETE FROM recipe_tools WHERE recipe_id = @id`, pgx.NamedArgs{"id": id}); err != nil {
			apiError(c, http.StatusInternalServerError, "failed to update tools")
			return
		}
		createReq := createRecipeRequest{Tools: *req.Tools}
		if err := insertSubLists(tx, c, id, createReq); err != nil {
			apiError(c, http.StatusInternalServerError, "failed to insert tools")
			return
		}
	}
	if req.Steps != nil {
		if _, err := tx.Exec(c, `DELETE FROM recipe_steps WHERE recipe_id = @id`, pgx.NamedArgs{"id": id}); err != nil {
			apiError(c, http.StatusInternalServerError, "failed to update steps")
			return
		}
		createReq := createRecipeRequest{Steps: *req.Steps}
		if err := insertSubLists(tx, c, id, createReq); err != nil {
			apiError(c, http.StatusInternalServerError, "failed to insert steps")
			return
		}
	}

	if err := tx.Commit(c); err != nil {
		apiError(c, http.StatusInternalServerError, "failed to commit")
		return
	}

	detail, err := fetchRecipeDetail(h, c, id)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch updated recipe")
		return
	}
	c.JSON(http.StatusOK, detail)
}

// deleteRecipe deletes a recipe. Sub-tables cascade via FK ON DELETE CASCADE.
// DELETE /api/recipes/:id
func (h *Handler) deleteRecipe(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		apiError(c, http.StatusBadRequest, "invalid recipe id")
		return
	}

	tag, err := h.db.Exec(c,
		`DELETE FROM recipes WHERE id = @id AND user_id = @userID`,
		pgx.NamedArgs{"id": id, "userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to delete recipe")
		return
	}
	if tag.RowsAffected() == 0 {
		apiError(c, http.StatusNotFound, "recipe not found")
		return
	}
	c.Status(http.StatusNoContent)
}

// duplicateRecipe copies a recipe and all its sub-lists into a new record.
// POST /api/recipes/:id/duplicate
func (h *Handler) duplicateRecipe(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		apiError(c, http.StatusBadRequest, "invalid recipe id")
		return
	}

	// Load the source recipe (verifies ownership)
	src, err := fetchRecipeDetail(h, c, id)
	if err != nil || src.UserID != userID {
		apiError(c, http.StatusNotFound, "recipe not found")
		return
	}

	tx, err := h.db.Begin(c)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(c)

	// Insert the new recipe record
	var newID int
	copyName := src.Name + " (copy)"
	err = tx.QueryRow(c,
		`INSERT INTO recipes (user_id, name, emoji, category, notes, servings, calories, protein_g, carbs_g, fat_g)
		 VALUES (@userID, @name, @emoji, @category, @notes, @servings, @calories, @proteinG, @carbsG, @fatG)
		 RETURNING id`,
		pgx.NamedArgs{
			"userID":   userID,
			"name":     copyName,
			"emoji":    src.Emoji,
			"category": src.Category,
			"notes":    src.Notes,
			"servings": src.Servings,
			"calories": src.Calories,
			"proteinG": src.ProteinG,
			"carbsG":   src.CarbsG,
			"fatG":     src.FatG,
		}).Scan(&newID)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to duplicate recipe")
		return
	}

	// Convert sub-lists to input types for insertSubLists
	req := createRecipeRequest{}
	for _, ing := range src.Ingredients {
		req.Ingredients = append(req.Ingredients, ingredientInput{
			Name: ing.Name, Qty: ing.Qty, Uom: ing.Uom, Note: ing.Note, SortOrder: ing.SortOrder,
		})
	}
	for _, tool := range src.Tools {
		req.Tools = append(req.Tools, toolInput{Name: tool.Name, SortOrder: tool.SortOrder})
	}
	for _, step := range src.Steps {
		req.Steps = append(req.Steps, stepInput{
			Type: step.Type, Text: step.Text,
			TimerSeconds: step.TimerSeconds, MeanwhileText: step.MeanwhileText,
			SortOrder: step.SortOrder,
		})
	}

	if err := insertSubLists(tx, c, newID, req); err != nil {
		apiError(c, http.StatusInternalServerError, "failed to copy recipe sub-lists")
		return
	}

	if err := tx.Commit(c); err != nil {
		apiError(c, http.StatusInternalServerError, "failed to commit")
		return
	}

	detail, err := fetchRecipeDetail(h, c, newID)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch duplicated recipe")
		return
	}
	c.JSON(http.StatusCreated, detail)
}
