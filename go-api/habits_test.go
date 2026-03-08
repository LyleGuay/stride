package main

import (
	"testing"
	"time"
)

// makeLog builds a habitLog with the given date string (YYYY-MM-DD) and level.
func makeLog(dateStr string, level int) habitLog {
	t, _ := time.Parse("2006-01-02", dateStr)
	return habitLog{Level: level, Date: DateOnly{t}}
}

// makeLogs builds a slice of habitLogs from a list of date strings, all at level 1.
func makeLogs(dates ...string) []habitLog {
	logs := make([]habitLog, len(dates))
	for i, d := range dates {
		logs[i] = makeLog(d, 1)
	}
	return logs
}

func day(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

/* ─── Daily streak tests ─────────────────────────────────────────────── */

func TestDailyStreak_UnbrokenStreak(t *testing.T) {
	today := day("2026-03-07")
	logs := makeLogs("2026-03-05", "2026-03-06", "2026-03-07")
	cur, long := computeHabitStreak(logs, "daily", 1, today)
	if cur != 3 {
		t.Errorf("current streak: want 3, got %d", cur)
	}
	if long != 3 {
		t.Errorf("longest streak: want 3, got %d", long)
	}
}

func TestDailyStreak_GapBreaksStreak(t *testing.T) {
	today := day("2026-03-07")
	// Gap on Mar 5 — streak is only today + yesterday.
	logs := makeLogs("2026-03-04", "2026-03-06", "2026-03-07")
	cur, long := computeHabitStreak(logs, "daily", 1, today)
	if cur != 2 {
		t.Errorf("current streak: want 2, got %d", cur)
	}
	// Longest includes the isolated Mar 4 entry (1) vs current run (2).
	if long != 2 {
		t.Errorf("longest streak: want 2, got %d", long)
	}
}

func TestDailyStreak_TodayNotLoggedYesterdayWas(t *testing.T) {
	// Today is not yet logged but yesterday was — streak continues from yesterday.
	today := day("2026-03-07")
	logs := makeLogs("2026-03-04", "2026-03-05", "2026-03-06")
	cur, long := computeHabitStreak(logs, "daily", 1, today)
	if cur != 3 {
		t.Errorf("current streak: want 3 (today not logged yet), got %d", cur)
	}
	if long != 3 {
		t.Errorf("longest streak: want 3, got %d", long)
	}
}

func TestDailyStreak_NoLogs(t *testing.T) {
	today := day("2026-03-07")
	cur, long := computeHabitStreak(nil, "daily", 1, today)
	if cur != 0 || long != 0 {
		t.Errorf("empty logs: want (0,0), got (%d,%d)", cur, long)
	}
}

func TestDailyStreak_SingleDayToday(t *testing.T) {
	today := day("2026-03-07")
	logs := makeLogs("2026-03-07")
	cur, long := computeHabitStreak(logs, "daily", 1, today)
	if cur != 1 {
		t.Errorf("current: want 1, got %d", cur)
	}
	if long != 1 {
		t.Errorf("longest: want 1, got %d", long)
	}
}

func TestDailyStreak_LongestTrackedAcrossMultipleRuns(t *testing.T) {
	// Mar 1–3 (3-day run), gap on Mar 4, Mar 5–7 (3-day run).
	today := day("2026-03-07")
	logs := makeLogs("2026-03-01", "2026-03-02", "2026-03-03", "2026-03-05", "2026-03-06", "2026-03-07")
	cur, long := computeHabitStreak(logs, "daily", 1, today)
	if cur != 3 {
		t.Errorf("current: want 3, got %d", cur)
	}
	if long != 3 {
		t.Errorf("longest: want 3, got %d", long)
	}
}

func TestDailyStreak_LongestLongerThanCurrent(t *testing.T) {
	// Historic 5-day run (Feb 20–24), then gap, then only today logged.
	today := day("2026-03-07")
	logs := makeLogs(
		"2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23", "2026-02-24",
		"2026-03-07",
	)
	cur, long := computeHabitStreak(logs, "daily", 1, today)
	if cur != 1 {
		t.Errorf("current: want 1, got %d", cur)
	}
	if long != 5 {
		t.Errorf("longest: want 5, got %d", long)
	}
}

/* ─── Weekly streak tests ────────────────────────────────────────────── */

func TestWeeklyStreak_TargetMet(t *testing.T) {
	// Week of Feb 23 (Mon) — 3 logs, target=3: streak = 1.
	today := day("2026-03-07") // week of Mar 2 has no logs → streak ends there
	logs := makeLogs("2026-02-23", "2026-02-25", "2026-02-27")
	cur, long := computeHabitStreak(logs, "weekly", 3, today)
	// Current week (Mar 2–8): 0 logs < target → streak breaks → current=0.
	// Week of Feb 23: 3 logs >= target → run=1.
	if cur != 0 {
		t.Errorf("current: want 0 (current week below target), got %d", cur)
	}
	if long != 1 {
		t.Errorf("longest: want 1, got %d", long)
	}
}

func TestWeeklyStreak_TargetMetCurrentWeek(t *testing.T) {
	// Current week (Mar 2–7) has 3 logs; target=3.
	today := day("2026-03-07")
	logs := makeLogs("2026-03-02", "2026-03-04", "2026-03-06")
	cur, long := computeHabitStreak(logs, "weekly", 3, today)
	if cur != 1 {
		t.Errorf("current: want 1, got %d", cur)
	}
	if long != 1 {
		t.Errorf("longest: want 1, got %d", long)
	}
}

func TestWeeklyStreak_BelowTargetBreaksStreak(t *testing.T) {
	today := day("2026-03-07")
	// Two weeks ago: 3 logs (target met). Last week: 2 logs (target=3, missed). This week: 3 logs.
	logs := makeLogs(
		"2026-02-16", "2026-02-17", "2026-02-18", // week of Feb 16: 3 logs ✓
		"2026-02-23", "2026-02-24",               // week of Feb 23: 2 logs ✗ (target=3)
		"2026-03-02", "2026-03-03", "2026-03-04", // week of Mar 2: 3 logs ✓
	)
	cur, long := computeHabitStreak(logs, "weekly", 3, today)
	if cur != 1 {
		t.Errorf("current: want 1 (gap last week broke streak), got %d", cur)
	}
	if long != 1 {
		t.Errorf("longest: want 1, got %d", long)
	}
}

func TestWeeklyStreak_ConsecutiveWeeks(t *testing.T) {
	today := day("2026-03-07")
	// Three consecutive weeks all meeting target=2.
	logs := makeLogs(
		"2026-02-16", "2026-02-17", // week of Feb 16
		"2026-02-23", "2026-02-24", // week of Feb 23
		"2026-03-02", "2026-03-03", // week of Mar 2 (current)
	)
	cur, long := computeHabitStreak(logs, "weekly", 2, today)
	if cur != 3 {
		t.Errorf("current: want 3, got %d", cur)
	}
	if long != 3 {
		t.Errorf("longest: want 3, got %d", long)
	}
}
