// CLI tool to run pending database migrations from db/.
// Checks the migrations table to skip already-applied files.
// Wraps each migration + record insert in a single transaction.
// Usage: go run ./cmd/migrate (from go-api/)
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		fmt.Fprintf(os.Stderr, "Error loading .env: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, os.Getenv("DB_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	dbDir := filepath.Join("..", "db")
	files, err := filepath.Glob(filepath.Join(dbDir, "*.sql"))
	if err != nil || len(files) == 0 {
		fmt.Fprintf(os.Stderr, "No migration files found in %s\n", dbDir)
		os.Exit(1)
	}
	sort.Strings(files)

	// Get already-applied migrations (table may not exist yet)
	applied := make(map[string]bool)
	rows, err := conn.Query(ctx, "SELECT migration FROM migrations")
	if err == nil {
		for rows.Next() {
			var name string
			rows.Scan(&name)
			applied[name] = true
		}
		rows.Close()
	}

	ran := 0
	for _, f := range files {
		filename := filepath.Base(f)
		if applied[filename] {
			fmt.Printf("  skip: %s\n", filename)
			continue
		}

		content, err := os.ReadFile(f)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading %s: %v\n", filename, err)
			os.Exit(1)
		}

		tx, err := conn.Begin(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error starting transaction: %v\n", err)
			os.Exit(1)
		}

		if _, err := tx.Exec(ctx, string(content)); err != nil {
			tx.Rollback(ctx)
			fmt.Fprintf(os.Stderr, "Error running %s: %v\n", filename, err)
			os.Exit(1)
		}

		desc := descriptionFromFilename(filename)
		if _, err := tx.Exec(ctx, "INSERT INTO migrations (migration, description) VALUES ($1, $2)", filename, desc); err != nil {
			tx.Rollback(ctx)
			fmt.Fprintf(os.Stderr, "Error recording %s: %v\n", filename, err)
			os.Exit(1)
		}

		if err := tx.Commit(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "Error committing %s: %v\n", filename, err)
			os.Exit(1)
		}

		fmt.Printf("  applied: %s\n", filename)
		ran++
	}

	if ran == 0 {
		fmt.Println("No pending migrations.")
	} else {
		fmt.Printf("\n%d migration(s) applied.\n", ran)
	}
}

// descriptionFromFilename strips the YYYY-MM-DD-NNN- prefix and .sql suffix.
func descriptionFromFilename(filename string) string {
	name := strings.TrimSuffix(filename, ".sql")
	re := regexp.MustCompile(`^\d{4}-\d{2}-\d{2}-\d{3}-`)
	name = re.ReplaceAllString(name, "")
	return strings.ReplaceAll(name, "-", " ")
}
