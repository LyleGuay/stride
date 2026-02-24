package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

/* ─── Request / Response types ───────────────────────────────────────── */

// suggestRequest is the request body for POST /api/calorie-log/suggest.
type suggestRequest struct {
	Description string `json:"description"`
	Type        string `json:"type"`
}

// suggestionResponse is the structured nutrition data returned by the AI.
// For exercise entries, only ItemName and Calories are populated.
// Confidence is 1-5 indicating how accurate the estimate is.
type suggestionResponse struct {
	ItemName   string  `json:"item_name"`
	Qty        float64 `json:"qty"`
	Uom        string  `json:"uom"`
	Calories   int     `json:"calories"`
	ProteinG   float64 `json:"protein_g"`
	CarbsG     float64 `json:"carbs_g"`
	FatG       float64 `json:"fat_g"`
	Confidence int     `json:"confidence"`
}

/* ─── OpenAI prompt constants ────────────────────────────────────────── */

const foodSystemPrompt = `You are a nutrition assistant. Parse the food description and return a JSON object with:
- "item_name" (string, cleaned up title case)
- "qty" (number)
- "uom" (one of: each, g, miles, km, minutes)
- "calories" (integer, total for the full quantity)
- "protein_g" (integer, total for the full quantity)
- "carbs_g" (integer, total for the full quantity)
- "fat_g" (integer, total for the full quantity)
- "confidence" (integer 1-5: 5=exact known nutritional data, 4=very close estimate, 3=reasonable estimate, 2=rough guess, 1=very uncertain)

Always provide your best estimate, even for unfamiliar or vague items. Use your knowledge of similar foods to approximate. Only return {"error": "unrecognized"} if the input is not food at all (e.g. random characters, non-food objects).
Return only valid JSON, no explanation.`

// exerciseSystemPromptTemplate includes placeholders for the user's body stats
// so the AI can estimate calories burned more accurately.
const exerciseSystemPromptTemplate = `You are a fitness calorie-burn estimator. The user is:
- Sex: %s
- Age: %d years
- Weight: %.0f lbs
- Height: %.0f cm

Parse the exercise description and estimate calories burned. Return a JSON object with:
- "item_name" (string, cleaned up title case)
- "qty" (number, duration or distance)
- "uom" (one of: each, g, miles, km, minutes)
- "calories" (integer, estimated calories burned)
- "protein_g" (always 0)
- "carbs_g" (always 0)
- "fat_g" (always 0)
- "confidence" (integer 1-5: 5=well-studied exercise with known MET values, 4=very close estimate, 3=reasonable estimate, 2=rough guess, 1=very uncertain)

Always provide your best estimate, even for unusual activities. Only return {"error": "unrecognized"} if the input is not an exercise at all.
Return only valid JSON, no explanation.`

// exerciseSystemPromptFallback is used when the user has no body stats saved.
const exerciseSystemPromptFallback = `You are a fitness calorie-burn estimator. No body stats are available — use averages for an adult.

Parse the exercise description and estimate calories burned. Return a JSON object with:
- "item_name" (string, cleaned up title case)
- "qty" (number, duration or distance)
- "uom" (one of: each, g, miles, km, minutes)
- "calories" (integer, estimated calories burned)
- "protein_g" (always 0)
- "carbs_g" (always 0)
- "fat_g" (always 0)
- "confidence" (integer 1-5: 5=well-studied exercise with known MET values, 4=very close estimate, 3=reasonable estimate, 2=rough guess, 1=very uncertain)

Always provide your best estimate, even for unusual activities. Only return {"error": "unrecognized"} if the input is not an exercise at all.
Return only valid JSON, no explanation.`

/* ─── OpenAI HTTP client ─────────────────────────────────────────────── */

