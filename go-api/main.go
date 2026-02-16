package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

// DateOnly wraps time.Time to serialize as "YYYY-MM-DD" in JSON.
type DateOnly struct{ time.Time }

func (d DateOnly) MarshalJSON() ([]byte, error) {
	return []byte(`"` + d.Time.Format("2006-01-02") + `"`), nil
}

func (d *DateOnly) UnmarshalJSON(b []byte) error {
	t, err := time.Parse(`"2006-01-02"`, string(b))
	if err != nil {
		return err
	}
	d.Time = t
	return nil
}

type Handler struct {
	dbConn *pgx.Conn
}

type user struct {
	ID        int        `json:"id" db:"id"`
	Username  string     `json:"username" db:"username"`
	Email     string     `json:"email" db:"email"`
	AuthToken string     `json:"-" db:"auth_token"`
	Password  string     `json:"-" db:"password"`
	CreatedAt *time.Time `json:"created_at" db:"created_at"`
}

type habit struct {
	Id      int    `json:"id" db:"id"`
	Name    string `json:"name" db:"name"`
	Cadence string `json:"cadence" db:"cadence"`
}

type calorieLogItem struct {
	ID        int      `json:"id" db:"id"`
	UserID    int      `json:"user_id" db:"user_id"`
	Date      DateOnly   `json:"date" db:"date"`
	ItemName  string     `json:"item_name" db:"item_name"`
	Type      string     `json:"type" db:"type"`
	Qty       *float64   `json:"qty" db:"qty"`
	Uom       *string    `json:"uom" db:"uom"`
	Calories  int        `json:"calories" db:"calories"`
	ProteinG  *float64   `json:"protein_g" db:"protein_g"`
	CarbsG    *float64   `json:"carbs_g" db:"carbs_g"`
	FatG      *float64   `json:"fat_g" db:"fat_g"`
	CreatedAt *time.Time `json:"created_at" db:"created_at"`
	UpdatedAt *time.Time `json:"updated_at" db:"updated_at"`
}

type calorieLogUserSettings struct {
	UserID          int `json:"user_id" db:"user_id"`
	CalorieBudget   int `json:"calorie_budget" db:"calorie_budget"`
	ProteinTargetG  int `json:"protein_target_g" db:"protein_target_g"`
	CarbsTargetG    int `json:"carbs_target_g" db:"carbs_target_g"`
	FatTargetG      int `json:"fat_target_g" db:"fat_target_g"`
	BreakfastBudget int `json:"breakfast_budget" db:"breakfast_budget"`
	LunchBudget     int `json:"lunch_budget" db:"lunch_budget"`
	DinnerBudget    int `json:"dinner_budget" db:"dinner_budget"`
	SnackBudget     int `json:"snack_budget" db:"snack_budget"`
}

type dailySummary struct {
	Date             string                 `json:"date"`
	CalorieBudget    int                    `json:"calorie_budget"`
	CaloriesFood     int                    `json:"calories_food"`
	CaloriesExercise int                    `json:"calories_exercise"`
	NetCalories      int                    `json:"net_calories"`
	CaloriesLeft     int                    `json:"calories_left"`
	ProteinG         float64                `json:"protein_g"`
	CarbsG           float64                `json:"carbs_g"`
	FatG             float64                `json:"fat_g"`
	Items            []calorieLogItem       `json:"items"`
	Settings         calorieLogUserSettings `json:"settings"`
}

// queryOne runs a query and scans the first row into T using RowToStructByName.
func queryOne[T any](conn *pgx.Conn, c *gin.Context, sql string, args pgx.NamedArgs) (T, error) {
	rows, err := conn.Query(c, sql, args)
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
func queryMany[T any](conn *pgx.Conn, c *gin.Context, sql string, args pgx.NamedArgs) ([]T, error) {
	rows, err := conn.Query(c, sql, args)
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

// apiError returns a consistent JSON error response.
func apiError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"error": message})
}

// login verifies credentials and returns the user's auth token.
func (h *Handler) login(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	fmt.Printf("user: '%s'\n", body.Username)

	u, err := queryOne[user](h.dbConn, c,
		"SELECT * FROM users WHERE username = @username",
		pgx.NamedArgs{"username": body.Username})
	if err != nil {
		apiError(c, http.StatusUnauthorized, "invalid credentials")
		return
	}

	fmt.Printf("Password: %s\n", u.Password)

	if err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(body.Password)); err != nil {
		apiError(c, http.StatusUnauthorized, "invalid credentials")
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": u.AuthToken, "user_id": u.ID})
}

