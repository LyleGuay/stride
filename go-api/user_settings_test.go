package main

import "testing"

// ptr helpers — avoid &literal syntax for primitive types in test data.
func intPtr(v int) *int       { return &v }
func strPtr(v string) *string { return &v }

/* ─── shouldRecordConfigHistory tests ────────────────────────────────── */

// TestShouldRecordConfigHistory_BudgetChanged verifies that a budget patch with a
// new value (different from current) returns true.
func TestShouldRecordConfigHistory_BudgetChanged(t *testing.T) {
	body := patchUserSettingsRequest{CalorieBudget: intPtr(2000)}
	cur := calorieLogUserSettings{CalorieBudget: 2300}
	if !shouldRecordConfigHistory(body, &cur) {
		t.Error("expected true when calorie_budget changes, got false")
	}
}

// TestShouldRecordConfigHistory_BudgetSame verifies that patching calorie_budget
// with the same value as current does not trigger a history record.
func TestShouldRecordConfigHistory_BudgetSame(t *testing.T) {
	body := patchUserSettingsRequest{CalorieBudget: intPtr(2300)}
	cur := calorieLogUserSettings{CalorieBudget: 2300}
	if shouldRecordConfigHistory(body, &cur) {
		t.Error("expected false when calorie_budget unchanged, got true")
	}
}

// TestShouldRecordConfigHistory_ActivityLevelChanged verifies that patching
// activity_level with a new value returns true.
func TestShouldRecordConfigHistory_ActivityLevelChanged(t *testing.T) {
	oldLevel := "sedentary"
	body := patchUserSettingsRequest{ActivityLevel: strPtr("moderate")}
	cur := calorieLogUserSettings{ActivityLevel: &oldLevel}
	if !shouldRecordConfigHistory(body, &cur) {
		t.Error("expected true when activity_level changes, got false")
	}
}

// TestShouldRecordConfigHistory_ActivityLevelSame verifies that patching
// activity_level with the same value as current does not trigger a history record.
func TestShouldRecordConfigHistory_ActivityLevelSame(t *testing.T) {
	level := "moderate"
	body := patchUserSettingsRequest{ActivityLevel: strPtr("moderate")}
	cur := calorieLogUserSettings{ActivityLevel: &level}
	if shouldRecordConfigHistory(body, &cur) {
		t.Error("expected false when activity_level unchanged, got true")
	}
}

// TestShouldRecordConfigHistory_ActivityLevelFromNil verifies that setting
// activity_level when the current value is nil (never been set) returns true.
func TestShouldRecordConfigHistory_ActivityLevelFromNil(t *testing.T) {
	body := patchUserSettingsRequest{ActivityLevel: strPtr("moderate")}
	cur := calorieLogUserSettings{ActivityLevel: nil}
	if !shouldRecordConfigHistory(body, &cur) {
		t.Error("expected true when activity_level changes from nil, got false")
	}
}

// TestShouldRecordConfigHistory_UnrelatedField verifies that patching an
// unrelated field (e.g. protein_target_g) does not trigger a history record.
func TestShouldRecordConfigHistory_UnrelatedField(t *testing.T) {
	body := patchUserSettingsRequest{ProteinTargetG: intPtr(150)}
	cur := calorieLogUserSettings{CalorieBudget: 2300}
	if shouldRecordConfigHistory(body, &cur) {
		t.Error("expected false when only unrelated field patched, got true")
	}
}

// TestShouldRecordConfigHistory_BothChanging verifies that when both budget and
// activity_level change simultaneously, true is returned.
func TestShouldRecordConfigHistory_BothChanging(t *testing.T) {
	oldLevel := "sedentary"
	body := patchUserSettingsRequest{
		CalorieBudget: intPtr(2000),
		ActivityLevel: strPtr("active"),
	}
	cur := calorieLogUserSettings{CalorieBudget: 2300, ActivityLevel: &oldLevel}
	if !shouldRecordConfigHistory(body, &cur) {
		t.Error("expected true when both budget and activity_level change, got false")
	}
}