// openAIMessage is a single message in the OpenAI chat completions request.
type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// openAIRequest is the request body for the OpenAI chat completions API.
type openAIRequest struct {
	Model          string                 `json:"model"`
	Messages       []openAIMessage        `json:"messages"`
	Temperature    float64                `json:"temperature"`
	ResponseFormat map[string]interface{} `json:"response_format"`
}

// callOpenAI sends a chat completions request and returns the raw content string
// from the first choice. Uses raw net/http to avoid pulling in the OpenAI SDK.
func callOpenAI(ctx context.Context, messages []openAIMessage, baseURL string) (string, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("OPENAI_API_KEY not set")
	}

	reqBody := openAIRequest{
		Model:       "gpt-4o-mini",
		Messages:    messages,
		Temperature: 0,
		ResponseFormat: map[string]interface{}{
			"type": "json_object",
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openai returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	// Parse the response to extract choices[0].message.content
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", fmt.Errorf("unmarshal response: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}

	return result.Choices[0].Message.Content, nil
}

/* ─── Handler ────────────────────────────────────────────────────────── */

// suggestCalorieLogItem handles POST /api/calorie-log/suggest.
// Accepts a food or exercise description, calls OpenAI to parse it into
// structured nutrition data, and returns the suggestion.
func (h *Handler) suggestCalorieLogItem(c *gin.Context) {
	var req suggestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.Description) == "" {
		apiError(c, http.StatusBadRequest, "description is required")
		return
	}

	// Build the system prompt based on entry type
	var systemPrompt string
	if req.Type == "exercise" {
		systemPrompt = h.buildExercisePrompt(c)
	} else {
		systemPrompt = foodSystemPrompt
	}

	messages := []openAIMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: req.Description},
	}

	content, err := callOpenAI(c.Request.Context(), messages, h.openAIBaseURL)
	if err != nil {
		log.Printf("[suggest] OpenAI error: %v", err)
		apiError(c, http.StatusInternalServerError, "openai request failed")
		return
	}

	// Check if the AI returned an "unrecognized" error
	var errorResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal([]byte(content), &errorResp); err != nil {
		log.Printf("[suggest] Failed to parse OpenAI response: %v", err)
		apiError(c, http.StatusInternalServerError, "openai request failed")
		return
	}
	if errorResp.Error == "unrecognized" {
		c.JSON(http.StatusOK, gin.H{"error": "unrecognized"})
		return
	}

	// Parse the suggestion
	var suggestion suggestionResponse
	if err := json.Unmarshal([]byte(content), &suggestion); err != nil {
		log.Printf("[suggest] Failed to parse suggestion JSON: %v", err)
		apiError(c, http.StatusInternalServerError, "openai request failed")
		return
	}

	// Validate that we got a usable response (at minimum, item_name and calories)
	if suggestion.ItemName == "" || suggestion.Calories == 0 {
		c.JSON(http.StatusOK, gin.H{"error": "unrecognized"})
		return
	}

	c.JSON(http.StatusOK, suggestion)
}

// buildExercisePrompt loads the user's body stats from the DB and builds
// the exercise system prompt. Falls back to a generic prompt if stats are missing.
func (h *Handler) buildExercisePrompt(c *gin.Context) string {
	if h.db == nil {
		return exerciseSystemPromptFallback
	}
	userID, _ := c.Get("user_id")
	settings, err := queryOne[calorieLogUserSettings](h.db, c,
		"SELECT * FROM calorie_log_user_settings WHERE user_id = @userID",
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		return exerciseSystemPromptFallback
	}

	// Need sex, DOB, weight, and height for a personalized estimate
	if settings.Sex == nil || settings.DateOfBirth == nil || settings.WeightLBS == nil || settings.HeightCM == nil {
		return exerciseSystemPromptFallback
	}

	age := time.Now().Year() - settings.DateOfBirth.Time.Year()
	return fmt.Sprintf(exerciseSystemPromptTemplate,
		*settings.Sex, age, *settings.WeightLBS, *settings.HeightCM)
}
