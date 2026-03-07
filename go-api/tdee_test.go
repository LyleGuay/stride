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

// TestComputeTDEE_PaceCappedAtNeg2 verifies that an extreme weight-loss goal
// (300lbs → 100lbs in 10 weeks) is capped at -2 lbs/week.
// After the sign-flip: loss pace is negative, so the cap is -2.
func TestComputeTDEE_PaceCappedAtNeg2(t *testing.T) {
	tenWeeksOut := time.Now().UTC().AddDate(0, 0, 10*7)
	s := makeSettings("male", 1990, 175, 300, 100, "sedentary", tenWeeksOut)
	_, _, _, pace, ok := computeTDEE(s)
	if !ok {
		t.Fatal("expected ok=true, got ok=false")
	}
	if pace != -2.0 {
		t.Errorf("expected loss pace capped at -2.0, got %f", pace)
	}
}

// TestComputeTDEE_SlowLossPaceSnapsToZero verifies that a very slow weight-loss
// goal produces pace = 0 (maintenance budget) rather than a tiny non-zero value.
// |pace| < 0.1 snaps to 0 because the budget adjustment would be within TDEE noise.
func TestComputeTDEE_SlowLossPaceSnapsToZero(t *testing.T) {
	// 1 lb to lose over 100 weeks → raw pace ≈ -0.01, snaps to 0
	farFuture := time.Now().UTC().AddDate(0, 0, 100*7)
	s := makeSettings("male", 1990, 175, 161, 160, "sedentary", farFuture)
	_, _, _, pace, ok := computeTDEE(s)
	if !ok {
		t.Fatal("expected ok=true, got ok=false")
	}
	if pace != 0 {
		t.Errorf("expected slow loss pace to snap to 0, got %f", pace)
	}
}

