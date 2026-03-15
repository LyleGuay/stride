package main

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

/* ─── Streak computation ─────────────────────────────────────────────── */

// computeHabitStreak computes the current and longest streak for a habit given
// its full log history. logs must be sorted ascending by date.
//
// Daily habits: count consecutive days backwards from today (or yesterday if
// today has no log entry yet) where a log row exists.
//
// Weekly habits: count consecutive Mon–Sun weeks backwards where the number of
// log entries in that week meets or exceeds weeklyTarget.
func computeHabitStreak(logs []habitLog, freq string, weeklyTarget int, today time.Time) (current, longest int) {
	if len(logs) == 0 {
		return 0, 0
	}

	// Build a set of logged dates for O(1) lookup.
	loggedDates := make(map[string]bool, len(logs))
	for _, l := range logs {
		loggedDates[l.Date.Time.Format("2006-01-02")] = true
	}

	if freq == "daily" {
		return computeDailyStreak(loggedDates, today)
	}
	return computeWeeklyStreak(logs, weeklyTarget, today)
}

// computeDailyStreak walks backwards from today (or yesterday if today has no
// entry) and counts consecutive days with a log entry.
func computeDailyStreak(loggedDates map[string]bool, today time.Time) (current, longest int) {
	todayStr := today.Format("2006-01-02")

	// Start from today if logged, otherwise from yesterday.
	// This way a user who hasn't checked in yet today doesn't lose their streak.
	cursor := today
	if !loggedDates[todayStr] {
		cursor = today.AddDate(0, 0, -1)
	}

	var run int
	currentSet := false // whether we've recorded the current streak yet
	for {
		dateStr := cursor.Format("2006-01-02")
		if !loggedDates[dateStr] {
			// Gap found — record current streak on first miss, track longest.
			if !currentSet {
				currentSet = true
				current = run
			}
			if run > longest {
				longest = run
			}
			run = 0
			cursor = cursor.AddDate(0, 0, -1)
			if today.Sub(cursor) > 365*10*24*time.Hour {
				break
			}
			continue
		}
		run++
		cursor = cursor.AddDate(0, 0, -1)
		if today.Sub(cursor) > 365*10*24*time.Hour {
			break
		}
	}
	if !currentSet {
		current = run
	}
	if run > longest {
		longest = run
	}
	return current, longest
}

// computeWeeklyStreak counts consecutive Mon–Sun weeks backwards from the
// current week where the count of logged days meets weeklyTarget.
func computeWeeklyStreak(logs []habitLog, weeklyTarget int, today time.Time) (current, longest int) {
	// Build a map of week-start (Monday) → count of logs in that week.
	weekCounts := make(map[string]int)
	for _, l := range logs {
		mon := mondayOf(l.Date.Time)
		key := mon.Format("2006-01-02")
		weekCounts[key]++
	}

	// Start from current week and walk backwards.
	cursor := mondayOf(today)
	var run int
	currentSet := false // whether we've recorded the current streak yet
	for i := 0; i < 52*10; i++ { // up to 10 years back
		key := cursor.Format("2006-01-02")
		count := weekCounts[key]

		if count >= weeklyTarget {
			run++
		} else {
			// Gap found: record current streak on first miss, track longest.
			if !currentSet {
				currentSet = true
				current = run
			}
			if run > longest {
				longest = run
			}
			run = 0
		}
		cursor = cursor.AddDate(0, 0, -7)
	}
	if !currentSet {
		current = run
	}
	if run > longest {
		longest = run
	}
	return current, longest
}

// mondayOf returns the Monday of the week containing t, at midnight UTC.
func mondayOf(t time.Time) time.Time {
	t = t.UTC().Truncate(24 * time.Hour)
	dow := int(t.Weekday())
	if dow == 0 {
		dow = 7 // treat Sunday as 7 so Monday = 1
	}
	return t.AddDate(0, 0, -(dow - 1))
}

/* ─── Stat helpers ───────────────────────────────────────────────────── */

