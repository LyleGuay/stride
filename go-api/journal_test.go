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

/* ─── mentalStateScore ───────────────────────────────────────────────── */

func TestMentalStateScore_AllEmotions(t *testing.T) {
	cases := []struct {
		tag  string
		want int
	}{
		// Score 5
		{"excited", 5},
		// Score 4
		{"happy", 4},
		{"motivated", 4},
		{"energized", 4},
		{"calm", 4},
		{"content", 4},
		{"grateful", 4},
		// Score 3
		{"neutral", 3},
		// Score 2
		{"bored", 2},
		{"unmotivated", 2},
		{"anxious", 2},
		{"overwhelmed", 2},
		{"low", 2},
		// Score 1
		{"sad", 1},
		{"angry", 1},
		{"frustrated", 1},
		{"depressed", 1},
	}
	for _, tc := range cases {
		got := mentalStateScore(tc.tag)
		if got != tc.want {
			t.Errorf("mentalStateScore(%q) = %d, want %d", tc.tag, got, tc.want)
		}
	}
}

func TestMentalStateScore_EntryTypeTags_ReturnZero(t *testing.T) {
	// Entry-type tags must return 0 so they are skipped during scoring.
	for tag := range entryTypeTags {
		if got := mentalStateScore(tag); got != 0 {
			t.Errorf("mentalStateScore(%q) = %d, want 0 (entry type tag should be skipped)", tag, got)
		}
	}
}

func TestMentalStateScore_UnknownTag_ReturnsZero(t *testing.T) {
	unknowns := []string{"", "unknown", "HAPPY", "excited2", "😊"}
	for _, tag := range unknowns {
		if got := mentalStateScore(tag); got != 0 {
			t.Errorf("mentalStateScore(%q) = %d, want 0", tag, got)
		}
	}
}

/* ─── per-date average scoring (via getJournalSummary logic) ─────────── */

// averageScore replicates the per-date averaging logic from getJournalSummary
// for unit-testing without a database.
func averageScore(tags []string) float64 {
	sum, n := 0, 0
	for _, tag := range tags {
		if s := mentalStateScore(tag); s > 0 {
			sum += s
			n++
		}
	}
	if n == 0 {
		return 0
	}
	score := float64(sum) / float64(n)
	// One-decimal rounding (matches handler logic).
	return float64(int(score*10+0.5)) / 10
}

func TestAverageScore_SingleEmotion(t *testing.T) {
	if got := averageScore([]string{"excited"}); got != 5.0 {
		t.Errorf("got %.1f, want 5.0", got)
	}
}

func TestAverageScore_MixedEmotions(t *testing.T) {
	// happy(4) + depressed(1) = 5/2 = 2.5
	got := averageScore([]string{"happy", "depressed"})
	if got != 2.5 {
		t.Errorf("got %.1f, want 2.5", got)
	}
}

func TestAverageScore_EntryTagsIgnored(t *testing.T) {
	// Entry-type tags don't contribute to the score.
	got := averageScore([]string{"thoughts", "idea", "excited"})
	if got != 5.0 {
		t.Errorf("got %.1f, want 5.0 (entry-type tags should be ignored)", got)
	}
}

func TestAverageScore_NoEmotionTags_ReturnsZero(t *testing.T) {
	got := averageScore([]string{"thoughts", "reminder"})
	if got != 0 {
		t.Errorf("got %.1f, want 0.0 (no emotion tags)", got)
	}
}

func TestAverageScore_EmptyTags_ReturnsZero(t *testing.T) {
	got := averageScore([]string{})
	if got != 0 {
		t.Errorf("got %.1f, want 0.0", got)
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

	// Apr 1: 3 entries, avg of happy(4)+excited(5) = 4.5
	if days[0].Date != "2026-04-01" {
		t.Errorf("day[0].Date = %q, want 2026-04-01", days[0].Date)
	}
	if days[0].EntryCount != 3 {
		t.Errorf("day[0].EntryCount = %d, want 3", days[0].EntryCount)
	}
	if days[0].AvgScore == nil || *days[0].AvgScore != 4.5 {
		t.Errorf("day[0].AvgScore = %v, want 4.5", days[0].AvgScore)
	}

	// Apr 3: 2 entries, avg of anxious(2)+frustrated(1) = 1.5
	if days[1].Date != "2026-04-03" {
		t.Errorf("day[1].Date = %q, want 2026-04-03", days[1].Date)
	}
	if days[1].EntryCount != 2 {
		t.Errorf("day[1].EntryCount = %d, want 2", days[1].EntryCount)
	}
	if days[1].AvgScore == nil || *days[1].AvgScore != 1.5 {
		t.Errorf("day[1].AvgScore = %v, want 1.5", days[1].AvgScore)
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

/* ─── Ensure all emotion tags are covered in scoring ────────────────── */

func TestMentalStateScore_AllEmotionTagsHaveNonZeroScore(t *testing.T) {
	// Every tag in emotionTags must return a score > 0.
	// This guards against adding a new emotion tag without updating the score map.
	for tag := range emotionTags {
		if got := mentalStateScore(tag); got == 0 {
			t.Errorf("emotionTags contains %q but mentalStateScore returns 0 — add it to the score switch", tag)
		}
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
	// Wed bar: 1 entry, score 4.0
	wed := bars[2]
	if wed.EntryCount != 1 {
		t.Errorf("Wed EntryCount = %d, want 1", wed.EntryCount)
	}
	if wed.Score == nil || *wed.Score != 4.0 {
		t.Errorf("Wed Score = %v, want 4.0", wed.Score)
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
	// Day 15 (index 14)
	day15 := bars[14]
	if day15.EntryCount != 1 {
		t.Errorf("day15 EntryCount = %d, want 1", day15.EntryCount)
	}
	if day15.Score == nil || *day15.Score != 4.0 {
		t.Errorf("day15 Score = %v, want 4.0", day15.Score)
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

