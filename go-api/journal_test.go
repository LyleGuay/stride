package main

import (
	"testing"
	"time"
)

// mustDateOnly parses a YYYY-MM-DD string into a DateOnly for test fixtures.
func mustDateOnly(s string) DateOnly {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return DateOnly{t}
}

/* ─── tagDelta ───────────────────────────────────────────────────────── */

func TestTagDelta_Values(t *testing.T) {
	cases := []struct {
		tag     string
		wantD   float64
		wantOk  bool
	}{
		{"excited", 1.00, true},
		{"well_rested", 1.00, true},
		{"happy", 1.00, true},
		{"proud", 0.75, true},
		{"calm", 0.50, true},
		{"neutral", 0.00, true}, // ok=true even though delta is zero
		{"annoyed", -0.50, true},
		{"tired", -0.75, true},
		{"anxious", -1.00, true},
		{"depressed", -1.25, true},
		{"sick", -1.25, true},
		{"thoughts", 0, false}, // entry-type tag
		{"", 0, false},         // unknown
	}
	for _, tc := range cases {
		gotD, gotOk := tagDelta(tc.tag)
		if gotOk != tc.wantOk {
			t.Errorf("tagDelta(%q) ok = %v, want %v", tc.tag, gotOk, tc.wantOk)
		}
		if gotOk && gotD != tc.wantD {
			t.Errorf("tagDelta(%q) delta = %v, want %v", tc.tag, gotD, tc.wantD)
		}
	}
}

func TestTagDelta_EntryTypeTags_ReturnFalse(t *testing.T) {
	// Entry-type tags must return ok=false so they are excluded from scoring.
	for tag := range entryTypeTags {
		if _, ok := tagDelta(tag); ok {
			t.Errorf("tagDelta(%q) ok = true, want false (entry type tag should be skipped)", tag)
		}
	}
}

func TestTagDelta_AllScoringTagsHaveOkTrue(t *testing.T) {
	// Every emotion and condition tag must have a delta registered.
	// This guards against adding a new tag without updating tagDelta.
	for tag := range emotionTags {
		if _, ok := tagDelta(tag); !ok {
			t.Errorf("emotionTags contains %q but tagDelta returns ok=false — add it to the switch", tag)
		}
	}
	for tag := range conditionTags {
		if _, ok := tagDelta(tag); !ok {
			t.Errorf("conditionTags contains %q but tagDelta returns ok=false — add it to the switch", tag)
		}
	}
}

/* ─── additive scoring helper (mirrors per-slot logic without a DB) ──── */

// additiveMentalStateScore replicates the additive scoring logic used by
// buildMentalStateBars and computeCalendarDays for unit tests without a database.
// tagLists is a slice of per-entry tag slices (one inner slice per journal entry).
func additiveMentalStateScore(tagLists [][]string) *float64 {
	tagCounts := make(map[string]int)
	for _, tags := range tagLists {
		for _, tag := range tags {
			if _, ok := tagDelta(tag); ok {
				tagCounts[tag]++
			}
		}
	}
	if len(tagCounts) == 0 {
		return nil
	}
	raw := 2.5
	for tag, count := range tagCounts {
		d, _ := tagDelta(tag)
		raw += d * (1 + 0.25*float64(count-1))
	}
	if raw < 1.0 {
		raw = 1.0
	}
	if raw > 5.0 {
		raw = 5.0
	}
	score := float64(int(raw*10+0.5)) / 10
	return &score
}

func TestAdditiveScore_SingleEmotion(t *testing.T) {
	// happy alone: 2.5 + 1.00 = 3.5
	got := additiveMentalStateScore([][]string{{"happy"}})
	if got == nil || *got != 3.5 {
		t.Errorf("got %v, want 3.5", got)
	}
}

func TestAdditiveScore_NeutralTag(t *testing.T) {
	// neutral: activates baseline but adds no delta → 2.5
	got := additiveMentalStateScore([][]string{{"neutral"}})
	if got == nil || *got != 2.5 {
		t.Errorf("got %v, want 2.5", got)
	}
}

func TestAdditiveScore_EntryTagsIgnored(t *testing.T) {
	// Entry-type tags don't affect the score; excited(+1.00) → 3.5
	got := additiveMentalStateScore([][]string{{"thoughts", "idea", "excited"}})
	if got == nil || *got != 3.5 {
		t.Errorf("got %v, want 3.5 (entry-type tags should be ignored)", got)
	}
}