// computeConsistency30d returns the percentage of the last 30 days on which the
// habit was logged at any level (0–100). Days in the future are excluded.
func computeConsistency30d(logs []habitLog, today time.Time) int {
	cutoff := today.AddDate(0, 0, -29)
	var logged int
	for _, l := range logs {
		d := l.Date.Time
		if !d.Before(cutoff) && !d.After(today) {
			logged++
		}
	}
	return logged * 100 / 30
}

// computeAvgLevel30d returns the average level across logs in the last 30 days.
// Returns 0 if there are no logs.
func computeAvgLevel30d(logs []habitLog, today time.Time) float64 {
	cutoff := today.AddDate(0, 0, -29)
	var sum, count int
	for _, l := range logs {
		d := l.Date.Time
		if !d.Before(cutoff) && !d.After(today) {
			sum += l.Level
			count++
		}
	}
	if count == 0 {
		return 0
	}
	return float64(sum) / float64(count)
}

/* ─── List habits ────────────────────────────────────────────────────── */

// listHabits returns all non-archived habits for the authenticated user,
// each annotated with the log entry for the requested date and streak/stats.
// Query param: date=YYYY-MM-DD (defaults to today).
func (h *Handler) listHabits(c *gin.Context) {
	userID := c.GetInt("user_id")

	dateStr := c.DefaultQuery("date", time.Now().UTC().Format("2006-01-02"))

	// Fetch all non-archived habits.
	habits, err := queryMany[habit](h.db, c,
		`SELECT * FROM habits
		 WHERE user_id = @userID AND archived_at IS NULL
		 ORDER BY sort_order, id`,
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load habits"})
		return
	}

	if len(habits) == 0 {
		c.JSON(http.StatusOK, []habitWithLog{})
		return
	}

	// Collect habit IDs for batch log fetch.
	ids := make([]int, len(habits))
	for i, hb := range habits {
		ids[i] = hb.ID
	}

	// Fetch all logs for these habits: today's log + last 30 days for stats.
	cutoff := time.Now().UTC().AddDate(0, 0, -30).Format("2006-01-02")
	allLogs, err := queryMany[habitLog](h.db, c,
		`SELECT * FROM habit_logs
		 WHERE user_id = @userID AND habit_id = ANY(@ids) AND date >= @cutoff
		 ORDER BY date`,
		pgx.NamedArgs{"userID": userID, "ids": ids, "cutoff": cutoff})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load habit logs"})
		return
	}

	// Group logs by habit ID.
	logsByHabit := make(map[int][]habitLog)
	for _, l := range allLogs {
		logsByHabit[l.HabitID] = append(logsByHabit[l.HabitID], l)
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)

	// Compute Mon–Sun window for the requested date to populate week stats.
	parsedDate, _ := time.Parse("2006-01-02", dateStr)
	weekStart := mondayOf(parsedDate)
	weekEnd := weekStart.AddDate(0, 0, 7)

	result := make([]habitWithLog, len(habits))
	for i, hb := range habits {
		logs := logsByHabit[hb.ID]

		// Find today's (or requested date's) specific log.
		var todayLog *habitLog
		for j := range logs {
			if logs[j].Date.Time.Format("2006-01-02") == dateStr {
				copy := logs[j]
				todayLog = &copy
				break
			}
		}

		wt := 1
		if hb.WeeklyTarget != nil {
			wt = *hb.WeeklyTarget
		}
		cur, long := computeHabitStreak(logs, hb.Frequency, wt, today)

		// Compute week stats: count and level sum for logs in [weekStart, weekEnd).
		var weekCount, weekLevelSum int
		for _, l := range logs {
			d := l.Date.Time
			if !d.Before(weekStart) && d.Before(weekEnd) {
				weekCount++
				weekLevelSum += l.Level
			}
		}
		// For weekly habits, cap weekLevelSum at weekly_target × maxLevel to prevent over-counting.
		if hb.Frequency == "weekly" {
			maxLevel := 1
			if hb.Level3Label != nil {
				maxLevel = 3
			} else if hb.Level2Label != nil {
				maxLevel = 2
			}
			if cap := wt * maxLevel; weekLevelSum > cap {
				weekLevelSum = cap
			}
		}

		result[i] = habitWithLog{
			habit:          hb,
			Log:            todayLog,
			CurrentStreak:  cur,
			LongestStreak:  long,
			Consistency30d: computeConsistency30d(logs, today),
			AvgLevel30d:    computeAvgLevel30d(logs, today),
			WeekCount:      weekCount,
			WeekLevelSum:   weekLevelSum,
		}
	}

	c.JSON(http.StatusOK, result)
}

