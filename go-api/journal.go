package main

import (
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

/* ─── Structs ─────────────────────────────────────────────────────────── */

// journalEntry is the API response shape for a single journal entry.
// Tags contains all selected tags (emotions and entry types combined).
// HabitID/HabitName are non-nil when the entry was linked from a habit log.
// Source/HabitLevel record which feature created the entry and the habit's state at that time.
type journalEntry struct {
	ID         int       `json:"id"          db:"id"`
	EntryDate  DateOnly  `json:"entry_date"  db:"entry_date"`
	EntryTime  string    `json:"entry_time"  db:"entry_time"` // HH:MM, formatted in SQL
	Body       string    `json:"body"        db:"body"`
	Tags       []string  `json:"tags"        db:"tags"`
	HabitID    *int      `json:"habit_id"    db:"habit_id"`
	HabitName  *string   `json:"habit_name"  db:"habit_name"`
	Source     *string   `json:"source"      db:"source"`
	HabitLevel *int16    `json:"habit_level" db:"habit_level"`
	CreatedAt  time.Time `json:"created_at"  db:"created_at"`
}

// createJournalEntryRequest is the request body for POST /api/journal.
// EntryTime is optional — when provided by the client it overrides NOW() so the
// stored time reflects the user's local clock rather than the server's UTC time.
type createJournalEntryRequest struct {
	EntryDate  string   `json:"entry_date"  binding:"required"` // YYYY-MM-DD
	EntryTime  *string  `json:"entry_time"`                     // HH:MM local; nil → COALESCE falls back to NOW()
	Body       string   `json:"body"        binding:"required"`
	Tags       []string `json:"tags"`
	HabitID    *int     `json:"habit_id"`
	Source     *string  `json:"source"`
	HabitLevel *int16   `json:"habit_level"`
}

// updateJournalEntryRequest is the request body for PUT /api/journal/:id.
// Only non-nil fields are written to the DB.
type updateJournalEntryRequest struct {
	Body *string   `json:"body"`
	Tags *[]string `json:"tags"`
}

// journalSummaryRow is the minimal row shape used for aggregating summary data.
// Only date and tags are needed; body and other fields are not fetched.
type journalSummaryRow struct {
	EntryDate DateOnly `db:"entry_date"`
	Tags      []string `db:"tags"`
}

// tagCount is one bar in the top-emotions or entry-type-counts chart.
type tagCount struct {
	Tag   string `json:"tag"`
	Count int    `json:"count"`
}

// mentalStateBar is one bar in the mental-state-over-time chart.
// Bars with no entries have EntryCount=0 and Score=nil.
// Emotions lists the distinct emotion/condition tags present in entries for this slot,
// sorted alphabetically — used to populate the tooltip emoji row.
type mentalStateBar struct {
	Label      string   `json:"label"`       // "Mon", "1", "W12", etc.
	Date       string   `json:"date"`         // YYYY-MM-DD (calendar day or ISO week-start Monday)
	Score      *float64 `json:"score"`        // nil when no scoring tags
	EntryCount int      `json:"entry_count"`
	Emotions   []string `json:"emotions"`     // distinct emotion/condition tags for tooltip
}

// journalSummaryResponse is the response for GET /api/journal/summary.
type journalSummaryResponse struct {
	MentalStateBars []mentalStateBar `json:"mental_state_bars"`
	TopEmotions     []tagCount       `json:"top_emotions"`
	EntryTypeCounts []tagCount       `json:"entry_type_counts"`
	TotalEntries    int              `json:"total_entries"`
	DaysLogged      int              `json:"days_logged"`
}

// journalTagDay is one item in the GET /api/journal/tag-days response.
type journalTagDay struct {
	Date       string `json:"date"`        // YYYY-MM-DD — used by the frontend for date navigation
	EntryCount int    `json:"entry_count"`
	Preview    string `json:"preview"`     // first 80 chars of the earliest entry body that day
}

// journalCalendarDay is one entry in the GET /api/journal/calendar response.
// AvgScore is nil when entries exist for the day but none have emotion/condition tags.
type journalCalendarDay struct {
	Date       string   `json:"date"`
	EntryCount int      `json:"entry_count"`
	AvgScore   *float64 `json:"avg_score"`
}

/* ─── Tag classification ──────────────────────────────────────────────── */

// emotionTags is the set of tags that represent emotional states, used for
// mental-state scoring and the top-emotions chart.
var emotionTags = map[string]bool{
	"excited": true, "happy": true, "motivated": true, "energized": true,
	"calm": true, "content": true, "grateful": true, "well_rested": true,
	"hopeful": true, "proud": true, "neutral": true, "confused": true,
	"bored": true, "unmotivated": true, "tired": true, "stressed": true,
	"annoyed": true, "lonely": true, "anxious": true, "overwhelmed": true,
	"low": true, "sad": true, "angry": true, "frustrated": true, "depressed": true,
	"sick": true,
}

// conditionTags is the set of tags that represent physical conditions.
// Like emotions, they factor into the mental-state score.
var conditionTags = map[string]bool{
	"stomach_ache": true, "nausea": true, "brain_fog": true, "fatigue": true,
}

// entryTypeTags is the set of tags that describe what kind of entry was written.
var entryTypeTags = map[string]bool{
	"thoughts": true, "idea": true, "venting": true, "open_loop": true,
	"reminder": true, "life_update": true, "feelings": true,
}

// mentalStateScore returns the mental-state score (1–5) for a single emotion or condition tag.
// Condition tags (physical symptoms) also return a score so they pull the daily average down.
// Non-scoring tags (entry types, unknown values) return 0 and are skipped in scoring.
func mentalStateScore(tag string) int {
	switch tag {
	case "excited":
		return 5
	case "well_rested":
		return 5
	case "happy", "motivated", "energized", "calm", "content", "grateful":
		return 4
	case "hopeful", "proud":
		return 4
	case "neutral":
		return 3
	case "confused":
		return 3
	case "bored", "unmotivated", "anxious", "overwhelmed", "low":
		return 2
	case "tired", "stressed", "annoyed", "lonely":
		return 2
	case "stomach_ache", "brain_fog", "fatigue":
		return 2
	case "sad", "angry", "frustrated", "depressed":
		return 1
	case "sick":
		return 1
	case "nausea":
		return 1
	}
	return 0
}

/* ─── Get entries (daily list) ────────────────────────────────────────── */

// getJournalEntries returns all journal entries for the authenticated user on a given date.
// Query param: date=YYYY-MM-DD (required).
func (h *Handler) getJournalEntries(c *gin.Context) {
	userID := c.GetInt("user_id")

	dateStr := c.Query("date")
	if _, err := time.Parse("2006-01-02", dateStr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date"})
		return
	}

	entries, err := queryMany[journalEntry](h.db, c,
		`SELECT
		   je.id,
		   je.entry_date,
		   to_char(je.entry_time::time, 'HH24:MI') AS entry_time,
		   je.body,
		   je.tags::text[] AS tags,
		   je.habit_id,
		   h.name AS habit_name,
		   je.source::text,
		   je.habit_level,
		   je.created_at
		 FROM journal_entries je
		 LEFT JOIN habits h ON h.id = je.habit_id
		 WHERE je.user_id = @userID AND je.entry_date = @date
		 ORDER BY je.entry_time, je.id`,
		pgx.NamedArgs{"userID": userID, "date": dateStr})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load journal entries"})
		return
	}

	// Ensure empty result is an array, not null.
	if entries == nil {
		entries = []journalEntry{}
	}
	// Ensure tags arrays are never null.
	for i := range entries {
		if entries[i].Tags == nil {
			entries[i].Tags = []string{}
		}
	}

	c.JSON(http.StatusOK, entries)
}