// TestComputeTDEE_SlowGainPaceSnapsToZero verifies that a very slow weight-gain
// goal produces pace = 0 (maintenance budget) rather than a tiny non-zero value.
func TestComputeTDEE_SlowGainPaceSnapsToZero(t *testing.T) {
	// 10 lbs to gain over 500 weeks → raw pace ≈ 0.02, snaps to 0
	veryFarFuture := time.Now().UTC().AddDate(0, 0, 500*7)
	s := makeSettings("male", 1990, 175, 150, 160, "sedentary", veryFarFuture)
	_, _, _, pace, ok := computeTDEE(s)
	if !ok {
		t.Fatal("expected ok=true, got ok=false")
	}
	if pace != 0 {
		t.Errorf("expected slow gain pace to snap to 0, got %f", pace)
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

/* ─── tdeeForDay tests ────────────────────────────────────────────────────── */

// knownProfile returns a settings struct with fully populated profile fields
// for a male, 180 cm, moderate activity — DOB 1994-01-01, used across tests.
func knownProfile() calorieLogUserSettings {
	sex := "male"
	heightCM := 180.0
	actLevel := "moderate"
	dob := DateOnly{time.Date(1994, 1, 1, 0, 0, 0, 0, time.UTC)}
	return calorieLogUserSettings{
		Sex:         &sex,
		HeightCM:    &heightCM,
		ActivityLevel: &actLevel,
		DateOfBirth: &dob,
	}
}

// TestTdeeForDay_KnownValues verifies the Mifflin-St Jeor calculation for a
// known profile and weight. Hand-calculated:
//
//	age=30 (asOf 2024-06-15, DOB 1994-01-01)
//	weightKG = 180/2.20462 ≈ 81.647
//	BMR = 10*81.647 + 6.25*180 - 5*30 + 5 = 816.47 + 1125 - 150 + 5 = 1796.47
//	TDEE = 1796.47 * 1.55 (moderate) ≈ 2784.53
func TestTdeeForDay_KnownValues(t *testing.T) {
	s := knownProfile()
	asOf := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)
	tdee, ok := tdeeForDay(&s, 180.0, "moderate", asOf)
	if !ok {
		t.Fatal("expected ok=true, got false")
	}
	expected := 2784.53
	if math.Abs(tdee-expected) > 1.0 {
		t.Errorf("expected TDEE ≈ %.2f, got %.2f", expected, tdee)
	}
}

// TestTdeeForDay_MissingProfile verifies ok=false when required profile fields are nil.
func TestTdeeForDay_MissingProfile(t *testing.T) {
	var s calorieLogUserSettings // all nil
	_, ok := tdeeForDay(&s, 180.0, "moderate", time.Now())
	if ok {
		t.Error("expected ok=false for nil profile, got true")
	}
}

// TestTdeeForDay_UnknownActivityLevel verifies ok=false for an unrecognized level.
func TestTdeeForDay_UnknownActivityLevel(t *testing.T) {
	s := knownProfile()
	_, ok := tdeeForDay(&s, 180.0, "couch_potato", time.Now())
	if ok {
		t.Error("expected ok=false for unknown activity level, got true")
	}
}

// TestTdeeForDay_AgeComputedFromAsOfDate verifies that age is derived from
// asOfDate, not today. One day before birthday → age-1; one day after → age.
func TestTdeeForDay_AgeComputedFromAsOfDate(t *testing.T) {
	s := knownProfile() // DOB 1994-01-01
	// One day before 30th birthday → age should be 29
	tdee29, ok := tdeeForDay(&s, 180.0, "moderate", time.Date(2023, 12, 31, 0, 0, 0, 0, time.UTC))
	if !ok {
		t.Fatal("expected ok=true for age-29 case")
	}
	// One day after 30th birthday → age should be 30
	tdee30, ok := tdeeForDay(&s, 180.0, "moderate", time.Date(2024, 1, 2, 0, 0, 0, 0, time.UTC))
	if !ok {
		t.Fatal("expected ok=true for age-30 case")
	}
	// Younger age → slightly higher BMR (less deducted from -5*age term)
	if tdee29 <= tdee30 {
		t.Errorf("expected TDEE at age 29 (%.2f) > TDEE at age 30 (%.2f)", tdee29, tdee30)
	}
}

/* ─── weightAtOrBefore tests ──────────────────────────────────────────────── */

// makeWeightEntries builds a []weightEntry from alternating date/weight pairs.
func makeWeightEntries(pairs ...any) []weightEntry {
	entries := make([]weightEntry, 0, len(pairs)/2)
	for i := 0; i < len(pairs)-1; i += 2 {
		t, _ := time.Parse("2006-01-02", pairs[i].(string))
		entries = append(entries, weightEntry{Date: DateOnly{t}, WeightLBS: pairs[i+1].(float64)})
	}
	return entries
}

// TestWeightAtOrBefore_ReturnsClosestOnOrBefore verifies the most recent entry
// on or before the query date is returned.
func TestWeightAtOrBefore_ReturnsClosestOnOrBefore(t *testing.T) {
	entries := makeWeightEntries("2024-01-01", 200.0, "2024-01-10", 198.0, "2024-01-20", 196.0)
	if w := weightAtOrBefore(entries, "2024-01-15", 999.0); w != 198.0 {
		t.Errorf("expected 198.0, got %.1f", w)
	}
}

// TestWeightAtOrBefore_ExactDateMatch verifies an exact date match is returned.
func TestWeightAtOrBefore_ExactDateMatch(t *testing.T) {
	entries := makeWeightEntries("2024-01-10", 198.0, "2024-01-20", 196.0)
	if w := weightAtOrBefore(entries, "2024-01-10", 999.0); w != 198.0 {
		t.Errorf("expected 198.0, got %.1f", w)
	}
}

// TestWeightAtOrBefore_FallbackWhenNoneQualify verifies fallback is returned
// when all entries are after the query date.
func TestWeightAtOrBefore_FallbackWhenNoneQualify(t *testing.T) {
	entries := makeWeightEntries("2024-06-01", 200.0)
	if w := weightAtOrBefore(entries, "2024-01-01", 150.0); w != 150.0 {
		t.Errorf("expected fallback 150.0, got %.1f", w)
	}
}

// TestWeightAtOrBefore_EmptyEntries verifies fallback is returned for an empty slice.
func TestWeightAtOrBefore_EmptyEntries(t *testing.T) {
	if w := weightAtOrBefore([]weightEntry{}, "2024-01-01", 175.0); w != 175.0 {
		t.Errorf("expected fallback 175.0, got %.1f", w)
	}
}

// TestWeightAtOrBefore_MostRecentWhenMultipleQualify verifies the last qualifying
// entry is returned when multiple entries precede the query date.
func TestWeightAtOrBefore_MostRecentWhenMultipleQualify(t *testing.T) {
	entries := makeWeightEntries("2024-01-01", 200.0, "2024-01-05", 199.0, "2024-01-10", 198.0)
	if w := weightAtOrBefore(entries, "2024-01-31", 999.0); w != 198.0 {
		t.Errorf("expected most recent 198.0, got %.1f", w)
	}
}

/* ─── configForDate tests ─────────────────────────────────────────────────── */

// makeConfigHistory builds a []calorieConfigHistory from alternating date/budget pairs.
func makeConfigHistory(pairs ...any) []calorieConfigHistory {
	history := make([]calorieConfigHistory, 0, len(pairs)/2)
	for i := 0; i < len(pairs)-1; i += 2 {
		t, _ := time.Parse("2006-01-02", pairs[i].(string))
		history = append(history, calorieConfigHistory{
			ValidUntil:    DateOnly{t},
			CalorieBudget: pairs[i+1].(int),
		})
	}
	return history
}

func settingsWithBudget(budget int) *calorieLogUserSettings {
	level := "moderate"
	return &calorieLogUserSettings{CalorieBudget: budget, ActivityLevel: &level}
}

// TestConfigForDate_UsesHistoryWhenDateInRange verifies the first history row
// with valid_until >= query date is returned.
func TestConfigForDate_UsesHistoryWhenDateInRange(t *testing.T) {
	// Budget was 2200 until Jan 31, then 2000 until Feb 28, current=1800
	history := makeConfigHistory("2024-01-31", 2200, "2024-02-28", 2000)
	settings := settingsWithBudget(1800)

	if b, _ := configForDate(history, settings, "2024-01-15"); b != 2200 {
		t.Errorf("expected 2200 for Jan 15, got %d", b)
	}
	if b, _ := configForDate(history, settings, "2024-02-10"); b != 2000 {
		t.Errorf("expected 2000 for Feb 10, got %d", b)
	}
}

// TestConfigForDate_FallsBackToCurrentSettings verifies that dates after all
// history records return current settings.
func TestConfigForDate_FallsBackToCurrentSettings(t *testing.T) {
	history := makeConfigHistory("2024-01-31", 2200)
	settings := settingsWithBudget(1800)
	if b, _ := configForDate(history, settings, "2024-03-01"); b != 1800 {
		t.Errorf("expected current budget 1800 for Mar 1, got %d", b)
	}
}

// TestConfigForDate_EmptyHistoryReturnsCurrentSettings verifies the no-history
// case — current settings apply for any date.
func TestConfigForDate_EmptyHistoryReturnsCurrentSettings(t *testing.T) {
	settings := settingsWithBudget(2300)
	if b, _ := configForDate([]calorieConfigHistory{}, settings, "2023-06-01"); b != 2300 {
		t.Errorf("expected 2300, got %d", b)
	}
}
