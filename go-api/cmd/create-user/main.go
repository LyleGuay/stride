// CLI tool to create a user with bcrypt-hashed password and default calorie log settings.
// Usage: go run ./cmd/create-user (from go-api/)
package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	if err := godotenv.Load(); err != nil {
		fmt.Fprintf(os.Stderr, "Error loading .env file: %v\n", err)
		os.Exit(1)
	}

	conn, err := pgx.Connect(context.Background(), os.Getenv("DB_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(context.Background())

	reader := bufio.NewReader(os.Stdin)

	fmt.Print("Username: ")
	username, _ := reader.ReadString('\n')
	username = strings.TrimSpace(username)

	fmt.Print("Email: ")
	email, _ := reader.ReadString('\n')
	email = strings.TrimSpace(email)

	fmt.Print("Password: ")
	password, _ := reader.ReadString('\n')
	password = strings.TrimSpace(password)

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error hashing password: %v\n", err)
		os.Exit(1)
	}

	authToken := uuid.New().String()

	var userID int
	err = conn.QueryRow(context.Background(),
		`INSERT INTO users (username, email, password, auth_token)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		username, email, string(hash), authToken,
	).Scan(&userID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating user: %v\n", err)
		os.Exit(1)
	}

	_, err = conn.Exec(context.Background(),
		`INSERT INTO calorie_log_user_settings (user_id) VALUES ($1)`, userID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating calorie log settings: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\nUser created successfully!\n")
	fmt.Printf("  ID:         %d\n", userID)
	fmt.Printf("  Username:   %s\n", username)
	fmt.Printf("  Auth Token: %s\n", authToken)
}