/* ─── Create entry ────────────────────────────────────────────────────── */

// createJournalEntry creates a new journal entry for the authenticated user.
// entry_time uses the client-supplied local HH:MM when present, falling back to NOW().
func (h *Handler) createJournalEntry(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req createJournalEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if _, err := time.Parse("2006-01-02", req.EntryDate); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid entry_date"})
		return
	}

	tags := req.Tags
	if tags == nil {
		tags = []string{}
	}

	entry, err := queryOne[journalEntry](h.db, c,
		`WITH ins AS (
		   INSERT INTO journal_entries (user_id, entry_date, entry_time, body, tags, habit_id, source, habit_level)
		   VALUES (@userID, @entryDate, COALESCE(@entryTime::time, NOW()::time), @body, @tags::journal_tag[], @habitID, @source::journal_entry_source, @habitLevel)
		   RETURNING *
		 )
		 SELECT
		   ins.id,
		   ins.entry_date,
		   to_char(ins.entry_time::time, 'HH24:MI') AS entry_time,
		   ins.body,
		   ins.tags::text[] AS tags,
		   ins.habit_id,
		   h.name AS habit_name,
		   ins.source::text,
		   ins.habit_level,
		   ins.created_at
		 FROM ins
		 LEFT JOIN habits h ON h.id = ins.habit_id`,
		pgx.NamedArgs{
			"userID":     userID,
			"entryDate":  req.EntryDate,
			"entryTime":  req.EntryTime,
			"body":       req.Body,
			"tags":       tags,
			"habitID":    req.HabitID,
			"source":     req.Source,
			"habitLevel": req.HabitLevel,
		})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create journal entry"})
		return
	}

	if entry.Tags == nil {
		entry.Tags = []string{}
	}

	c.JSON(http.StatusCreated, entry)
}