// authMiddleware validates the Bearer token and sets user_id on the context.
func (h *Handler) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			apiError(c, http.StatusUnauthorized, "missing or invalid authorization header")
			c.Abort()
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")

		var userID int
		err := h.dbConn.QueryRow(c, "SELECT id FROM users WHERE auth_token = $1", token).Scan(&userID)
		if err != nil {
			apiError(c, http.StatusUnauthorized, "invalid token")
			c.Abort()
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}

// getDailySummary returns calorie log items and computed totals for a given date.
func (h *Handler) getDailySummary(c *gin.Context) {
	userID := c.GetInt("user_id")
	date := c.DefaultQuery("date", time.Now().Format("2006-01-02"))
	args := pgx.NamedArgs{"userID": userID, "date": date}

	items, err := queryMany[calorieLogItem](h.dbConn, c,
		`SELECT * FROM calorie_log_items
		 WHERE user_id = @userID AND date = @date
		 ORDER BY created_at`, args)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch items")
		return
	}
	if items == nil {
		items = []calorieLogItem{}
	}

	settings, err := queryOne[calorieLogUserSettings](h.dbConn, c,
		"SELECT * FROM calorie_log_user_settings WHERE user_id = @userID",
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch settings")
		return
	}

	// Compute totals
	var caloriesFood, caloriesExercise int
	var proteinG, carbsG, fatG float64
	for _, item := range items {
		if item.Type == "exercise" {
			caloriesExercise += item.Calories
		} else {
			caloriesFood += item.Calories
		}
		if item.ProteinG != nil {
			proteinG += *item.ProteinG
		}
		if item.CarbsG != nil {
			carbsG += *item.CarbsG
		}
		if item.FatG != nil {
			fatG += *item.FatG
		}
	}

	net := caloriesFood - caloriesExercise
	left := settings.CalorieBudget - net

	c.JSON(http.StatusOK, dailySummary{
		Date:             date,
		CalorieBudget:    settings.CalorieBudget,
		CaloriesFood:     caloriesFood,
		CaloriesExercise: caloriesExercise,
		NetCalories:      net,
		CaloriesLeft:     left,
		ProteinG:         proteinG,
		CarbsG:           carbsG,
		FatG:             fatG,
		Items:            items,
		Settings:         settings,
	})
}

// createCalorieLogItem inserts a new calorie log entry.
func (h *Handler) createCalorieLogItem(c *gin.Context) {
	userID := c.GetInt("user_id")

	var body struct {
		Date     string   `json:"date"`
		ItemName string   `json:"item_name"`
		Type     string   `json:"type"`
		Qty      *float64 `json:"qty"`
		Uom      *string  `json:"uom"`
		Calories int      `json:"calories"`
		ProteinG *float64 `json:"protein_g"`
		CarbsG   *float64 `json:"carbs_g"`
		FatG     *float64 `json:"fat_g"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.ItemName == "" {
		apiError(c, http.StatusBadRequest, "item_name is required")
		return
	}
	if body.Type == "" {
		apiError(c, http.StatusBadRequest, "type is required")
		return
	}
	if body.Date == "" {
		body.Date = time.Now().Format("2006-01-02")
	}

	item, err := queryOne[calorieLogItem](h.dbConn, c,
		`INSERT INTO calorie_log_items (user_id, date, item_name, type, qty, uom, calories, protein_g, carbs_g, fat_g)
		 VALUES (@userID, @date, @itemName, @type, @qty, @uom, @calories, @proteinG, @carbsG, @fatG)
		 RETURNING *`,
		pgx.NamedArgs{
			"userID": userID, "date": body.Date, "itemName": body.ItemName,
			"type": body.Type, "qty": body.Qty, "uom": body.Uom,
			"calories": body.Calories, "proteinG": body.ProteinG,
			"carbsG": body.CarbsG, "fatG": body.FatG,
		})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to create item")
		return
	}

	c.JSON(http.StatusCreated, item)
}

// updateCalorieLogItem updates an existing calorie log entry.
func (h *Handler) updateCalorieLogItem(c *gin.Context) {
	userID := c.GetInt("user_id")
	id := c.Param("id")

	var body struct {
		Date     *string  `json:"date"`
		ItemName *string  `json:"item_name"`
		Type     *string  `json:"type"`
		Qty      *float64 `json:"qty"`
		Uom      *string  `json:"uom"`
		Calories *int     `json:"calories"`
		ProteinG *float64 `json:"protein_g"`
		CarbsG   *float64 `json:"carbs_g"`
		FatG     *float64 `json:"fat_g"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	item, err := queryOne[calorieLogItem](h.dbConn, c,
		`UPDATE calorie_log_items SET
			date = COALESCE(@date, date),
			item_name = COALESCE(@itemName, item_name),
			type = COALESCE(@type, type),
			qty = COALESCE(@qty, qty),
			uom = COALESCE(@uom, uom),
			calories = COALESCE(@calories, calories),
			protein_g = COALESCE(@proteinG, protein_g),
			carbs_g = COALESCE(@carbsG, carbs_g),
			fat_g = COALESCE(@fatG, fat_g),
			updated_at = now()
		 WHERE id = @id AND user_id = @userID
		 RETURNING *`,
		pgx.NamedArgs{
			"id": id, "userID": userID,
			"date": body.Date, "itemName": body.ItemName, "type": body.Type,
			"qty": body.Qty, "uom": body.Uom, "calories": body.Calories,
			"proteinG": body.ProteinG, "carbsG": body.CarbsG, "fatG": body.FatG,
		})
	if err != nil {
		apiError(c, http.StatusNotFound, "item not found")
		return
	}

	c.JSON(http.StatusOK, item)
}

// deleteCalorieLogItem removes a calorie log entry.
func (h *Handler) deleteCalorieLogItem(c *gin.Context) {
	userID := c.GetInt("user_id")
	id := c.Param("id")

	result, err := h.dbConn.Exec(c,
		"DELETE FROM calorie_log_items WHERE id = @id AND user_id = @userID",
		pgx.NamedArgs{"id": id, "userID": userID})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to delete item")
		return
	}
	if result.RowsAffected() == 0 {
		apiError(c, http.StatusNotFound, "item not found")
		return
	}

	c.Status(http.StatusNoContent)
}

