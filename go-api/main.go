package main

import (
	"fmt"
	"log"
)

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

	fmt.Println("Hello World")
}