/* ─── Update entry ────────────────────────────────────────────────────── */

// updateJournalEntry updates the provided fields of a journal entry.
// Only body and tags can be updated. Ownership is verified before writing.
func (h *Handler) updateJournalEntry(c *gin.Context) {
	userID := c.GetInt("user_id")
	entryID := c.Param("id")

	var req updateJournalEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build dynamic SET clause — only update fields present in the request body.
	setClauses := []string{"updated_at = NOW()"}
	args := pgx.NamedArgs{"userID": userID, "entryID": entryID}

	if req.Body != nil {
		setClauses = append(setClauses, "body = @body")
		args["body"] = *req.Body
	}
	if req.Tags != nil {
		setClauses = append(setClauses, "tags = @tags::journal_tag[]")
		args["tags"] = *req.Tags
	}

	setSQL := ""
	for i, s := range setClauses {
		if i > 0 {
			setSQL += ", "
		}
		setSQL += s
	}

	entry, err := queryOne[journalEntry](h.db, c,
		fmt.Sprintf(`WITH upd AS (
		   UPDATE journal_entries SET %s
		   WHERE id = @entryID AND user_id = @userID
		   RETURNING *
		 )
		 SELECT
		   upd.id,
		   upd.entry_date,
		   to_char(upd.entry_time::time, 'HH24:MI') AS entry_time,
		   upd.body,
		   upd.tags::text[] AS tags,
		   upd.habit_id,
		   h.name AS habit_name,
		   upd.source::text,
		   upd.habit_level,
		   upd.created_at
		 FROM upd
		 LEFT JOIN habits h ON h.id = upd.habit_id`, setSQL),
		args)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update journal entry"})
		return
	}

	if entry.Tags == nil {
		entry.Tags = []string{}
	}

	c.JSON(http.StatusOK, entry)
}

/* ─── Delete entry ────────────────────────────────────────────────────── */

// deleteJournalEntry deletes a journal entry. Ownership is verified before deleting.
func (h *Handler) deleteJournalEntry(c *gin.Context) {
	userID := c.GetInt("user_id")
	entryID := c.Param("id")

	_, err := h.db.Exec(c,
		`DELETE FROM journal_entries WHERE id = $1 AND user_id = $2`,
		entryID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete journal entry"})
		return
	}

	c.Status(http.StatusNoContent)
}

/* ─── Date helpers ───────────────────────────────────────────────────── */