func TestAdditiveScore_NoEmotionTags_ReturnsNil(t *testing.T) {
	got := additiveMentalStateScore([][]string{{"thoughts", "reminder"}})
	if got != nil {
		t.Errorf("got %v, want nil (no scoring tags)", got)
	}
}

func TestAdditiveScore_SameTagAcrossEntries_DiminishingRepeats(t *testing.T) {
	// 2× happy: 2.5 + 1.00*(1+0.25*1) = 2.5 + 1.25 = 3.75 → rounds to 3.8
	got := additiveMentalStateScore([][]string{{"happy"}, {"happy"}})
	if got == nil || *got != 3.8 {
		t.Errorf("got %v, want 3.8", got)
	}
}

func TestAdditiveScore_TwoPositives(t *testing.T) {
	// happy(+1.00) + excited(+1.00): 2.5 + 2.00 = 4.5
	got := additiveMentalStateScore([][]string{{"happy"}, {"excited"}})
	if got == nil || *got != 4.5 {
		t.Errorf("got %v, want 4.5", got)
	}
}

func TestAdditiveScore_ClampCeiling(t *testing.T) {
	got := additiveMentalStateScore([][]string{{"excited", "well_rested", "happy", "proud", "motivated"}})
	if got == nil || *got != 5.0 {
		t.Errorf("got %v, want 5.0 (ceiling clamp)", got)
	}
}

func TestAdditiveScore_ClampFloor(t *testing.T) {
	got := additiveMentalStateScore([][]string{{"depressed", "sad", "overwhelmed", "anxious", "frustrated"}})
	if got == nil || *got != 1.0 {
		t.Errorf("got %v, want 1.0 (floor clamp)", got)
	}
}

/* ─── computeCalendarDays ────────────────────────────────────────────── */

func TestComputeCalendarDays_Basic(t *testing.T) {
	// 3 entries on Apr 1 (two with emotion tags), 2 on Apr 3 (both with emotion tags).
	rows := []journalSummaryRow{
		{EntryDate: mustDateOnly("2026-04-01"), Tags: []string{"happy"}},      // score 4
		{EntryDate: mustDateOnly("2026-04-01"), Tags: []string{"excited"}},    // score 5
		{EntryDate: mustDateOnly("2026-04-01"), Tags: []string{"thoughts"}},   // no score
		{EntryDate: mustDateOnly("2026-04-03"), Tags: []string{"anxious", "idea"}}, // anxious=2
		{EntryDate: mustDateOnly("2026-04-03"), Tags: []string{"frustrated"}}, // score 1
	}
	days := computeCalendarDays(rows)
	if len(days) != 2 {
		t.Fatalf("want 2 days, got %d", len(days))
	}

	// Apr 1: 3 entries, baseline 2.5 + happy(+1.00) + excited(+1.00) = 4.5
	if days[0].Date != "2026-04-01" {
		t.Errorf("day[0].Date = %q, want 2026-04-01", days[0].Date)
	}
	if days[0].EntryCount != 3 {
		t.Errorf("day[0].EntryCount = %d, want 3", days[0].EntryCount)
	}
	if days[0].AvgScore == nil || *days[0].AvgScore != 4.5 {
		t.Errorf("day[0].AvgScore = %v, want 4.5", days[0].AvgScore)
	}

	// Apr 3: 2 entries, baseline 2.5 + anxious(-1.00) + frustrated(-1.00) = 0.5 → clamped → 1.0
	if days[1].Date != "2026-04-03" {
		t.Errorf("day[1].Date = %q, want 2026-04-03", days[1].Date)
	}
	if days[1].EntryCount != 2 {
		t.Errorf("day[1].EntryCount = %d, want 2", days[1].EntryCount)
	}
	if days[1].AvgScore == nil || *days[1].AvgScore != 1.0 {
		t.Errorf("day[1].AvgScore = %v, want 1.0", days[1].AvgScore)
	}
}