/* ─── Create habit ───────────────────────────────────────────────────── */

// createHabit creates a new habit for the authenticated user.
func (h *Handler) createHabit(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req createHabitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Default frequency to 'daily'.
	if req.Frequency == "" {
		req.Frequency = "daily"
	}
	if req.Frequency != "daily" && req.Frequency != "weekly" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "frequency must be 'daily' or 'weekly'"})
		return
	}
	if req.Frequency == "weekly" {
		if req.WeeklyTarget == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "weekly_target is required for weekly habits"})
			return
		}
		if *req.WeeklyTarget < 1 || *req.WeeklyTarget > 7 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "weekly_target must be between 1 and 7"})
			return
		}
	}

	hb, err := queryOne[habit](h.db, c,
		`INSERT INTO habits
		   (user_id, name, emoji, color, frequency, weekly_target,
		    level1_label, level2_label, level3_label, sort_order)
		 VALUES
		   (@userID, @name, @emoji, @color, @frequency, @weeklyTarget,
		    @l1, @l2, @l3, @sortOrder)
		 RETURNING *`,
		pgx.NamedArgs{
			"userID":       userID,
			"name":         req.Name,
			"emoji":        req.Emoji,
			"color":        req.Color,
			"frequency":    req.Frequency,
			"weeklyTarget": req.WeeklyTarget,
			"l1":           req.Level1Label,
			"l2":           req.Level2Label,
			"l3":           req.Level3Label,
			"sortOrder":    req.SortOrder,
		})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create habit"})
		return
	}

	c.JSON(http.StatusCreated, hb)
}

/* ─── Update habit ───────────────────────────────────────────────────── */

// updateHabit updates the provided fields of a habit.
// Only fields that are non-nil in the request body are written.
func (h *Handler) updateHabit(c *gin.Context) {
	userID := c.GetInt("user_id")
	habitID := c.Param("id")

	var req updateHabitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build dynamic SET clause.
	setClauses := []string{"updated_at = NOW()"}
	args := pgx.NamedArgs{"userID": userID, "habitID": habitID}

	if req.Name != nil {
		setClauses = append(setClauses, "name = @name")
		args["name"] = *req.Name
	}
	if req.Emoji != nil {
		setClauses = append(setClauses, "emoji = @emoji")
		args["emoji"] = *req.Emoji
	}
	if req.Color != nil {
		setClauses = append(setClauses, "color = @color")
		args["color"] = *req.Color
	}
	if req.Frequency != nil {
		setClauses = append(setClauses, "frequency = @frequency")
		args["frequency"] = *req.Frequency
	}
	if req.WeeklyTarget != nil {
		setClauses = append(setClauses, "weekly_target = @weeklyTarget")
		args["weeklyTarget"] = *req.WeeklyTarget
	}
	if req.Level1Label != nil {
		setClauses = append(setClauses, "level1_label = @l1")
		args["l1"] = *req.Level1Label
	}
	if req.Level2Label != nil {
		setClauses = append(setClauses, "level2_label = @l2")
		args["l2"] = *req.Level2Label
	}
	if req.Level3Label != nil {
		setClauses = append(setClauses, "level3_label = @l3")
		args["l3"] = *req.Level3Label
	}
	if req.SortOrder != nil {
		setClauses = append(setClauses, "sort_order = @sortOrder")
		args["sortOrder"] = *req.SortOrder
	}

	setSQL := ""
	for i, s := range setClauses {
		if i > 0 {
			setSQL += ", "
		}
		setSQL += s
	}

	hb, err := queryOne[habit](h.db, c,
		fmt.Sprintf(`UPDATE habits SET %s
		             WHERE id = @habitID AND user_id = @userID
		             RETURNING *`, setSQL),
		args)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update habit"})
		return
	}

	c.JSON(http.StatusOK, hb)
}

