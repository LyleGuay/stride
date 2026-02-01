package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

type habit struct {
	Id      int    `json:"id"`
	Name    string `json:"name"`
	Cadence string `json:"cadence"`
}

var habits = []habit{
	{Id: 1, Name: "Food (default or cook)", Cadence: "daily"},
	{Id: 2, Name: "Calories (in budget or within 100)", Cadence: "daily"},
}

func getHabits(c *gin.Context) {
	c.IndentedJSON(http.StatusOK, habits)
}

func postHabit(c *gin.Context) {
	var newHabit habit

	// Call BindJSON to bind the received JSON
	if err := c.BindJSON(&newHabit); err != nil {
		return
	}

	habits = append(habits, newHabit)
	c.IndentedJSON(http.StatusCreated, newHabit)
}

func main() {
	// Set properties of the predefined Logger, including
	// the log entry prefix and a flag to disable printing
	// the time, source file, and line number.
	log.SetPrefix("lg/daily-habit-go-api: ")
	log.SetFlags(0)

	// message, err := greetings.Hello("")

	// // If an error was returned, print it to the console and
	// // exit the program.
	// if err != nil {
	// 	log.Fatal(err)
	// }

	fmt.Println("Starting gin app...")

	router := gin.Default()
	router.SetTrustedProxies(nil)
	//realIP := c.Request.RemoteAddr // This is the actual client - perfect!
	router.GET("/habits", getHabits)
	router.POST("/habits", postHabit)

	router.Run("localhost:3000")
}