func TestComputeCalendarDays_NoScoringTags_NilAvgScore(t *testing.T) {
	// Entry with only entry-type tags — count is 1, avg_score must be nil.
	rows := []journalSummaryRow{
		{EntryDate: mustDateOnly("2026-04-05"), Tags: []string{"thoughts", "idea"}},
	}
	days := computeCalendarDays(rows)
	if len(days) != 1 {
		t.Fatalf("want 1 day, got %d", len(days))
	}
	if days[0].AvgScore != nil {
		t.Errorf("want nil avg_score for entry with no emotion tags, got %v", days[0].AvgScore)
	}
	if days[0].EntryCount != 1 {
		t.Errorf("want entry_count=1, got %d", days[0].EntryCount)
	}
}

func TestComputeCalendarDays_Empty(t *testing.T) {
	days := computeCalendarDays(nil)
	if len(days) != 0 {
		t.Errorf("want empty result for no rows, got %d days", len(days))
	}
}

/* ─── mondayOf ───────────────────────────────────────────────────────── */

func TestMondayOf_Monday(t *testing.T) {
	mon := time.Date(2026, 4, 6, 15, 30, 0, 0, time.UTC) // Monday Apr 6 2026
	got := mondayOf(mon)
	want := time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("mondayOf(Mon) = %s, want %s", got.Format("2006-01-02"), want.Format("2006-01-02"))
	}
}

func TestMondayOf_Sunday(t *testing.T) {
	sun := time.Date(2026, 4, 5, 0, 0, 0, 0, time.UTC) // Sunday Apr 5 2026
	got := mondayOf(sun)
	want := time.Date(2026, 3, 30, 0, 0, 0, 0, time.UTC) // Monday Mar 30
	if !got.Equal(want) {
		t.Errorf("mondayOf(Sun Apr 5) = %s, want %s", got.Format("2006-01-02"), want.Format("2006-01-02"))
	}
}

func TestMondayOf_Wednesday(t *testing.T) {
	wed := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC) // Wednesday Apr 1 2026
	got := mondayOf(wed)
	want := time.Date(2026, 3, 30, 0, 0, 0, 0, time.UTC) // Monday Mar 30
	if !got.Equal(want) {
		t.Errorf("mondayOf(Wed Apr 1) = %s, want %s", got.Format("2006-01-02"), want.Format("2006-01-02"))
	}
}

/* ─── buildMentalStateBars ───────────────────────────────────────────── */