/* ─── Archive habit ──────────────────────────────────────────────────── */

// archiveHabit soft-deletes a habit by setting archived_at. The habit is hidden
// from the Today list but its logs are preserved for the Progress/history views.
func (h *Handler) archiveHabit(c *gin.Context) {
	userID := c.GetInt("user_id")
	habitID := c.Param("id")

	hb, err := queryOne[habit](h.db, c,
		`UPDATE habits SET archived_at = NOW(), updated_at = NOW()
		 WHERE id = @habitID AND user_id = @userID
		 RETURNING *`,
		pgx.NamedArgs{"habitID": habitID, "userID": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to archive habit"})
		return
	}

	c.JSON(http.StatusOK, hb)
}

/* ─── Delete habit ───────────────────────────────────────────────────── */

// deleteHabit permanently deletes a habit and its logs (CASCADE).
func (h *Handler) deleteHabit(c *gin.Context) {
	userID := c.GetInt("user_id")
	habitID := c.Param("id")

	_, err := h.db.Exec(c,
		`DELETE FROM habits WHERE id = $1 AND user_id = $2`,
		habitID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete habit"})
		return
	}

	c.Status(http.StatusNoContent)
}

/* ─── Upsert habit log ───────────────────────────────────────────────── */

// upsertHabitLog upserts or deletes a habit log entry.
// Body: { habit_id, date, level }. Level 0 = delete; 1–3 = upsert.
// The habit must belong to the authenticated user.
func (h *Handler) upsertHabitLog(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req upsertHabitLogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Level < 0 || req.Level > 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "level must be 0–3"})
		return
	}

	// Verify the habit belongs to this user before writing.
	var ownerID int
	err := h.db.QueryRow(c,
		`SELECT user_id FROM habits WHERE id = $1`, req.HabitID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "habit not found"})
		return
	}

	if req.Level == 0 {
		// Delete the log entry (reset).
		_, err := h.db.Exec(c,
			`DELETE FROM habit_logs WHERE user_id = $1 AND habit_id = $2 AND date = $3`,
			userID, req.HabitID, req.Date)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset habit log"})
			return
		}
		c.JSON(http.StatusOK, nil)
		return
	}

	// Upsert: insert or update level for this (user, habit, date).
	log, err := queryOne[habitLog](h.db, c,
		`INSERT INTO habit_logs (user_id, habit_id, date, level)
		 VALUES (@userID, @habitID, @date, @level)
		 ON CONFLICT (user_id, habit_id, date)
		 DO UPDATE SET level = @level, updated_at = NOW()
		 RETURNING *`,
		pgx.NamedArgs{
			"userID":  userID,
			"habitID": req.HabitID,
			"date":    req.Date,
			"level":   req.Level,
		})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upsert habit log"})
		return
	}

	c.JSON(http.StatusOK, log)
}

/* ─── Weekly progress ────────────────────────────────────────────────── */

