package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	dbConn *pgx.Conn
}

type user struct {
	ID        int    `json:"id" db:"id"`
	Username  string `json:"username" db:"username"`
	Email     string `json:"email" db:"email"`
	AuthToken string `json:"-" db:"auth_token"`
	Password  string `json:"-" db:"password"`
}

type habit struct {
	Id      int    `json:"id" db:"id"`
	Name    string `json:"name" db:"name"`
	Cadence string `json:"cadence" db:"cadence"`
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

	var u user
	err := h.dbConn.QueryRow(c, "SELECT id, username, email, auth_token, password FROM users WHERE username = $1", body.Username).
		Scan(&u.ID, &u.Username, &u.Email, &u.AuthToken, &u.Password)
	if err != nil {
		apiError(c, http.StatusUnauthorized, "invalid credentials")
		return
	}

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

func (h *Handler) getHabits(c *gin.Context) {
	rows, err := h.dbConn.Query(c, "SELECT * FROM habits")
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to fetch habits")
		return
	}

	habits, err := pgx.CollectRows(rows, pgx.RowToStructByName[habit])
	if err != nil {
		apiError(c, http.StatusInternalServerError, "failed to parse habits")
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

	router.Run("localhost:3000")
}
