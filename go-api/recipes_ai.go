package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

/* ─── JSON Schema definitions ────────────────────────────────────────── */

// recipeSchema is the OpenAI json_schema definition for a full recipe response.
// Strict mode requires all properties listed + additionalProperties: false at every level.
var recipeSchema = map[string]interface{}{
	"type": "object",
	"properties": map[string]interface{}{
		"name":     map[string]interface{}{"type": "string"},
		"emoji":    map[string]interface{}{"type": "string"},
		"category": map[string]interface{}{"type": "string", "enum": []string{"breakfast", "lunch", "dinner", "dessert", "snack", "other"}},
		"notes":    map[string]interface{}{"anyOf": []interface{}{map[string]interface{}{"type": "string"}, map[string]interface{}{"type": "null"}}},
		"servings": map[string]interface{}{"type": "number"},
		"calories": map[string]interface{}{"anyOf": []interface{}{map[string]interface{}{"type": "integer"}, map[string]interface{}{"type": "null"}}},
		"protein_g": map[string]interface{}{"anyOf": []interface{}{
			map[string]interface{}{"type": "number"}, map[string]interface{}{"type": "null"}}},
		"carbs_g": map[string]interface{}{"anyOf": []interface{}{
			map[string]interface{}{"type": "number"}, map[string]interface{}{"type": "null"}}},
		"fat_g": map[string]interface{}{"anyOf": []interface{}{
			map[string]interface{}{"type": "number"}, map[string]interface{}{"type": "null"}}},
		"ingredients": map[string]interface{}{
			"type": "array",
			"items": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name":  map[string]interface{}{"type": "string"},
					"qty":   map[string]interface{}{"anyOf": []interface{}{map[string]interface{}{"type": "number"}, map[string]interface{}{"type": "null"}}},
					"uom":   map[string]interface{}{"anyOf": []interface{}{map[string]interface{}{"type": "string"}, map[string]interface{}{"type": "null"}}},
					"note":  map[string]interface{}{"anyOf": []interface{}{map[string]interface{}{"type": "string"}, map[string]interface{}{"type": "null"}}},
					"sort_order": map[string]interface{}{"type": "integer"},
				},
				"required":             []string{"name", "qty", "uom", "note", "sort_order"},
				"additionalProperties": false,
			},
		},
		"tools": map[string]interface{}{
			"type": "array",
			"items": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name":       map[string]interface{}{"type": "string"},
					"sort_order": map[string]interface{}{"type": "integer"},
				},
				"required":             []string{"name", "sort_order"},
				"additionalProperties": false,
			},
		},
		"steps": map[string]interface{}{
			"type": "array",
			"items": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"type":           map[string]interface{}{"type": "string", "enum": []string{"instruction", "timer"}},
					"text":           map[string]interface{}{"type": "string"},
					"timer_seconds":  map[string]interface{}{"anyOf": []interface{}{map[string]interface{}{"type": "integer"}, map[string]interface{}{"type": "null"}}},
					"meanwhile_text": map[string]interface{}{"anyOf": []interface{}{map[string]interface{}{"type": "string"}, map[string]interface{}{"type": "null"}}},
					"sort_order":     map[string]interface{}{"type": "integer"},
				},
				"required":             []string{"type", "text", "timer_seconds", "meanwhile_text", "sort_order"},
				"additionalProperties": false,
			},
		},
	},
	"required":             []string{"name", "emoji", "category", "notes", "servings", "calories", "protein_g", "carbs_g", "fat_g", "ingredients", "tools", "steps"},
	"additionalProperties": false,
}

// nutritionSchema is the OpenAI json_schema for nutrition-only estimates (ai-nutrition endpoint).
var nutritionSchema = map[string]interface{}{
	"type": "object",
	"properties": map[string]interface{}{
		"calories":  map[string]interface{}{"type": "integer"},
		"protein_g": map[string]interface{}{"type": "number"},
		"carbs_g":   map[string]interface{}{"type": "number"},
		"fat_g":     map[string]interface{}{"type": "number"},
	},
	"required":             []string{"calories", "protein_g", "carbs_g", "fat_g"},
	"additionalProperties": false,
}

/* ─── OpenAI helpers ─────────────────────────────────────────────────── */

// callOpenAIModel is like callOpenAI in suggest.go but accepts a model name
// and response_format, allowing callers to use gpt-4o + json_schema.
func callOpenAIModel(ctx *gin.Context, model string, messages []openAIMessage, responseFormat map[string]interface{}, baseURL string) (string, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("OPENAI_API_KEY not set")
	}

	reqBody := openAIRequest{
		Model:          model,
		Messages:       messages,
		Temperature:    0,
		ResponseFormat: responseFormat,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx.Request.Context(), "POST", baseURL+"/v1/chat/completions", strings.NewReader(string(bodyBytes)))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}
	respStr := string(respBytes)

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openai returned status %d: %s", resp.StatusCode, respStr)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal([]byte(respStr), &result); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}
	return result.Choices[0].Message.Content, nil
}

