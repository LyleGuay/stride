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
	api.GET("/weight-log", h.getWeightLog)
	api.POST("/weight-log", h.upsertWeightEntry)
	api.PUT("/weight-log/:id", h.updateWeightEntry)
	api.DELETE("/weight-log/:id", h.deleteWeightEntry)
}
