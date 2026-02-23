package main

import (
	"math"
	"testing"
	"time"
)

// makeSettings constructs a fully-populated calorieLogUserSettings pointer for
// use in computeTDEE tests. All required profile fields are set; individual
// tests nil out specific fields to exercise missing-field guards.
func makeSettings(sex string, dobYear int, heightCM, weightLBS, targetWeightLBS float64, activityLevel string, targetDate time.Time) *calorieLogUserSettings {
	dob := DateOnly{time.Date(dobYear, 1, 1, 0, 0, 0, 0, time.UTC)}
	td := DateOnly{targetDate}
	return &calorieLogUserSettings{
		Sex:             &sex,
		DateOfBirth:     &dob,
		HeightCM:        &heightCM,
		WeightLBS:       &weightLBS,
		ActivityLevel:   &activityLevel,
		TargetWeightLBS: &targetWeightLBS,
		TargetDate:      &td,
	}
}

// futureTargetDate returns a target date 52 weeks from now, used as the default
// valid target date in tests that don't care about the specific date.
func futureTargetDate() time.Time {
	return time.Now().UTC().AddDate(0, 0, 52*7)
}

/* ─── Missing-field guard tests ──────────────────────────────────────── */

// TestComputeTDEE_MissingFields verifies that ok=false is returned when any
// required profile field is nil. Each sub-test nils out one field on an
// otherwise-valid settings struct.
func TestComputeTDEE_MissingFields(t *testing.T) {
	cases := []struct {
		name  string
		mutFn func(s *calorieLogUserSettings)
	}{
		{"nil Sex", func(s *calorieLogUserSettings) { s.Sex = nil }},
		{"nil DateOfBirth", func(s *calorieLogUserSettings) { s.DateOfBirth = nil }},
		{"nil HeightCM", func(s *calorieLogUserSettings) { s.HeightCM = nil }},
		{"nil WeightLBS", func(s *calorieLogUserSettings) { s.WeightLBS = nil }},
		{"nil ActivityLevel", func(s *calorieLogUserSettings) { s.ActivityLevel = nil }},
		{"nil TargetWeightLBS", func(s *calorieLogUserSettings) { s.TargetWeightLBS = nil }},
		{"nil TargetDate", func(s *calorieLogUserSettings) { s.TargetDate = nil }},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := makeSettings("male", 1990, 175, 180, 160, "sedentary", futureTargetDate())
			tc.mutFn(s)
			_, _, _, _, ok := computeTDEE(s)
			if ok {
				t.Errorf("expected ok=false when %s is nil, got ok=true", tc.name)
			}
		})
	}
}

/* ─── Input validation guard tests ───────────────────────────────────── */

// TestComputeTDEE_UnknownActivityLevel verifies that an unrecognised activity
// level string produces ok=false.
func TestComputeTDEE_UnknownActivityLevel(t *testing.T) {
	s := makeSettings("male", 1990, 175, 180, 160, "unknown", futureTargetDate())
	_, _, _, _, ok := computeTDEE(s)
	if ok {
		t.Error("expected ok=false for unknown activity level, got ok=true")
	}
}

// TestComputeTDEE_PastTargetDate verifies that a target date in the past
// produces ok=false (the computed budget would be meaningless).
func TestComputeTDEE_PastTargetDate(t *testing.T) {
	past := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	s := makeSettings("male", 1990, 175, 180, 160, "sedentary", past)
	_, _, _, _, ok := computeTDEE(s)
	if ok {
		t.Error("expected ok=false for target date in the past, got ok=true")
	}
}

// TestComputeTDEE_FutureDOB verifies that a date of birth in the future
// (which yields a negative age) produces ok=false.
func TestComputeTDEE_FutureDOB(t *testing.T) {
	futureDOBYear := time.Now().Year() + 1
	s := makeSettings("male", futureDOBYear, 175, 180, 160, "sedentary", futureTargetDate())
	_, _, _, _, ok := computeTDEE(s)
	if ok {
		t.Error("expected ok=false for future date of birth, got ok=true")
	}
}

// TestComputeTDEE_AgeTooHigh verifies that a date of birth 200 years ago
// (age > 130) produces ok=false.
func TestComputeTDEE_AgeTooHigh(t *testing.T) {
	ancientDOBYear := time.Now().Year() - 200
	s := makeSettings("male", ancientDOBYear, 175, 180, 160, "sedentary", futureTargetDate())
	_, _, _, _, ok := computeTDEE(s)
	if ok {
		t.Error("expected ok=false for age > 130, got ok=true")
	}
}