// listHabitsWeek returns all non-archived habits with their logs for the
// 7-day window starting at week_start (Monday). Used by the Progress tab.
// Query param: week_start=YYYY-MM-DD.
func (h *Handler) listHabitsWeek(c *gin.Context) {
	userID := c.GetInt("user_id")

	weekStart := c.Query("week_start")
	if weekStart == "" {
		// Default to Monday of the current week.
		weekStart = mondayOf(time.Now().UTC()).Format("2006-01-02")
	}

	weekStartTime, err := time.Parse("2006-01-02", weekStart)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid week_start; expected YYYY-MM-DD"})
		return
	}
	weekEnd := weekStartTime.AddDate(0, 0, 6).Format("2006-01-02")

	habits, err := queryMany[habit](h.db, c,
		`SELECT * FROM habits
		 WHERE user_id = @userID AND archived_at IS NULL
		 ORDER BY sort_order, id`,
		pgx.NamedArgs{"userID": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load habits"})
		return
	}

	if len(habits) == 0 {
		c.JSON(http.StatusOK, []habitWeekEntry{})
		return
	}

	ids := make([]int, len(habits))
	for i, hb := range habits {
		ids[i] = hb.ID
	}

	// Fetch 30 days of logs for stats (streak/consistency/avgLevel) plus the week window.
	// The cutoff covers both the week window and the 30-day stat window.
	statCutoff := time.Now().UTC().AddDate(0, 0, -30).Format("2006-01-02")
	allLogs, err := queryMany[habitLog](h.db, c,
		`SELECT * FROM habit_logs
		 WHERE user_id = @userID AND habit_id = ANY(@ids)
		   AND date >= @cutoff
		 ORDER BY date`,
		pgx.NamedArgs{"userID": userID, "ids": ids, "cutoff": statCutoff})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load habit logs"})
		return
	}

	// Group all logs by habit ID; also isolate the week-window logs.
	allLogsByHabit := make(map[int][]habitLog)
	weekLogsByHabit := make(map[int][]habitLog)
	for _, l := range allLogs {
		allLogsByHabit[l.HabitID] = append(allLogsByHabit[l.HabitID], l)
		dateStr := l.Date.Time.Format("2006-01-02")
		if dateStr >= weekStart && dateStr <= weekEnd {
			weekLogsByHabit[l.HabitID] = append(weekLogsByHabit[l.HabitID], l)
		}
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	result := make([]habitWeekEntry, len(habits))
	for i, hb := range habits {
		logs := allLogsByHabit[hb.ID]
		weekLogs := weekLogsByHabit[hb.ID]
		if weekLogs == nil {
			weekLogs = []habitLog{}
		}

		wt := 1
		if hb.WeeklyTarget != nil {
			wt = *hb.WeeklyTarget
		}
		cur, long := computeHabitStreak(logs, hb.Frequency, wt, today)

		result[i] = habitWeekEntry{
			Habit: habitWithLog{
				habit:          hb,
				Log:            nil, // no single-date log in week view
				CurrentStreak:  cur,
				LongestStreak:  long,
				Consistency30d: computeConsistency30d(logs, today),
				AvgLevel30d:    computeAvgLevel30d(logs, today),
			},
			Logs: weekLogs,
		}
	}

	c.JSON(http.StatusOK, result)
}

/* ─── Habit log range (for detail/heatmap view) ──────────────────────── */

// listHabitLogs returns all logs for a single habit within a date range.
// Used by the Habit Detail page for the heatmap and recent log list.
// Query params: from=YYYY-MM-DD&to=YYYY-MM-DD.
func (h *Handler) listHabitLogs(c *gin.Context) {
	userID := c.GetInt("user_id")
	habitID := c.Param("id")

	from := c.Query("from")
	to := c.Query("to")
	if from == "" || to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from and to query params are required"})
		return
	}

	// Verify ownership.
	var ownerID int
	err := h.db.QueryRow(c,
		`SELECT user_id FROM habits WHERE id = $1`, habitID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "habit not found"})
		return
	}

	logs, err := queryMany[habitLog](h.db, c,
		`SELECT * FROM habit_logs
		 WHERE user_id = @userID AND habit_id = @habitID
		   AND date BETWEEN @from AND @to
		 ORDER BY date`,
		pgx.NamedArgs{"userID": userID, "habitID": habitID, "from": from, "to": to})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load habit logs"})
		return
	}
	if logs == nil {
		logs = []habitLog{}
	}

	c.JSON(http.StatusOK, logs)
}