// resolveDateRange maps a range param + optional ref_date string to a start/end date pair.
// ref_date defaults to now when empty. Used by both getJournalSummary and getJournalTagDays.
func resolveDateRange(rangeParam, refDateStr string, now time.Time) (time.Time, time.Time, error) {
	refDate := now
	if refDateStr != "" {
		parsed, err := time.Parse("2006-01-02", refDateStr)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("invalid ref_date, expected YYYY-MM-DD")
		}
		refDate = parsed
	}

	switch rangeParam {
	case "week":
		start := mondayOf(refDate)
		return start, start.AddDate(0, 0, 6), nil
	case "month":
		start := time.Date(refDate.Year(), refDate.Month(), 1, 0, 0, 0, 0, time.UTC)
		return start, start.AddDate(0, 1, -1), nil
	case "6m":
		// Trailing 26 ISO weeks ending on the Sunday of the current week.
		start := mondayOf(now).AddDate(0, 0, -25*7)
		return start, mondayOf(now).AddDate(0, 0, 6), nil
	case "1yr":
		// Trailing 52 ISO weeks.
		start := mondayOf(now).AddDate(0, 0, -51*7)
		return start, mondayOf(now).AddDate(0, 0, 6), nil
	default:
		return time.Time{}, time.Time{}, fmt.Errorf("invalid range, expected week|month|6m|1yr")
	}
}

// buildMentalStateBars constructs the full ordered bar slice for the summary chart.
// A bar is generated for every slot in the range — calendar day for week/month,
// ISO week for 6m/1yr — even when there are no entries (EntryCount=0, Score=nil).
func buildMentalStateBars(rangeParam string, startDate time.Time, rows []journalSummaryRow) []mentalStateBar {
	type barAccum struct {
		count    int
		scoreSum int
		scoreN   int
		emotions map[string]bool // distinct emotion/condition tags seen
	}

	// Group rows by their bar key: YYYY-MM-DD for day ranges, Monday for week ranges.
	accums := make(map[string]*barAccum)
	for _, row := range rows {
		var barKey string
		if rangeParam == "6m" || rangeParam == "1yr" {
			barKey = mondayOf(row.EntryDate.Time).Format("2006-01-02")
		} else {
			barKey = row.EntryDate.Time.Format("2006-01-02")
		}
		if accums[barKey] == nil {
			accums[barKey] = &barAccum{emotions: make(map[string]bool)}
		}
		acc := accums[barKey]
		acc.count++
		for _, tag := range row.Tags {
			if s := mentalStateScore(tag); s > 0 {
				acc.scoreSum += s
				acc.scoreN++
			}
			if emotionTags[tag] || conditionTags[tag] {
				acc.emotions[tag] = true
			}
		}
	}

	// fillBar populates score, entry count, and emotion list from the accumulator.
	fillBar := func(bar *mentalStateBar) {
		acc := accums[bar.Date]
		if acc == nil {
			return
		}
		bar.EntryCount = acc.count
		if acc.scoreN > 0 {
			score := float64(acc.scoreSum) / float64(acc.scoreN)
			score = float64(int(score*10+0.5)) / 10 // one-decimal rounding
			bar.Score = &score
		}
		for tag := range acc.emotions {
			bar.Emotions = append(bar.Emotions, tag)
		}
		sort.Strings(bar.Emotions) // deterministic order
	}

	var bars []mentalStateBar
	dayNames := [7]string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}

	switch rangeParam {
	case "week":
		for i := 0; i < 7; i++ {
			day := startDate.AddDate(0, 0, i)
			bar := mentalStateBar{Label: dayNames[i], Date: day.Format("2006-01-02"), Emotions: []string{}}
			fillBar(&bar)
			bars = append(bars, bar)
		}

	case "month":
		endDate := startDate.AddDate(0, 1, -1)
		for d := startDate; !d.After(endDate); d = d.AddDate(0, 0, 1) {
			bar := mentalStateBar{
				Label:    fmt.Sprintf("%d", d.Day()),
				Date:     d.Format("2006-01-02"),
				Emotions: []string{},
			}
			fillBar(&bar)
			bars = append(bars, bar)
		}

	case "6m", "1yr":
		nWeeks := 26
		if rangeParam == "1yr" {
			nWeeks = 52
		}
		for i := 0; i < nWeeks; i++ {
			weekStart := startDate.AddDate(0, 0, i*7)
			bar := mentalStateBar{
				Label:    fmt.Sprintf("W%d", i+1),
				Date:     weekStart.Format("2006-01-02"),
				Emotions: []string{},
			}
			fillBar(&bar)
			bars = append(bars, bar)
		}
	}

	return bars
}

// journalTagDayRow is the raw DB row scanned by getJournalTagDays before date formatting.
type journalTagDayRow struct {
	EntryDate  DateOnly `db:"entry_date"`
	EntryCount int      `db:"entry_count"`
	Preview    string   `db:"preview"`
}

