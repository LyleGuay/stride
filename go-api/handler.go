package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Handler holds shared dependencies (db pool, config) for all route handlers.
type Handler struct {
	db            *pgxpool.Pool
	openAIBaseURL string // Base URL for OpenAI API (overridable for tests)
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

// registerRoutes registers all API routes on the router.
func (h *Handler) registerRoutes(router *gin.Engine) {
	// Public routes
	router.POST("/api/login", h.login)

	// Authenticated routes
	api := router.Group("/api", h.authMiddleware())
	api.GET("/calorie-log/daily", h.getDailySummary)
	api.GET("/calorie-log/week-summary", h.getWeekSummary)
	api.POST("/calorie-log/items", h.createCalorieLogItem)
	api.PUT("/calorie-log/items/:id", h.updateCalorieLogItem)
	api.DELETE("/calorie-log/items/:id", h.deleteCalorieLogItem)
	api.GET("/calorie-log/user-settings", h.getUserSettings)
	api.PATCH("/calorie-log/user-settings", h.patchUserSettings)
	api.POST("/calorie-log/suggest", h.suggestCalorieLogItem)
	api.GET("/calorie-log/progress", h.getProgress)
	api.GET("/calorie-log/earliest-date", h.getEarliestLogDate)
	api.GET("/calorie-log/favorites", h.listFavorites)
	api.POST("/calorie-log/favorites", h.createFavorite)
	api.DELETE("/calorie-log/favorites/:id", h.deleteFavorite)
	api.GET("/weight-log", h.getWeightLog)
	api.POST("/weight-log", h.upsertWeightEntry)
	api.PUT("/weight-log/:id", h.updateWeightEntry)
	api.DELETE("/weight-log/:id", h.deleteWeightEntry)
	// Recipe routes — /generate must be registered before /:id to avoid being swallowed as an id param
	api.POST("/recipes/generate", h.generateRecipe)
	api.GET("/recipes", h.listRecipes)
	api.POST("/recipes", h.createRecipe)
	api.GET("/recipes/:id", h.getRecipe)
	api.PUT("/recipes/:id", h.updateRecipe)
	api.DELETE("/recipes/:id", h.deleteRecipe)
	api.POST("/recipes/:id/duplicate", h.duplicateRecipe)
	api.POST("/recipes/:id/ai-modify", h.aiModifyRecipe)
	api.POST("/recipes/:id/ai-copy", h.aiCopyRecipe)
	api.POST("/recipes/:id/ai-nutrition", h.aiNutrition)
	// Journal routes — static paths (/calendar, /summary, /tag-days) must be registered
	// before /:id to avoid Gin treating them as ID params.
	api.GET("/journal", h.getJournalEntries)
	api.POST("/journal", h.createJournalEntry)
	api.PUT("/journal/:id", h.updateJournalEntry)
	api.DELETE("/journal/:id", h.deleteJournalEntry)
	api.GET("/journal/calendar", h.getJournalCalendar)
	api.GET("/journal/summary", h.getJournalSummary)
	api.GET("/journal/tag-days", h.getJournalTagDays)
	// Task routes — static sub-paths (/overdue-count) must be registered before /:id
	// to avoid Gin treating them as ID params. Same applies to /:id/complete etc.,
	// which Gin handles correctly as they have additional path segments after /:id.
	api.GET("/tasks/overdue-count", h.getOverdueCount)
	api.GET("/tasks", h.listTasks)
	api.POST("/tasks", h.createTask)
	api.GET("/tasks/:id", h.getTask)
	api.PATCH("/tasks/:id", h.updateTask)
	api.DELETE("/tasks/:id", h.deleteTask)
	api.PATCH("/tasks/:id/complete", h.completeTask)
	api.PATCH("/tasks/:id/complete-forever", h.completeTaskForever)
	api.DELETE("/tasks/:id/completions/latest", h.undoCompletion)
	// Habit routes — /week must be registered before /:id to avoid param capture
	api.GET("/habits/week", h.listHabitsWeek)
	api.GET("/habits", h.listHabits)
	api.POST("/habits", h.createHabit)
	api.PATCH("/habits/:id", h.updateHabit)
	api.POST("/habits/:id/archive", h.archiveHabit)
	api.DELETE("/habits/:id", h.deleteHabit)
	api.GET("/habits/:id/logs", h.listHabitLogs)
	api.PUT("/habit-logs", h.upsertHabitLog)
}