// mustTime parses a YYYY-MM-DD string into a time.Time (midnight UTC) for test fixtures.
func mustTime(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestBuildMentalStateBars_Week_CorrectSlots(t *testing.T) {
	// Week of Mon Apr 6 – Sun Apr 12 2026; entries only on Wed and Fri.
	rows := []journalSummaryRow{
		{EntryDate: mustDateOnly("2026-04-08"), Tags: []string{"happy"}},    // Wed, score 4
		{EntryDate: mustDateOnly("2026-04-10"), Tags: []string{"thoughts"}}, // Fri, no score
	}
	bars := buildMentalStateBars("week", mustTime("2026-04-06"), rows)

	if len(bars) != 7 {
		t.Fatalf("want 7 bars, got %d", len(bars))
	}
	labels := [7]string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
	for i, bar := range bars {
		if bar.Label != labels[i] {
			t.Errorf("bars[%d].Label = %q, want %q", i, bar.Label, labels[i])
		}
	}
	// Wed bar: 1 entry, baseline 2.5 + happy(+1.00) = 3.5
	wed := bars[2]
	if wed.EntryCount != 1 {
		t.Errorf("Wed EntryCount = %d, want 1", wed.EntryCount)
	}
	if wed.Score == nil || *wed.Score != 3.5 {
		t.Errorf("Wed Score = %v, want 3.5", wed.Score)
	}
	// Fri bar: 1 entry (entry-type tag only), score nil
	fri := bars[4]
	if fri.EntryCount != 1 {
		t.Errorf("Fri EntryCount = %d, want 1", fri.EntryCount)
	}
	if fri.Score != nil {
		t.Errorf("Fri Score = %v, want nil (no scoring tags)", fri.Score)
	}
	// Mon bar (no entries)
	if bars[0].EntryCount != 0 || bars[0].Score != nil {
		t.Errorf("Mon bar should be empty, got EntryCount=%d Score=%v", bars[0].EntryCount, bars[0].Score)
	}
}

func TestBuildMentalStateBars_Month_CorrectCount(t *testing.T) {
	// April 2026 has 30 days.
	rows := []journalSummaryRow{
		{EntryDate: mustDateOnly("2026-04-15"), Tags: []string{"calm"}}, // score 4
	}
	bars := buildMentalStateBars("month", mustTime("2026-04-01"), rows)
	if len(bars) != 30 {
		t.Fatalf("want 30 bars for April, got %d", len(bars))
	}
	if bars[0].Label != "1" {
		t.Errorf("bars[0].Label = %q, want %q", bars[0].Label, "1")
	}
	if bars[29].Label != "30" {
		t.Errorf("bars[29].Label = %q, want %q", bars[29].Label, "30")
	}
	// Day 15 (index 14): baseline 2.5 + calm(+0.50) = 3.0
	day15 := bars[14]
	if day15.EntryCount != 1 {
		t.Errorf("day15 EntryCount = %d, want 1", day15.EntryCount)
	}
	if day15.Score == nil || *day15.Score != 3.0 {
		t.Errorf("day15 Score = %v, want 3.0", day15.Score)
	}
}

func TestBuildMentalStateBars_6m_CorrectSlots(t *testing.T) {
	// 6m range always produces 26 bars.
	bars := buildMentalStateBars("6m", mustTime("2026-01-05"), nil)
	if len(bars) != 26 {
		t.Fatalf("want 26 bars for 6m, got %d", len(bars))
	}
	if bars[0].Label != "W1" {
		t.Errorf("bars[0].Label = %q, want W1", bars[0].Label)
	}
	if bars[25].Label != "W26" {
		t.Errorf("bars[25].Label = %q, want W26", bars[25].Label)
	}
}

func TestBuildMentalStateBars_1yr_CorrectSlots(t *testing.T) {
	bars := buildMentalStateBars("1yr", mustTime("2025-04-07"), nil)
	if len(bars) != 52 {
		t.Fatalf("want 52 bars for 1yr, got %d", len(bars))
	}
}

func TestBuildMentalStateBars_EmotionsCollected(t *testing.T) {
	// In week mode, each day is its own bar. Verify emotions per day and
	// that entry-type tags are excluded from the emotions list.
	rows := []journalSummaryRow{
		// Two entries on Mon Apr 6: one emotion, one entry-type tag.
		{EntryDate: mustDateOnly("2026-04-06"), Tags: []string{"happy", "thoughts"}},
		{EntryDate: mustDateOnly("2026-04-06"), Tags: []string{"anxious"}},
	}
	bars := buildMentalStateBars("week", mustTime("2026-04-06"), rows)
	// Mon bar: 2 entries, emotions = ["anxious", "happy"] (sorted); "thoughts" excluded.
	if len(bars[0].Emotions) != 2 {
		t.Fatalf("Mon Emotions = %v, want [anxious happy]", bars[0].Emotions)
	}
	if bars[0].Emotions[0] != "anxious" || bars[0].Emotions[1] != "happy" {
		t.Errorf("Mon Emotions = %v, want [anxious happy]", bars[0].Emotions)
	}
	// Tue bar has no entries.
	if bars[1].EntryCount != 0 {
		t.Errorf("Tue EntryCount = %d, want 0", bars[1].EntryCount)
	}
}

func TestBuildMentalStateBars_WeeklyGrouping_6m(t *testing.T) {
	// In 6m mode, entries across the same ISO week should be grouped into one bar.
	// Week of Mon Mar 30 2026 (index 0 if startDate is Mar 30).
	rows := []journalSummaryRow{
		{EntryDate: mustDateOnly("2026-03-30"), Tags: []string{"happy"}},   // Mon
		{EntryDate: mustDateOnly("2026-04-01"), Tags: []string{"anxious"}}, // Wed — same week
	}
	bars := buildMentalStateBars("6m", mustTime("2026-03-30"), rows)
	if len(bars) != 26 {
		t.Fatalf("want 26 bars, got %d", len(bars))
	}
	// Both entries land in W1 (the first bar).
	w1 := bars[0]
	if w1.EntryCount != 2 {
		t.Errorf("W1 EntryCount = %d, want 2", w1.EntryCount)
	}
	if len(w1.Emotions) != 2 {
		t.Fatalf("W1 Emotions = %v, want [anxious happy]", w1.Emotions)
	}
	if w1.Emotions[0] != "anxious" || w1.Emotions[1] != "happy" {
		t.Errorf("W1 Emotions = %v, want [anxious happy]", w1.Emotions)
	}
}