/* ─── Calendar ───────────────────────────────────────────────────────── */

// getJournalCalendar returns per-day entry counts and average mental-state scores
// for a calendar month. Only days that have at least one entry are included;
// days with entries but no emotion/condition tags have avg_score=null.
// Query param: month=YYYY-MM (required).
func (h *Handler) getJournalCalendar(c *gin.Context) {
	userID := c.GetInt("user_id")

	monthParam := c.Query("month")
	if _, err := time.Parse("2006-01", monthParam); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month, expected YYYY-MM"})
		return
	}

	// Fetch all entries for the month. Reuse journalSummaryRow — only entry_date
	// and tags are needed for aggregation.
	rows, err := queryMany[journalSummaryRow](h.db, c,
		`SELECT entry_date, tags::text[] AS tags
		 FROM journal_entries
		 WHERE user_id = @userID
		   AND date_trunc('month', entry_date) = date_trunc('month', @monthDate::date)
		 ORDER BY entry_date, id`,
		pgx.NamedArgs{"userID": userID, "monthDate": monthParam + "-01"})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load journal calendar"})
		return
	}

	c.JSON(http.StatusOK, computeCalendarDays(rows))
}

// computeCalendarDays aggregates a slice of journal rows (pre-sorted by entry_date)
// into per-day calendar summaries used by the calendar date picker.
// Kept as a standalone function so it can be unit-tested without a database.
func computeCalendarDays(rows []journalSummaryRow) []journalCalendarDay {
	type dayAccum struct {
		count    int
		scoreSum int
		scoreN   int
	}
	// Use a slice to preserve date order (rows arrive sorted by entry_date).
	var dateOrder []string
	accums := make(map[string]*dayAccum)

	for _, row := range rows {
		dateKey := row.EntryDate.Time.Format("2006-01-02")
		if accums[dateKey] == nil {
			accums[dateKey] = &dayAccum{}
			dateOrder = append(dateOrder, dateKey)
		}
		acc := accums[dateKey]
		acc.count++
		for _, tag := range row.Tags {
			if s := mentalStateScore(tag); s > 0 {
				acc.scoreSum += s
				acc.scoreN++
			}
		}
	}

	result := make([]journalCalendarDay, 0, len(dateOrder))
	for _, dateKey := range dateOrder {
		acc := accums[dateKey]
		var avgScore *float64
		if acc.scoreN > 0 {
			// One-decimal rounding — matches getJournalSummary behaviour.
			score := float64(acc.scoreSum) / float64(acc.scoreN)
			score = float64(int(score*10+0.5)) / 10
			avgScore = &score
		}
		result = append(result, journalCalendarDay{
			Date:       dateKey,
			EntryCount: acc.count,
			AvgScore:   avgScore,
		})
	}
	return result
}

/* ─── Summary ─────────────────────────────────────────────────────────── */

