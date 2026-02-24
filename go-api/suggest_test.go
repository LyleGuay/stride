package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// setupSuggestTest creates a Gin engine with a mock OpenAI server and returns
// the router and a function to set the mock response. No DB needed for food tests.
func setupSuggestTest() (*gin.Engine, *httptest.Server, func(int, interface{})) {
	var mockStatus int
	var mockBody interface{}

	mockOpenAI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(mockStatus)
		json.NewEncoder(w).Encode(mockBody)
	}))

	gin.SetMode(gin.TestMode)
	h := Handler{openAIBaseURL: mockOpenAI.URL}
	router := gin.New()
	// Skip auth middleware for tests — set a dummy user_id
	router.POST("/api/calorie-log/suggest", func(c *gin.Context) {
		c.Set("user_id", 1)
		c.Next()
	}, h.suggestCalorieLogItem)

	setMock := func(status int, body interface{}) {
		mockStatus = status
		mockBody = body
	}

	return router, mockOpenAI, setMock
}

// doSuggestRequest sends a POST to the suggest endpoint with the given body.
func doSuggestRequest(router *gin.Engine, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", "/api/calorie-log/suggest", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

// openAIChatResponse wraps a content string in the OpenAI chat completions
// response shape (choices[0].message.content).
func openAIChatResponse(content string) map[string]interface{} {
	return map[string]interface{}{
		"choices": []map[string]interface{}{
			{
				"message": map[string]interface{}{
					"content": content,
				},
			},
		},
	}
}

func TestSuggest_FoodSuccess(t *testing.T) {
	router, mockServer, setMock := setupSuggestTest()
	defer mockServer.Close()

	suggestion := `{"item_name":"Scrambled Eggs","qty":2,"uom":"each","calories":180,"protein_g":14,"carbs_g":2,"fat_g":12,"confidence":4}`
	setMock(http.StatusOK, openAIChatResponse(suggestion))
	t.Setenv("OPENAI_API_KEY", "test-key")

	w := doSuggestRequest(router, `{"description":"2 eggs scrambled","type":"breakfast"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp suggestionResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if resp.ItemName != "Scrambled Eggs" {
		t.Errorf("expected item_name 'Scrambled Eggs', got '%s'", resp.ItemName)
	}
	if resp.Calories != 180 {
		t.Errorf("expected calories 180, got %d", resp.Calories)
	}
}

func TestSuggest_ExerciseSuccess(t *testing.T) {
	router, mockServer, setMock := setupSuggestTest()
	defer mockServer.Close()

	// Exercise entries without DB still work — they use the fallback prompt
	suggestion := `{"item_name":"Jogging","qty":30,"uom":"minutes","calories":250,"protein_g":0,"carbs_g":0,"fat_g":0,"confidence":3}`
	setMock(http.StatusOK, openAIChatResponse(suggestion))
	t.Setenv("OPENAI_API_KEY", "test-key")

	w := doSuggestRequest(router, `{"description":"30 minute jog","type":"exercise"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp suggestionResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if resp.ItemName != "Jogging" {
		t.Errorf("expected item_name 'Jogging', got '%s'", resp.ItemName)
	}
	if resp.Calories != 250 {
		t.Errorf("expected calories 250, got %d", resp.Calories)
	}
}

func TestSuggest_Unrecognized(t *testing.T) {
	router, mockServer, setMock := setupSuggestTest()
	defer mockServer.Close()

	setMock(http.StatusOK, openAIChatResponse(`{"error":"unrecognized"}`))
	t.Setenv("OPENAI_API_KEY", "test-key")

	w := doSuggestRequest(router, `{"description":"asdfghjkl","type":"snack"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] != "unrecognized" {
		t.Errorf("expected error 'unrecognized', got '%s'", resp["error"])
	}
}

func TestSuggest_OpenAIError500(t *testing.T) {
	router, mockServer, setMock := setupSuggestTest()
	defer mockServer.Close()

	setMock(http.StatusInternalServerError, map[string]string{"error": "server error"})
	t.Setenv("OPENAI_API_KEY", "test-key")

	w := doSuggestRequest(router, `{"description":"banana","type":"snack"}`)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] != "openai request failed" {
		t.Errorf("expected error 'openai request failed', got '%s'", resp["error"])
	}
}

func TestSuggest_EmptyDescription(t *testing.T) {
	router, mockServer, _ := setupSuggestTest()
	defer mockServer.Close()

	w := doSuggestRequest(router, `{"description":"","type":"snack"}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSuggest_MalformedJSON(t *testing.T) {
	router, mockServer, setMock := setupSuggestTest()
	defer mockServer.Close()

	// OpenAI returns something that isn't valid JSON
	setMock(http.StatusOK, openAIChatResponse(`not valid json at all`))
	t.Setenv("OPENAI_API_KEY", "test-key")

	w := doSuggestRequest(router, `{"description":"banana","type":"snack"}`)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", w.Code, w.Body.String())
	}
}