// recipeResponseFormat is the json_schema response format for a full recipe.
var recipeResponseFormat = map[string]interface{}{
	"type": "json_schema",
	"json_schema": map[string]interface{}{
		"name":   "recipe",
		"strict": true,
		"schema": recipeSchema,
	},
}

// nutritionResponseFormat is the json_schema response format for nutrition estimates.
var nutritionResponseFormat = map[string]interface{}{
	"type": "json_schema",
	"json_schema": map[string]interface{}{
		"name":   "nutrition",
		"strict": true,
		"schema": nutritionSchema,
	},
}

/* ─── Request types ──────────────────────────────────────────────────── */

// recipePromptRequest is the body for generate, ai-modify, and ai-copy endpoints.
type recipePromptRequest struct {
	Prompt string `json:"prompt" binding:"required"`
}

/* ─── Handlers ───────────────────────────────────────────────────────── */

// generateRecipe handles POST /api/recipes/generate.
// Calls OpenAI with gpt-4o to create a new recipe from a text prompt,
// inserts it into the DB, and returns the full recipeDetail.
func (h *Handler) generateRecipe(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req recipePromptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apiError(c, http.StatusBadRequest, "prompt is required")
		return
	}

	messages := []openAIMessage{
		{Role: "system", Content: "You are a recipe creator. Given a description or request, create a complete, practical recipe with detailed ingredients, any required tools, and clear step-by-step instructions. Include realistic nutritional estimates per serving. Pick an appropriate emoji for the recipe."},
		{Role: "user", Content: req.Prompt},
	}

	content, err := callOpenAIModel(c, "gpt-4o", messages, recipeResponseFormat, h.openAIBaseURL)
	if err != nil {
		log.Printf("[recipe/generate] OpenAI error: %v", err)
		apiError(c, http.StatusInternalServerError, "ai request failed")
		return
	}

	// Parse AI response into a createRecipeRequest so we can insert it
	var draft createRecipeRequest
	if err := json.Unmarshal([]byte(content), &draft); err != nil {
		log.Printf("[recipe/generate] Failed to parse AI response: %v", err)
		apiError(c, http.StatusInternalServerError, "ai response parse error")
		return
	}

	// Default category if AI returned something invalid
	if !validRecipeCategories[draft.Category] {
		draft.Category = "other"
	}

	// Insert the generated recipe in a transaction
	tx, err := h.db.Begin(c)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(c)

	servings := 1.0
	if draft.Servings != nil {
		servings = *draft.Servings
	}

	var newID int
	err = tx.QueryRow(c,
		`INSERT INTO recipes (user_id, name, emoji, category, notes, servings, calories, protein_g, carbs_g, fat_g)
		 VALUES (@userID, @name, @emoji, @category, @notes, @servings, @calories, @proteinG, @carbsG, @fatG)
		 RETURNING id`,
		pgx.NamedArgs{
			"userID":   userID,
			"name":     draft.Name,
			"emoji":    draft.Emoji,
			"category": draft.Category,
			"notes":    draft.Notes,
			"servings": servings,
			"calories": draft.Calories,
			"proteinG": draft.ProteinG,
			"carbsG":   draft.CarbsG,
			"fatG":     draft.FatG,
		}).Scan(&newID)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to create recipe")
		return
	}

	if err := insertSubLists(tx, c, newID, draft); err != nil {
		apiError(c, http.StatusInternalServerError, "failed to insert recipe sub-lists")
		return
	}

	if err := tx.Commit(c); err != nil {
		apiError(c, http.StatusInternalServerError, "failed to commit")
		return
	}

	detail, err := fetchRecipeDetail(h, c, newID)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch generated recipe")
		return
	}
	c.JSON(http.StatusCreated, detail)
}

// aiModifyRecipe handles POST /api/recipes/:id/ai-modify.
// Sends the current recipe to OpenAI with a modification prompt and returns the
// AI-suggested changes. Nothing is written to the DB — the client applies the
// result to its local draft and must click Save to persist.
func (h *Handler) aiModifyRecipe(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		apiError(c, http.StatusBadRequest, "invalid recipe id")
		return
	}

	var req recipePromptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apiError(c, http.StatusBadRequest, "prompt is required")
		return
	}

	// Load the current recipe to send as context to the AI
	src, err := fetchRecipeDetail(h, c, id)
	if err != nil || src.UserID != userID {
		apiError(c, http.StatusNotFound, "recipe not found")
		return
	}

	// Serialize the current recipe as context for the AI
	currentJSON, err := json.Marshal(src)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to serialize recipe")
		return
	}

	messages := []openAIMessage{
		{Role: "system", Content: "You are a recipe editor. Given an existing recipe (as JSON) and a modification request, return the updated recipe with the requested changes applied. Preserve all fields that are not being modified. Keep the same structure and completeness."},
		{Role: "user", Content: fmt.Sprintf("Current recipe:\n%s\n\nModification request: %s", string(currentJSON), req.Prompt)},
	}

	content, err := callOpenAIModel(c, "gpt-4o", messages, recipeResponseFormat, h.openAIBaseURL)
	if err != nil {
		log.Printf("[recipe/ai-modify] OpenAI error: %v", err)
		apiError(c, http.StatusInternalServerError, "ai request failed")
		return
	}

	// Return the AI response as a draft (caller merges into its local state)
	var draft createRecipeRequest
	if err := json.Unmarshal([]byte(content), &draft); err != nil {
		log.Printf("[recipe/ai-modify] Failed to parse AI response: %v", err)
		apiError(c, http.StatusInternalServerError, "ai response parse error")
		return
	}
	c.JSON(http.StatusOK, draft)
}