// getJournalSummary returns mental-state bar chart data and tag frequency counts
// for a given date range.
// Query params:
//   - range=week|month|6m|1yr (required)
//   - ref_date=YYYY-MM-DD (optional; defaults to today — anchors week/month ranges)
func (h *Handler) getJournalSummary(c *gin.Context) {
	userID := c.GetInt("user_id")

	rangeParam := c.Query("range")
	refDateStr := c.Query("ref_date")
	now := time.Now().UTC()

	startDate, endDate, err := resolveDateRange(rangeParam, refDateStr, now)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rows, err := queryMany[journalSummaryRow](h.db, c,
		`SELECT entry_date, tags::text[] AS tags
		 FROM journal_entries
		 WHERE user_id = @userID
		   AND entry_date >= @startDate
		   AND entry_date <= @endDate
		 ORDER BY entry_date`,
		pgx.NamedArgs{
			"userID":    userID,
			"startDate": startDate.Format("2006-01-02"),
			"endDate":   endDate.Format("2006-01-02"),
		})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load journal summary"})
		return
	}

	// Build mental-state bar chart — one slot per calendar day (week/month) or ISO week (6m/1yr).
	bars := buildMentalStateBars(rangeParam, startDate, rows)

	// Count emotion/condition and entry-type tag frequencies across all rows.
	emotionCounts := make(map[string]int)
	entryTypeCounts := make(map[string]int)
	seenDates := make(map[string]bool)
	totalEntries := len(rows)

	for _, row := range rows {
		dateKey := row.EntryDate.Time.Format("2006-01-02")
		seenDates[dateKey] = true
		for _, tag := range row.Tags {
			if emotionTags[tag] || conditionTags[tag] {
				emotionCounts[tag]++
			} else if entryTypeTags[tag] {
				entryTypeCounts[tag]++
			}
		}
	}

	// Build top-emotions list sorted by count desc.
	topEmotions := make([]tagCount, 0, len(emotionCounts))
	for tag, count := range emotionCounts {
		topEmotions = append(topEmotions, tagCount{Tag: tag, Count: count})
	}
	sort.Slice(topEmotions, func(i, j int) bool {
		if topEmotions[i].Count != topEmotions[j].Count {
			return topEmotions[i].Count > topEmotions[j].Count
		}
		return topEmotions[i].Tag < topEmotions[j].Tag
	})

	// Build entry-type counts sorted by count desc.
	entryTypeList := make([]tagCount, 0, len(entryTypeCounts))
	for tag, count := range entryTypeCounts {
		entryTypeList = append(entryTypeList, tagCount{Tag: tag, Count: count})
	}
	sort.Slice(entryTypeList, func(i, j int) bool {
		if entryTypeList[i].Count != entryTypeList[j].Count {
			return entryTypeList[i].Count > entryTypeList[j].Count
		}
		return entryTypeList[i].Tag < entryTypeList[j].Tag
	})

	c.JSON(http.StatusOK, journalSummaryResponse{
		MentalStateBars: bars,
		TopEmotions:     topEmotions,
		EntryTypeCounts: entryTypeList,
		TotalEntries:    totalEntries,
		DaysLogged:      len(seenDates),
	})
}

/* ─── Tag days (drill-down) ───────────────────────────────────────────── */

// getJournalTagDays returns days within a range that contain a specific tag,
// ordered newest first. Used to populate the drill-down panel when a user taps
// an emotion or entry-type bar in the Summary tab.
// Query params:
//   - tag=<journal_tag>   (required)
//   - range=week|month|6m|1yr (required)
//   - ref_date=YYYY-MM-DD (optional; defaults to today)
func (h *Handler) getJournalTagDays(c *gin.Context) {
	userID := c.GetInt("user_id")

	tag := c.Query("tag")
	if tag == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tag is required"})
		return
	}

	rangeParam := c.Query("range")
	refDateStr := c.Query("ref_date")
	now := time.Now().UTC()

	startDate, endDate, err := resolveDateRange(rangeParam, refDateStr, now)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// For each day in the range that has the tag, return the entry count and
	// a preview from the earliest entry of that day (across all entries, not just
	// those with the tag — gives the best overall context).
	rows, err := queryMany[journalTagDayRow](h.db, c,
		`SELECT
		   je.entry_date,
		   COUNT(*) AS entry_count,
		   (SELECT LEFT(j2.body, 80)
		    FROM journal_entries j2
		    WHERE j2.user_id = @userID AND j2.entry_date = je.entry_date
		    ORDER BY j2.entry_time, j2.id
		    LIMIT 1) AS preview
		 FROM journal_entries je
		 WHERE je.user_id = @userID
		   AND je.entry_date >= @startDate
		   AND je.entry_date <= @endDate
		   AND @tag = ANY(je.tags::text[])
		 GROUP BY je.entry_date
		 ORDER BY je.entry_date DESC`,
		pgx.NamedArgs{
			"userID":    userID,
			"startDate": startDate.Format("2006-01-02"),
			"endDate":   endDate.Format("2006-01-02"),
			"tag":       tag,
		})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load tag days"})
		return
	}

	// Format dates as human-readable labels (e.g. "Apr 3") and build response.
	result := make([]journalTagDay, len(rows))
	for i, row := range rows {
		result[i] = journalTagDay{
			Date:       row.EntryDate.Time.Format("2006-01-02"),
			EntryCount: row.EntryCount,
			Preview:    row.Preview,
		}
	}

	c.JSON(http.StatusOK, result)
}