// getUserSettings returns the calorie log settings for the authenticated user.
func (h *Handler) getUserSettings(c *gin.Context) {
	userID := c.GetInt("user_id")

	s, err := queryOne[calorieLogUserSettings](h.dbConn, c,
		"SELECT * FROM calorie_log_user_settings WHERE user_id = @userID",
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		apiError(c, http.StatusNotFound, "settings not found")
		return
	}

	c.JSON(http.StatusOK, s)
}

// patchUserSettings updates only the provided calorie log settings fields.
func (h *Handler) patchUserSettings(c *gin.Context) {
	userID := c.GetInt("user_id")

	var body struct {
		CalorieBudget   *int `json:"calorie_budget"`
		ProteinTargetG  *int `json:"protein_target_g"`
		CarbsTargetG    *int `json:"carbs_target_g"`
		FatTargetG      *int `json:"fat_target_g"`
		BreakfastBudget *int `json:"breakfast_budget"`
		LunchBudget     *int `json:"lunch_budget"`
		DinnerBudget    *int `json:"dinner_budget"`
		SnackBudget     *int `json:"snack_budget"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	// Build SET clause dynamically from provided fields
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

	if len(setClauses) == 0 {
		apiError(c, http.StatusBadRequest, "no fields to update")
		return
	}

	query := "UPDATE calorie_log_user_settings SET " +
		strings.Join(setClauses, ", ") +
		" WHERE user_id = @userID RETURNING *"

	s, err := queryOne[calorieLogUserSettings](h.dbConn, c, query, args)
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to update settings")
		return
	}

	c.JSON(http.StatusOK, s)
}

func (h *Handler) getHabits(c *gin.Context) {
	habits, err := queryMany[habit](h.dbConn, c, "SELECT * FROM habits", pgx.NamedArgs{})
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch habits")
		return
	}

	c.JSON(http.StatusOK, habits)
}

func (h *Handler) postHabit(c *gin.Context) {
	var newHabit habit
	if err := c.ShouldBindJSON(&newHabit); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	c.JSON(http.StatusCreated, newHabit)
}

func getDBConn() *pgx.Conn {
	conn, err := pgx.Connect(context.Background(), os.Getenv("DB_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("DB Connection setup!")
	return conn
}

func main() {
	log.SetPrefix("stride-api: ")
	log.SetFlags(0)

	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env file")
	}

	dbConn := getDBConn()
	handler := Handler{dbConn: dbConn}

	router := gin.Default()
	router.SetTrustedProxies(nil)

	// Public routes
	router.POST("/api/login", handler.login)

	// Authenticated routes
	api := router.Group("/api", handler.authMiddleware())
	api.GET("/habits", handler.getHabits)
	api.POST("/habits", handler.postHabit)
	api.GET("/calorie-log/daily", handler.getDailySummary)
	api.POST("/calorie-log/items", handler.createCalorieLogItem)
	api.PUT("/calorie-log/items/:id", handler.updateCalorieLogItem)
	api.DELETE("/calorie-log/items/:id", handler.deleteCalorieLogItem)
	api.GET("/calorie-log/user-settings", handler.getUserSettings)
	api.PATCH("/calorie-log/user-settings", handler.patchUserSettings)

	router.Run("localhost:3000")
}
