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

// mentalStatePoint is one data point in the mental-state trend chart (score 1–5 per day).
type mentalStatePoint struct {
	Date  string  `json:"date"`
	Score float64 `json:"score"`
}

// tagCount is one bar in the top-emotions or entry-type-counts chart.
type tagCount struct {
	Tag   string `json:"tag"`
	Count int    `json:"count"`
}

// journalSummaryResponse is the response for GET /api/journal/summary.
type journalSummaryResponse struct {
	MentalStatePoints []mentalStatePoint `json:"mental_state_points"`
	TopEmotions       []tagCount         `json:"top_emotions"`
	EntryTypeCounts   []tagCount         `json:"entry_type_counts"`
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

/* ─── Summary ─────────────────────────────────────────────────────────── */

// getJournalSummary returns mental-state trend data and tag frequency counts
// for a given date range. Query param: range=1m|6m|ytd|all (required).
func (h *Handler) getJournalSummary(c *gin.Context) {
	userID := c.GetInt("user_id")

	// Resolve the start date from the range param.
	rangeParam := c.Query("range")
	now := time.Now().UTC()
	var startDate string
	switch rangeParam {
	case "1m":
		startDate = now.AddDate(0, -1, 0).Format("2006-01-02")
	case "6m":
		startDate = now.AddDate(0, -6, 0).Format("2006-01-02")
	case "ytd":
		startDate = fmt.Sprintf("%d-01-01", now.Year())
	case "all":
		startDate = "2000-01-01"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid range"})
		return
	}

	rows, err := queryMany[journalSummaryRow](h.db, c,
		`SELECT entry_date, tags::text[] AS tags
		 FROM journal_entries
		 WHERE user_id = @userID AND entry_date >= @startDate
		 ORDER BY entry_date`,
		pgx.NamedArgs{"userID": userID, "startDate": startDate})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load journal summary"})
		return
	}

	// Compute per-date average mental-state scores and tag frequency counts.
	type dateAccum struct {
		scoreSum int
		scoreN   int
	}
	dateScores := make(map[string]*dateAccum)
	emotionCounts := make(map[string]int)
	entryTypeCounts := make(map[string]int)

	for _, row := range rows {
		dateKey := row.EntryDate.Time.Format("2006-01-02")
		if dateScores[dateKey] == nil {
			dateScores[dateKey] = &dateAccum{}
		}

		for _, tag := range row.Tags {
			if s := mentalStateScore(tag); s > 0 {
				dateScores[dateKey].scoreSum += s
				dateScores[dateKey].scoreN++
			}
			// Condition tags count toward the same frequency bucket as emotions
			if emotionTags[tag] || conditionTags[tag] {
				emotionCounts[tag]++
			} else if entryTypeTags[tag] {
				entryTypeCounts[tag]++
			}
		}
	}

	// Build mental-state points sorted by date; skip dates with no emotion tags.
	var dateKeys []string
	for k := range dateScores {
		if dateScores[k].scoreN > 0 {
			dateKeys = append(dateKeys, k)
		}
	}
	sort.Strings(dateKeys)

	mentalStatePoints := make([]mentalStatePoint, 0, len(dateKeys))
	for _, d := range dateKeys {
		acc := dateScores[d]
		score := float64(acc.scoreSum) / float64(acc.scoreN)
		// Round to one decimal place.
		score = float64(int(score*10+0.5)) / 10
		mentalStatePoints = append(mentalStatePoints, mentalStatePoint{Date: d, Score: score})
	}

	// Build top-emotions list sorted by count desc.
	topEmotions := make([]tagCount, 0, len(emotionCounts))
	for tag, count := range emotionCounts {
		topEmotions = append(topEmotions, tagCount{Tag: tag, Count: count})
	}
	sort.Slice(topEmotions, func(i, j int) bool {
		return topEmotions[i].Count > topEmotions[j].Count
	})

	// Build entry-type counts sorted by count desc.
	entryTypeList := make([]tagCount, 0, len(entryTypeCounts))
	for tag, count := range entryTypeCounts {
		entryTypeList = append(entryTypeList, tagCount{Tag: tag, Count: count})
	}
	sort.Slice(entryTypeList, func(i, j int) bool {
		return entryTypeList[i].Count > entryTypeList[j].Count
	})

	c.JSON(http.StatusOK, journalSummaryResponse{
		MentalStatePoints: mentalStatePoints,
		TopEmotions:       topEmotions,
		EntryTypeCounts:   entryTypeList,
	})
}