/* ─── BMR accuracy tests ─────────────────────────────────────────────── */

// TestComputeTDEE_MaleBMR verifies the male Mifflin-St Jeor BMR formula using
// known inputs. Age is computed from DOB at runtime so tolerance is ±10 to
// account for off-by-one when the birthday falls after today in the test year.
//
// Inputs: male, born 1990-01-01 (~36 years old in 2026), 175cm, 180lbs, sedentary.
// Expected BMR: weightKG=180/2.20462≈81.65, bmrF=10*81.65+6.25*175-5*36+5=1735.25
func TestComputeTDEE_MaleBMR(t *testing.T) {
	s := makeSettings("male", 1990, 175, 180, 160, "sedentary", futureTargetDate())
	bmr, _, _, _, ok := computeTDEE(s)
	if !ok {
		t.Fatal("expected ok=true, got ok=false")
	}
	// Tolerance of ±10 covers one year of BMR difference (~5 cal) plus rounding.
	expected := 1735.0
	if math.Abs(float64(bmr)-expected) >= 10 {
		t.Errorf("male BMR = %d, want ~%.0f (tolerance ±10)", bmr, expected)
	}
}

// TestComputeTDEE_FemaleBMR verifies the female Mifflin-St Jeor BMR formula
// using the same inputs as the male test but with sex="female".
//
// Expected BMR: same as male but -161 instead of +5: 1569.25
func TestComputeTDEE_FemaleBMR(t *testing.T) {
	s := makeSettings("female", 1990, 175, 180, 160, "sedentary", futureTargetDate())
	bmr, _, _, _, ok := computeTDEE(s)
	if !ok {
		t.Fatal("expected ok=true, got ok=false")
	}
	expected := 1569.0
	if math.Abs(float64(bmr)-expected) >= 10 {
		t.Errorf("female BMR = %d, want ~%.0f (tolerance ±10)", bmr, expected)
	}
}

/* ─── Pace capping / flooring tests ─────────────────────────────────── */

// TestComputeTDEE_PaceCappedAt2 verifies that an extreme weight-loss goal
// (300lbs → 100lbs in 10 weeks) is capped at 2 lbs/week.
func TestComputeTDEE_PaceCappedAt2(t *testing.T) {
	tenWeeksOut := time.Now().UTC().AddDate(0, 0, 10*7)
	s := makeSettings("male", 1990, 175, 300, 100, "sedentary", tenWeeksOut)
	_, _, _, pace, ok := computeTDEE(s)
	if !ok {
		t.Fatal("expected ok=true, got ok=false")
	}
	if pace != 2.0 {
		t.Errorf("expected pace capped at 2.0, got %f", pace)
	}
}

// TestComputeTDEE_PaceFlooredAt0_25 verifies that when the current weight is
// already at or below the target (a gaining scenario), pace is floored at 0.25.
func TestComputeTDEE_PaceFlooredAt0_25(t *testing.T) {
	// currentWeight (150) < targetWeight (160): raw pace is negative, must floor to 0.25
	s := makeSettings("male", 1990, 175, 150, 160, "sedentary", futureTargetDate())
	_, _, _, pace, ok := computeTDEE(s)
	if !ok {
		t.Fatal("expected ok=true, got ok=false")
	}
	if pace != 0.25 {
		t.Errorf("expected pace floored at 0.25, got %f", pace)
	}
}

/* ─── currentMonday tests ────────────────────────────────────────────── */

// TestCurrentMonday_ReturnsMonday verifies that the returned time's weekday is Monday.
func TestCurrentMonday_ReturnsMonday(t *testing.T) {
	monday := currentMonday()
	if monday.Weekday() != time.Monday {
		t.Errorf("currentMonday() returned %s, want Monday", monday.Weekday())
	}
}

// TestCurrentMonday_MidnightUTC verifies that the returned time is at midnight
// UTC with no hour, minute, second, or nanosecond component.
func TestCurrentMonday_MidnightUTC(t *testing.T) {
	monday := currentMonday()
	if monday.Hour() != 0 || monday.Minute() != 0 || monday.Second() != 0 || monday.Nanosecond() != 0 {
		t.Errorf("currentMonday() returned non-midnight time: %v", monday)
	}
	if monday.Location() != time.UTC {
		t.Errorf("currentMonday() returned non-UTC location: %v", monday.Location())
	}
}
