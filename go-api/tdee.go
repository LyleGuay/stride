package main

import (
	"math"
	"time"
)

// activityMultipliers maps activity level strings to their TDEE multiplier.
// This is the single source of truth for valid activity levels — also used for
// input validation in patchUserSettings.
var activityMultipliers = map[string]float64{
	"sedentary":   1.2,
	"light":       1.375,
	"moderate":    1.55,
	"active":      1.725,
	"very_active": 1.9,
}

// computeTDEE computes BMR (Mifflin-St Jeor), TDEE, suggested daily calorie
// budget, and weight-loss pace (lbs/week) from user profile settings.
// Returns ok=false when any required profile field is nil, the target date
// is in the past (budget would be meaningless), or if age is implausible.
func computeTDEE(s *calorieLogUserSettings) (bmr, tdee, budget int, paceLbsPerWeek float64, ok bool) {
	if s.Sex == nil || s.DateOfBirth == nil || s.HeightCM == nil ||
		s.WeightLBS == nil || s.ActivityLevel == nil ||
		s.TargetWeightLBS == nil || s.TargetDate == nil {
		return 0, 0, 0, 0, false
	}

	// Age derived from date of birth
	today := time.Now()
	age := today.Year() - s.DateOfBirth.Year()
	if today.Before(s.DateOfBirth.AddDate(age, 0, 0)) {
		age--
	}
	// Guard against implausible ages (e.g. DOB in the future, or over 130 years ago)
	if age < 0 || age > 130 {
		return 0, 0, 0, 0, false
	}

	// BMR via Mifflin-St Jeor: different constant for male vs female
	weightKG := *s.WeightLBS / 2.20462
	bmrF := 10*weightKG + 6.25**s.HeightCM - 5*float64(age)
	if *s.Sex == "male" {
		bmrF += 5
	} else {
		bmrF -= 161
	}

	// TDEE: multiply BMR by activity level multiplier
	mult, found := activityMultipliers[*s.ActivityLevel]
	if !found {
		return 0, 0, 0, 0, false
	}
	tdeeF := bmrF * mult

	// Pace from target weight delta and time remaining.
	// Negative pace = weight loss (target < current); positive pace = weight gain.
	weeksUntil := time.Until(s.TargetDate.Time).Hours() / 24 / 7
	if weeksUntil <= 0 {
		return 0, 0, 0, 0, false
	}
	pace := (*s.TargetWeightLBS - *s.WeightLBS) / weeksUntil
	// Cap pace at ±2 lbs/week (health/safety limit).
	// Snap |pace| < 0.1 to 0 — a sub-0.1 adjustment is within TDEE estimation
	// noise and is effectively a maintenance budget (budget = TDEE).
	if math.Abs(pace) < 0.1 {
		pace = 0
	} else if pace > 2 {
		pace = 2
	} else if pace < -2 {
		pace = -2
	}

	// Budget = TDEE plus the caloric adjustment implied by pace (3500 cal ≈ 1 lb fat).
	// Loss (pace < 0): budget < TDEE. Gain (pace > 0): budget > TDEE. Zero: budget = TDEE.
	// Use math.Round to avoid systematic under-reporting from truncation.
	budgetF := tdeeF + pace*500
	return int(math.Round(bmrF)), int(math.Round(tdeeF)), int(math.Round(budgetF)), pace, true
}

// tdeeForDay computes TDEE for a specific historical date using an explicit weight
// and activity level string. Uses current profile (height, sex, DOB) but overrides
// weight and computes age from DOB at asOfDate rather than today.
// Returns (tdee, ok) — ok=false if any required profile field is nil or activity level unknown.
func tdeeForDay(s *calorieLogUserSettings, weightLBS float64, activityLevel string, asOfDate time.Time) (float64, bool) {
	if s.Sex == nil || s.DateOfBirth == nil || s.HeightCM == nil {
		return 0, false
	}
	mult, found := activityMultipliers[activityLevel]
	if !found {
		return 0, false
	}
	// Age at asOfDate, not today — critical for historical accuracy.
	age := asOfDate.Year() - s.DateOfBirth.Year()
	if asOfDate.Before(s.DateOfBirth.AddDate(age, 0, 0)) {
		age--
	}
	if age < 0 || age > 130 {
		return 0, false
	}
	weightKG := weightLBS / 2.20462
	bmrF := 10*weightKG + 6.25**s.HeightCM - 5*float64(age)
	if *s.Sex == "male" {
		bmrF += 5
	} else {
		bmrF -= 161
	}
	return bmrF * mult, true
}

// weightAtOrBefore returns the most recent weight_lbs from entries with date <= dateStr.
// Falls back to fallback when no qualifying entry exists (e.g. no weight logged yet).
// entries must be sorted ascending by date.
func weightAtOrBefore(entries []weightEntry, dateStr string, fallback float64) float64 {
	best := fallback
	for _, e := range entries {
		if e.Date.Format("2006-01-02") <= dateStr {
			best = e.WeightLBS
		}
	}
	return best
}

// currentMonday returns the Monday of the current week at midnight UTC.
// Uses AddDate to safely handle month/year boundaries — direct day subtraction
// can produce day=0 or negative, which time.Date normalizes but is confusing.
func currentMonday() time.Time {
	now := time.Now().UTC()
	weekday := int(now.Weekday()) // 0=Sun
	if weekday == 0 {
		weekday = 7 // treat Sunday as day 7 so Mon=1..Sun=7
	}
	daysBack := weekday - 1
	return now.AddDate(0, 0, -daysBack).Truncate(24 * time.Hour)
}

// populateComputedTDEE fills the computed-only fields on s from the user's profile.
// No-ops if any required profile field is missing.
func populateComputedTDEE(s *calorieLogUserSettings) {
	if bmr, tdee, budget, pace, ok := computeTDEE(s); ok {
		s.ComputedBMR = &bmr
		s.ComputedTDEE = &tdee
		s.ComputedBudget = &budget
		s.PaceLbsPerWeek = &pace
	}
}
