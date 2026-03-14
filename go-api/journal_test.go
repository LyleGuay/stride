package main

import "testing"

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

