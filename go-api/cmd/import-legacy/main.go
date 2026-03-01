// One-time CLI tool to import legacy calorie log and weight history from CSV files.
// Usage: go run ./cmd/import-legacy --username=<user> [--calorie-csv=<path>] [--weight-csv=<path>] [--force]
//
// Defaults to CSVs at ../docs/legacy-calorie-log-data/ relative to go-api/.
// Will refuse to import if calorie_log_items already exist for the user unless --force is passed.
// Weight entries use ON CONFLICT DO NOTHING so re-runs are safe.
package main

import (
	"context"
	"encoding/csv"
	"errors"
	"flag"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

// calorieItem holds a parsed row from the calorie log CSV.
type calorieItem struct {
	date      string
	itemName  string
	itemType  string
	qty       float64
	uom       string
	calories  int
	proteinG  *float64
	carbsG    *float64
	fatG      *float64
}

// weightEntry holds a parsed row from the weight history CSV.
type weightEntry struct {
	date      string
	weightLBS float64
}

func main() {
	// Load .env if present; missing file is fine (CI injects env vars directly).
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		fmt.Fprintf(os.Stderr, "Error loading .env file: %v\n", err)
		os.Exit(1)
	}

	var username string
	var calorieCSV string
	var weightCSV string
	var force bool
	flag.StringVar(&username, "username", "", "Username to import data for (required)")
	flag.StringVar(&calorieCSV, "calorie-csv", "../docs/legacy-calorie-log-data/Calorie Log - Calorie Log.csv", "Path to calorie log CSV")
	flag.StringVar(&weightCSV, "weight-csv", "../docs/legacy-calorie-log-data/Calorie Log - Weight History.csv", "Path to weight history CSV")
	flag.BoolVar(&force, "force", false, "Allow import even if calorie log items already exist for this user")
	flag.Parse()

	if username == "" {
		fmt.Fprintf(os.Stderr, "Error: --username is required\n")
		os.Exit(1)
	}

	ctx := context.Background()

	conn, err := pgx.Connect(ctx, os.Getenv("DB_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	// Look up user_id by username.
	var userID int
	err = conn.QueryRow(ctx, `SELECT id FROM users WHERE username = $1`, username).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		fmt.Fprintf(os.Stderr, "Error: user '%s' not found\n", username)
		os.Exit(1)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error looking up user: %v\n", err)
		os.Exit(1)
	}

	// Guard: refuse to import if calorie items already exist, unless --force is set.
	var existingCount int
	err = conn.QueryRow(ctx, `SELECT COUNT(*) FROM calorie_log_items WHERE user_id = $1`, userID).Scan(&existingCount)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error checking existing calorie items: %v\n", err)
		os.Exit(1)
	}
	if existingCount > 0 && !force {
		fmt.Fprintf(os.Stderr, "Error: user '%s' already has %d calorie log item(s). Use --force to import anyway.\n", username, existingCount)
		os.Exit(1)
	}

	// Parse calorie log CSV.
	calorieItems, err := parseCalorieCSV(calorieCSV)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing calorie CSV: %v\n", err)
		os.Exit(1)
	}

	// Parse weight history CSV.
	weightEntries, err := parseWeightCSV(weightCSV)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing weight CSV: %v\n", err)
		os.Exit(1)
	}

	// Insert calorie log items.
	for _, item := range calorieItems {
		_, err = conn.Exec(ctx,
			`INSERT INTO calorie_log_items
			 (user_id, date, item_name, type, qty, uom, calories, protein_g, carbs_g, fat_g)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			userID, item.date, item.itemName, item.itemType, item.qty, item.uom,
			item.calories, item.proteinG, item.carbsG, item.fatG,
		)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error inserting calorie item (%s / %s): %v\n", item.date, item.itemName, err)
			os.Exit(1)
		}
	}

	// Insert weight entries; ON CONFLICT DO NOTHING makes re-runs safe.
	for _, entry := range weightEntries {
		_, err = conn.Exec(ctx,
			`INSERT INTO weight_log (user_id, date, weight_lbs)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (user_id, date) DO NOTHING`,
			userID, entry.date, entry.weightLBS,
		)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error inserting weight entry (%s): %v\n", entry.date, err)
			os.Exit(1)
		}
	}

	fmt.Printf("Imported %d calorie items and %d weight entries for user '%s'\n",
		len(calorieItems), len(weightEntries), username)
}

// parseCalorieCSV reads the calorie log CSV and returns parsed rows.
// Skips row 0 (header). Exercise calories are stored as positive integers.
// Protein/carbs/fat are nullable — empty CSV cells become nil.
func parseCalorieCSV(path string) ([]calorieItem, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.TrimLeadingSpace = true
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read CSV: %w", err)
	}

	var items []calorieItem
	// Row 0 is the header; skip it.
	for i, row := range rows[1:] {
		lineNum := i + 2 // 1-indexed, offset by header

		if len(row) < 9 {
			return nil, fmt.Errorf("line %d: expected at least 9 columns, got %d", lineNum, len(row))
		}

		date := strings.TrimSpace(row[0])
		itemName := strings.TrimSpace(row[1])
		itemType := strings.ToLower(strings.TrimSpace(row[2]))
		qtyStr := strings.TrimSpace(row[3])
		uom := strings.ToLower(strings.TrimSpace(row[4]))
		calStr := strings.TrimSpace(row[5])
		proteinStr := strings.TrimSpace(row[6])
		carbsStr := strings.TrimSpace(row[7])
		fatStr := strings.TrimSpace(row[8])

		qty, err := strconv.ParseFloat(qtyStr, 64)
		if err != nil {
			return nil, fmt.Errorf("line %d: invalid qty %q: %w", lineNum, qtyStr, err)
		}

		calRaw, err := strconv.ParseFloat(calStr, 64)
		if err != nil {
			return nil, fmt.Errorf("line %d: invalid calories %q: %w", lineNum, calStr, err)
		}
		// Exercise entries store calories as negative in the CSV to indicate burn;
		// the DB stores the absolute value and uses type='exercise' as the sign indicator.
		calories := int(math.Round(math.Abs(calRaw)))

		proteinG := parseOptionalFloat(proteinStr)
		carbsG := parseOptionalFloat(carbsStr)
		fatG := parseOptionalFloat(fatStr)

		items = append(items, calorieItem{
			date:     date,
			itemName: itemName,
			itemType: itemType,
			qty:      qty,
			uom:      uom,
			calories: calories,
			proteinG: proteinG,
			carbsG:   carbsG,
			fatG:     fatG,
		})
	}

	return items, nil
}

// parseWeightCSV reads the weight history CSV and returns parsed rows.
// Skips row 0 (header). Skips rows where date or weight are empty.
func parseWeightCSV(path string) ([]weightEntry, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.TrimLeadingSpace = true
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read CSV: %w", err)
	}

	var entries []weightEntry
	// Row 0 is the header; skip it.
	for i, row := range rows[1:] {
		lineNum := i + 2

		if len(row) < 2 {
			continue
		}

		date := strings.TrimSpace(row[0])
		weightStr := strings.TrimSpace(row[1])

		// Skip rows where either column is empty.
		if date == "" || weightStr == "" {
			continue
		}

		weight, err := strconv.ParseFloat(weightStr, 64)
		if err != nil {
			return nil, fmt.Errorf("line %d: invalid weight %q: %w", lineNum, weightStr, err)
		}

		entries = append(entries, weightEntry{date: date, weightLBS: weight})
	}

	return entries, nil
}

// parseOptionalFloat parses a float from s; returns nil if s is empty.
func parseOptionalFloat(s string) *float64 {
	if s == "" {
		return nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil
	}
	return &v
}