// aiCopyRecipe handles POST /api/recipes/:id/ai-copy.
// Same as ai-modify but framed as creating a new variation. The client receives
// the AI draft, clears the id, and saves it as a new recipe on explicit Save.
func (h *Handler) aiCopyRecipe(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		apiError(c, http.StatusBadRequest, "invalid recipe id")
		return
	}

	var req recipePromptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apiError(c, http.StatusBadRequest, "prompt is required")
		return
	}

	src, err := fetchRecipeDetail(h, c, id)
	if err != nil || src.UserID != userID {
		apiError(c, http.StatusNotFound, "recipe not found")
		return
	}

	currentJSON, err := json.Marshal(src)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to serialize recipe")
		return
	}

	messages := []openAIMessage{
		{Role: "system", Content: "You are a creative recipe developer. Given an existing recipe (as JSON) and a variation request, create a new recipe inspired by the original but incorporating the requested changes. Give it a new appropriate name and emoji."},
		{Role: "user", Content: fmt.Sprintf("Original recipe:\n%s\n\nVariation request: %s", string(currentJSON), req.Prompt)},
	}

	content, err := callOpenAIModel(c, "gpt-4o", messages, recipeResponseFormat, h.openAIBaseURL)
	if err != nil {
		log.Printf("[recipe/ai-copy] OpenAI error: %v", err)
		apiError(c, http.StatusInternalServerError, "ai request failed")
		return
	}

	var draft createRecipeRequest
	if err := json.Unmarshal([]byte(content), &draft); err != nil {
		log.Printf("[recipe/ai-copy] Failed to parse AI response: %v", err)
		apiError(c, http.StatusInternalServerError, "ai response parse error")
		return
	}
	c.JSON(http.StatusOK, draft)
}

// aiNutrition handles POST /api/recipes/:id/ai-nutrition.
// Sends the recipe's ingredient list to OpenAI (gpt-4o-mini) and returns
// estimated nutrition totals per serving. Nothing is saved to the DB.
func (h *Handler) aiNutrition(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		apiError(c, http.StatusBadRequest, "invalid recipe id")
		return
	}

	src, err := fetchRecipeDetail(h, c, id)
	if err != nil || src.UserID != userID {
		apiError(c, http.StatusNotFound, "recipe not found")
		return
	}

	if len(src.Ingredients) == 0 {
		apiError(c, http.StatusBadRequest, "recipe has no ingredients")
		return
	}

	// Format the ingredient list as readable text for the AI
	var ingredientLines strings.Builder
	for _, ing := range src.Ingredients {
		line := ing.Name
		if ing.Qty != nil {
			line = fmt.Sprintf("%.2g", *ing.Qty) + " "
			if ing.Uom != nil {
				line += *ing.Uom + " "
			}
			line += ing.Name
		}
		if ing.Note != nil && *ing.Note != "" {
			line += " (" + *ing.Note + ")"
		}
		ingredientLines.WriteString("- " + line + "\n")
	}

	servings := src.Servings
	messages := []openAIMessage{
		{Role: "system", Content: fmt.Sprintf("You are a nutrition expert. Given a recipe ingredient list that makes %.2g serving(s), estimate the total nutritional content per serving. Return integers/decimals only — no explanations.", servings)},
		{Role: "user", Content: ingredientLines.String()},
	}

	content, err := callOpenAIModel(c, "gpt-4o-mini", messages, nutritionResponseFormat, h.openAIBaseURL)
	if err != nil {
		log.Printf("[recipe/ai-nutrition] OpenAI error: %v", err)
		apiError(c, http.StatusInternalServerError, "ai request failed")
		return
	}

	// Return the nutrition estimate directly
	var nutrition struct {
		Calories  int     `json:"calories"`
		ProteinG  float64 `json:"protein_g"`
		CarbsG    float64 `json:"carbs_g"`
		FatG      float64 `json:"fat_g"`
	}
	if err := json.Unmarshal([]byte(content), &nutrition); err != nil {
		log.Printf("[recipe/ai-nutrition] Failed to parse AI response: %v", err)
		apiError(c, http.StatusInternalServerError, "ai response parse error")
		return
	}
	c.JSON(http.StatusOK, nutrition)
}
