package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

type Handler struct {
	dbConn *pgx.Conn
}

type habit struct {
	Id      int    `json:"id" db:"id"`
	Name    string `json:"name" db:"name"`
	Cadence string `json:"cadence" db:"cadence"`
}

var habits = []habit{
	{Id: 1, Name: "Food (default or cook)", Cadence: "daily"},
	{Id: 2, Name: "Calories (in budget or within 100)", Cadence: "daily"},
}

func (h *Handler) getHabits(c *gin.Context) {
	// c.IndentedJSON(http.StatusOK, habits)
	rows, err := h.dbConn.Query(c, "SELECT * FROM habits")
	if err != nil {
		fmt.Printf("Error fetching habits: %v\n", err)
	}

	habits, err = pgx.CollectRows(rows, pgx.RowToStructByName[habit])

	c.IndentedJSON(http.StatusOK, habits)
}

func (h *Handler) postHabit(c *gin.Context) {
	var newHabit habit

	// Call BindJSON to bind the received JSON
	if err := c.BindJSON(&newHabit); err != nil {
		return
	}

	habits = append(habits, newHabit)
	c.IndentedJSON(http.StatusCreated, newHabit)
}

func getDBConn() *pgx.Conn {
	conn, err := pgx.Connect(context.Background(), os.Getenv("DB_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database %v/n", err)
		os.Exit(1)
	}
	fmt.Println("DB Connection setup!")
	return conn

	// defer conn.Close(context.Background())
}

func main() {

	// Set properties of the predefined Logger, including
	// the log entry prefix and a flag to disable printing
	// the time, source file, and line number.
	log.SetPrefix("lg/daily-habit-go-api: ")
	log.SetFlags(0)

	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	dbURL := os.Getenv("DB_URL")
	fmt.Printf("Loaded dbURL: %s\n", dbURL)

	dbConn := getDBConn()
	handler := Handler{dbConn: dbConn}

	fmt.Println("Starting gin app...")

	router := gin.Default()
	router.SetTrustedProxies(nil)
	//realIP := c.Request.RemoteAddr // This is the actual client - perfect!
	router.GET("/habits", handler.getHabits)
	router.POST("/habits", handler.postHabit)

	router.Run("localhost:3000")

	fmt.Println("Exit main")
}
