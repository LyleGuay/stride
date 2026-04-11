package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

/* ─── Helpers ─────────────────────────────────────────────────────────── */

// taskSelectSQL is the standard column list for task SELECT queries.
// scheduled_time is formatted as "HH:MM" by TO_CHAR so it scans cleanly into *string —
// the same pattern used for entry_time in journal.go.
// Tags are fetched from task_tags via an ARRAY subquery; COALESCE ensures an
// empty array (not NULL) when a task has no tags.
const taskSelectSQL = `
    t.id, t.user_id, t.name, t.description,
    t.scheduled_date,
    TO_CHAR(t.scheduled_time, 'HH24:MI') AS scheduled_time,
    t.deadline,
    t.priority::text AS priority,
    t.status::text   AS status,
    t.started_at, t.completed_at, t.canceled_at,
    t.recurrence_rule,
    t.created_at, t.updated_at,
    COALESCE(ARRAY(SELECT tag FROM task_tags WHERE task_id = t.id ORDER BY tag), '{}') AS tags`

// insertTaskTags inserts rows into task_tags for the given task ID and tag list.
// ON CONFLICT DO NOTHING silently handles duplicate tags from the client.
func insertTaskTags(h *Handler, c *gin.Context, taskID int, tags []string) error {
	for _, tag := range tags {
		if _, err := h.db.Exec(c,
			`INSERT INTO task_tags (task_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			taskID, tag); err != nil {
			return err
		}
	}
	return nil
}

/* ─── List tasks ──────────────────────────────────────────────────────── */

// listTasks returns a paginated list of tasks for the authenticated user.
// The view param drives which tasks are returned:
//
//	today     — routing date <= today, active tasks. Routing date = COALESCE(scheduled_date, deadline).
//	upcoming  — routing date within the next 7 days (includes overdue + today), active tasks with a date set
//	all       — all active tasks regardless of date
//	backlog   — active tasks with neither scheduled_date nor deadline set
//	completed — completed tasks, newest first
//	canceled  — canceled tasks, newest first
//
// Optional params: today=YYYY-MM-DD (client's local date), search= (ILIKE on name/description/tags),
// limit=N (default 25, max 100), offset=N (default 0).
// Response: { tasks: [...], has_more: bool }
func (h *Handler) listTasks(c *gin.Context) {
	userID := c.GetInt("user_id")
	view := c.DefaultQuery("view", "today")
	today := c.Query("today")
	search := c.Query("search")

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "25"))
	if err != nil || limit <= 0 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}
	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		offset = 0
	}

	// Fall back to server UTC date when the client omits today.
	if today == "" {
		today = time.Now().UTC().Format("2006-01-02")
	}

	args := pgx.NamedArgs{
		"userID": userID,
		"today":  today,
		// Fetch one extra row to determine has_more without a COUNT query.
		"limit":  limit + 1,
		"offset": offset,
	}

	// Build view-specific WHERE clause and ORDER BY.
	// Routing date is COALESCE(scheduled_date, deadline) — when only a deadline is set,
	// it acts as the effective date for Today/Upcoming placement (same as Todoist).
	var whereExtra, orderBy string
	switch view {
	case "today":
		whereExtra = "AND COALESCE(t.scheduled_date, t.deadline) <= @today::date AND t.status::text IN ('todo', 'in_progress')"
		orderBy = "COALESCE(t.scheduled_date, t.deadline) ASC, t.created_at ASC, t.id ASC"
	case "upcoming":
		// Includes overdue + today + next 7 days so the view covers everything
		// the user needs to action, not just future-scheduled tasks.
		whereExtra = "AND COALESCE(t.scheduled_date, t.deadline) IS NOT NULL AND COALESCE(t.scheduled_date, t.deadline) <= (@today::date + INTERVAL '7 days') AND t.status::text IN ('todo', 'in_progress')"
		orderBy = "COALESCE(t.scheduled_date, t.deadline) ASC, t.created_at ASC, t.id ASC"
	case "all":
		whereExtra = "AND t.status::text IN ('todo', 'in_progress')"
		orderBy = "COALESCE(t.scheduled_date, t.deadline) ASC NULLS LAST, t.created_at ASC, t.id ASC"
	case "backlog":
		// Backlog: no scheduled_date and no deadline — task has no time anchor.
		whereExtra = "AND t.status::text IN ('todo', 'in_progress') AND t.scheduled_date IS NULL AND t.deadline IS NULL"
		orderBy = "t.created_at ASC, t.id ASC"
	case "completed":
		whereExtra = "AND t.status::text = 'completed'"
		orderBy = "t.completed_at DESC, t.id DESC"
	case "canceled":
		whereExtra = "AND t.status::text = 'canceled'"
		orderBy = "t.canceled_at DESC, t.id DESC"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid view; expected today|upcoming|all|backlog|completed|canceled"})
		return
	}

	// Append ILIKE search across name, description, and tags when provided.
	if search != "" {
		whereExtra += ` AND (
            t.name        ILIKE '%' || @search || '%'
            OR t.description  ILIKE '%' || @search || '%'
            OR EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag ILIKE '%' || @search || '%')
        )`
		args["search"] = search
	}

	sql := fmt.Sprintf(`
        SELECT %s
        FROM tasks t
        WHERE t.user_id = @userID
        %s
        ORDER BY %s
        LIMIT @limit OFFSET @offset`, taskSelectSQL, whereExtra, orderBy)

	tasks, err := queryMany[task](h.db, c, sql, args)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load tasks"})
		return
	}

	// Trim the extra row and signal whether more pages exist.
	hasMore := len(tasks) > limit
	if hasMore {
		tasks = tasks[:limit]
	}

	// Ensure nil slices serialize as [] not null.
	if tasks == nil {
		tasks = []task{}
	}
	for i := range tasks {
		if tasks[i].Tags == nil {
			tasks[i].Tags = []string{}
		}
	}

	c.JSON(http.StatusOK, taskListResponse{Tasks: tasks, HasMore: hasMore})
}

/* ─── Overdue count ───────────────────────────────────────────────────── */

// getOverdueCount returns the count of active tasks past their routing date.
// Routing date is COALESCE(scheduled_date, deadline), matching listTasks logic.
// Used by the sidebar nav badge. Query param: today=YYYY-MM-DD (client's local date).
func (h *Handler) getOverdueCount(c *gin.Context) {
	userID := c.GetInt("user_id")
	today := c.Query("today")
	if today == "" {
		today = time.Now().UTC().Format("2006-01-02")
	}

	var count int
	err := h.db.QueryRow(c,
		`SELECT COUNT(*) FROM tasks
         WHERE user_id = $1
           AND status::text IN ('todo', 'in_progress')
           AND COALESCE(scheduled_date, deadline) < $2::date`,
		userID, today).Scan(&count)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count overdue tasks"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"count": count})
}

/* ─── Get task ────────────────────────────────────────────────────────── */

// getTask returns a single task by ID. Returns 404 if the task doesn't exist
// or doesn't belong to the authenticated user.
func (h *Handler) getTask(c *gin.Context) {
	userID := c.GetInt("user_id")
	taskID := c.Param("id")

	t, err := queryOne[task](h.db, c, fmt.Sprintf(`
        SELECT %s
        FROM tasks t
        WHERE t.id = @taskID AND t.user_id = @userID`, taskSelectSQL),
		pgx.NamedArgs{"taskID": taskID, "userID": userID})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	if t.Tags == nil {
		t.Tags = []string{}
	}

	c.JSON(http.StatusOK, t)
}

/* ─── Create task ─────────────────────────────────────────────────────── */

// createTask inserts a new task for the authenticated user, writes any provided
// tags to task_tags, and returns the full task.
func (h *Handler) createTask(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req createTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Priority == "" {
		req.Priority = "medium"
	}
	validPriorities := map[string]bool{"urgent": true, "high": true, "medium": true, "low": true}
	if !validPriorities[req.Priority] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "priority must be urgent|high|medium|low"})
		return
	}

	// Build NULL-safe SQL literals for optional date/time fields.
	// Named args cannot express NULL directly for cast expressions, so we
	// interpolate the SQL fragment and pass the value only when non-empty.
	scheduledDateSQL := "NULL"
	scheduledTimeSQL := "NULL"
	deadlineSQL := "NULL"
	insertArgs := pgx.NamedArgs{
		"userID":         userID,
		"name":           req.Name,
		"description":    req.Description,
		"priority":       req.Priority,
		"recurrenceRule": req.RecurrenceRule,
	}
	if req.ScheduledDate != nil && *req.ScheduledDate != "" {
		scheduledDateSQL = "@scheduledDate::date"
		insertArgs["scheduledDate"] = *req.ScheduledDate
	}
	if req.ScheduledTime != nil && *req.ScheduledTime != "" {
		scheduledTimeSQL = "@scheduledTime::time"
		insertArgs["scheduledTime"] = *req.ScheduledTime
	}
	if req.Deadline != nil && *req.Deadline != "" {
		deadlineSQL = "@deadline::date"
		insertArgs["deadline"] = *req.Deadline
	}

	// Use a fixed '{}' for tags in RETURNING — the actual tags are inserted
	// separately below and returned as part of the response manually.
	t, err := queryOne[task](h.db, c, fmt.Sprintf(`
        INSERT INTO tasks (user_id, name, description, scheduled_date, scheduled_time, deadline, priority, recurrence_rule)
        VALUES (@userID, @name, @description, %s, %s, %s, @priority::task_priority, @recurrenceRule)
        RETURNING
            id, user_id, name, description, scheduled_date,
            TO_CHAR(scheduled_time, 'HH24:MI') AS scheduled_time,
            deadline,
            priority::text AS priority, status::text AS status,
            started_at, completed_at, canceled_at, recurrence_rule,
            created_at, updated_at,
            '{}'::text[] AS tags`, scheduledDateSQL, scheduledTimeSQL, deadlineSQL),
		insertArgs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create task"})
		return
	}

	// Insert tags and return them sorted.
	tags := req.Tags
	if tags == nil {
		tags = []string{}
	}
	if len(tags) > 0 {
		if err := insertTaskTags(h, c, t.ID, tags); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to insert tags"})
			return
		}
		sort.Strings(tags)
	}
	t.Tags = tags

	c.JSON(http.StatusCreated, t)
}

/* ─── Update task ─────────────────────────────────────────────────────── */

// updateTask applies a partial update to a task. Only non-nil fields are written.
// Status transitions automatically manage timestamps:
//
//	in_progress → set started_at = COALESCE(started_at, NOW()) (preserves original), clear completed_at/canceled_at
//	completed   → set completed_at = NOW(), clear canceled_at
//	canceled    → set canceled_at = NOW(), clear completed_at
//	todo        → clear completed_at/canceled_at; started_at is never cleared
//
// When Tags is non-nil, the tag set is fully replaced (delete all, re-insert).
// Sending an empty string for scheduled_date, scheduled_time, or deadline clears that field.
func (h *Handler) updateTask(c *gin.Context) {
	userID := c.GetInt("user_id")
	taskID := c.Param("id")

	var req updateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build dynamic SET clause — only write fields the client provided.
	setClauses := []string{"updated_at = NOW()"}
	args := pgx.NamedArgs{"userID": userID, "taskID": taskID}

	if req.Name != nil {
		setClauses = append(setClauses, "name = @name")
		args["name"] = *req.Name
	}
	if req.Description != nil {
		setClauses = append(setClauses, "description = @description")
		args["description"] = *req.Description
	}
	if req.ScheduledDate != nil {
		if *req.ScheduledDate == "" {
			// Empty string clears the scheduled date, routing the task to Backlog.
			setClauses = append(setClauses, "scheduled_date = NULL")
		} else {
			setClauses = append(setClauses, "scheduled_date = @scheduledDate::date")
			args["scheduledDate"] = *req.ScheduledDate
		}
	}
	if req.ScheduledTime != nil {
		if *req.ScheduledTime == "" {
			setClauses = append(setClauses, "scheduled_time = NULL")
		} else {
			setClauses = append(setClauses, "scheduled_time = @scheduledTime::time")
			args["scheduledTime"] = *req.ScheduledTime
		}
	}
	if req.Deadline != nil {
		if *req.Deadline == "" {
			setClauses = append(setClauses, "deadline = NULL")
		} else {
			setClauses = append(setClauses, "deadline = @deadline::date")
			args["deadline"] = *req.Deadline
		}
	}
	if req.Priority != nil {
		setClauses = append(setClauses, "priority = @priority::task_priority")
		args["priority"] = *req.Priority
	}
	if req.RecurrenceRule != nil {
		setClauses = append(setClauses, "recurrence_rule = @recurrenceRule")
		args["recurrenceRule"] = req.RecurrenceRule
	}
	if req.Status != nil {
		setClauses = append(setClauses, "status = @status::task_status")
		args["status"] = *req.Status
		// Manage timestamps for status transitions.
		switch *req.Status {
		case "completed":
			setClauses = append(setClauses, "completed_at = NOW()", "canceled_at = NULL")
		case "canceled":
			setClauses = append(setClauses, "canceled_at = NOW()", "completed_at = NULL")
		case "in_progress":
			// Auto-set started_at on the first transition to in_progress only.
			// COALESCE preserves the original start time if the task was already started.
			setClauses = append(setClauses, "completed_at = NULL", "canceled_at = NULL",
				"started_at = COALESCE(started_at, NOW())")
		case "todo":
			// Undo: clear terminal timestamps but leave started_at intact.
			setClauses = append(setClauses, "completed_at = NULL", "canceled_at = NULL")
		}
	}

	t, err := queryOne[task](h.db, c, fmt.Sprintf(`
        UPDATE tasks SET %s
        WHERE id = @taskID AND user_id = @userID
        RETURNING
            id, user_id, name, description, scheduled_date,
            TO_CHAR(scheduled_time, 'HH24:MI') AS scheduled_time,
            deadline,
            priority::text AS priority, status::text AS status,
            started_at, completed_at, canceled_at, recurrence_rule,
            created_at, updated_at,
            COALESCE(ARRAY(SELECT tag FROM task_tags WHERE task_id = id ORDER BY tag), '{}') AS tags`,
		strings.Join(setClauses, ", ")), args)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	// Full-replace tags when the client provides a new tag set.
	if req.Tags != nil {
		if _, err := h.db.Exec(c, `DELETE FROM task_tags WHERE task_id = $1`, t.ID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update tags"})
			return
		}
		tags := *req.Tags
		if tags == nil {
			tags = []string{}
		}
		if len(tags) > 0 {
			if err := insertTaskTags(h, c, t.ID, tags); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to insert tags"})
				return
			}
		}
		sort.Strings(tags)
		t.Tags = tags
	}
	if t.Tags == nil {
		t.Tags = []string{}
	}

	c.JSON(http.StatusOK, t)
}

/* ─── Delete task ─────────────────────────────────────────────────────── */

// deleteTask permanently deletes a task. task_tags rows are removed by CASCADE.
func (h *Handler) deleteTask(c *gin.Context) {
	userID := c.GetInt("user_id")
	taskID := c.Param("id")

	_, err := h.db.Exec(c,
		`DELETE FROM tasks WHERE id = $1 AND user_id = $2`,
		taskID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete task"})
		return
	}

	c.Status(http.StatusNoContent)
}

/* ─── Complete task ───────────────────────────────────────────────────── */

// nextOccurrence computes the next scheduled date for a recurring task.
// base is the reference time: either the current scheduled_date (anchor="schedule")
// or time.Now() (anchor="completion") — the caller is responsible for providing
// the correct base. The returned time is always midnight UTC on the next date.
//
// This function is extracted as a pure function to be independently unit-testable.
func nextOccurrence(rule RecurrenceRule, base time.Time) time.Time {
	// Normalise to midnight UTC so date arithmetic is day-clean.
	base = time.Date(base.Year(), base.Month(), base.Day(), 0, 0, 0, 0, time.UTC)

	switch rule.Frequency {
	case "daily":
		return base.AddDate(0, 0, 1)

	case "weekdays":
		// Advance one day at a time until we land on Mon–Fri.
		next := base.AddDate(0, 0, 1)
		for next.Weekday() == time.Saturday || next.Weekday() == time.Sunday {
			next = next.AddDate(0, 0, 1)
		}
		return next

	case "weekly":
		if len(rule.DaysOfWeek) == 0 {
			return base.AddDate(0, 0, 7)
		}
		// Find the earliest day in DaysOfWeek that comes after base (wraps around
		// the week if needed, so we always advance at least one day).
		next := base.AddDate(0, 0, 1)
		for i := 0; i < 8; i++ {
			wd := int(next.Weekday())
			for _, d := range rule.DaysOfWeek {
				if d == wd {
					return next
				}
			}
			next = next.AddDate(0, 0, 1)
		}
		return base.AddDate(0, 0, 7) // fallback — should never be reached

	case "monthly":
		// Advance one month but clamp the day to the last day of the target month.
		// e.g. Jan 31 → Feb 28/29 rather than overflowing into March.
		y, m, d := base.Date()
		targetMonth := m + 1
		targetYear := y
		if targetMonth > 12 {
			targetMonth = 1
			targetYear++
		}
		// time.Date with day=0 gives the last day of the preceding month.
		lastDayOfTarget := time.Date(targetYear, time.Month(targetMonth)+1, 0, 0, 0, 0, 0, time.UTC).Day()
		if d > lastDayOfTarget {
			d = lastDayOfTarget
		}
		return time.Date(targetYear, time.Month(targetMonth), d, 0, 0, 0, 0, time.UTC)

	case "yearly":
		return base.AddDate(1, 0, 0)

	case "custom":
		interval := rule.Interval
		if interval <= 0 {
			interval = 1
		}
		switch rule.Unit {
		case "weeks":
			return base.AddDate(0, 0, interval*7)
		case "months":
			return base.AddDate(0, interval, 0)
		default: // days
			return base.AddDate(0, 0, interval)
		}

	default:
		return base.AddDate(0, 0, 1)
	}
}

// completeTask handles PATCH /api/tasks/:id/complete.
// For non-recurring tasks: inserts a task_completions record and marks the task completed.
// For recurring tasks: inserts a task_completions record and advances scheduled_date to
// the next occurrence without changing status. Returns next_scheduled_date when recurring.
func (h *Handler) completeTask(c *gin.Context) {
	userID := c.GetInt("user_id")
	taskID := c.Param("id")

	// Fetch current task state — needed for recurrence_rule and scheduled_date.
	current, err := queryOne[task](h.db, c, fmt.Sprintf(
		`SELECT %s FROM tasks t WHERE t.id = @taskID AND t.user_id = @userID`, taskSelectSQL),
		pgx.NamedArgs{"taskID": taskID, "userID": userID})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	// Parse recurrence rule if present.
	var rule *RecurrenceRule
	if current.RecurrenceRule != nil {
		rule = &RecurrenceRule{}
		if err := json.Unmarshal(*current.RecurrenceRule, rule); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid recurrence rule"})
			return
		}
	}

	// Record the current scheduled_date for undo support.
	var prevScheduledDate interface{} // nil → SQL NULL
	if current.ScheduledDate != nil {
		prevScheduledDate = current.ScheduledDate.Time.Format("2006-01-02")
	}
	if _, err := h.db.Exec(c,
		`INSERT INTO task_completions (task_id, previous_scheduled_date) VALUES ($1, $2::date)`,
		taskID, prevScheduledDate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record completion"})
		return
	}

	var nextScheduledDate *string

	if rule == nil {
		// Non-recurring: mark completed.
		if _, err := h.db.Exec(c,
			`UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2`,
			taskID, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to complete task"})
			return
		}
	} else {
		// Recurring: advance scheduled_date, leave status unchanged.
		// Use scheduled_date as base for "schedule" anchor, NOW() for "completion".
		base := time.Now().UTC()
		if rule.Anchor != "completion" && current.ScheduledDate != nil {
			base = current.ScheduledDate.Time
		}
		next := nextOccurrence(*rule, base)
		// Advance past today — for overdue tasks one interval may still land in the past.
		now := time.Now().UTC()
		nowDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		for !next.After(nowDate) {
			next = nextOccurrence(*rule, next)
		}
		nextStr := next.Format("2006-01-02")
		nextScheduledDate = &nextStr

		if _, err := h.db.Exec(c,
			`UPDATE tasks SET scheduled_date = $1::date, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
			nextStr, taskID, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to advance scheduled date"})
			return
		}
	}

	// Re-fetch the updated task for the response.
	updated, err := queryOne[task](h.db, c, fmt.Sprintf(
		`SELECT %s FROM tasks t WHERE t.id = @taskID AND t.user_id = @userID`, taskSelectSQL),
		pgx.NamedArgs{"taskID": taskID, "userID": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reload task"})
		return
	}
	if updated.Tags == nil {
		updated.Tags = []string{}
	}

	c.JSON(http.StatusOK, completeTaskResponse{Task: updated, NextScheduledDate: nextScheduledDate})
}

/* ─── Complete task forever ───────────────────────────────────────────── */

// completeTaskForever handles PATCH /api/tasks/:id/complete-forever.
// For recurring tasks this terminates the recurrence: inserts a task_completions
// record and sets status = completed, bypassing the recurrence_rule entirely.
func (h *Handler) completeTaskForever(c *gin.Context) {
	userID := c.GetInt("user_id")
	taskID := c.Param("id")

	// Verify ownership and capture previous scheduled_date for the completion record.
	current, err := queryOne[task](h.db, c, fmt.Sprintf(
		`SELECT %s FROM tasks t WHERE t.id = @taskID AND t.user_id = @userID`, taskSelectSQL),
		pgx.NamedArgs{"taskID": taskID, "userID": userID})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	var prevScheduledDate interface{}
	if current.ScheduledDate != nil {
		prevScheduledDate = current.ScheduledDate.Time.Format("2006-01-02")
	}
	if _, err := h.db.Exec(c,
		`INSERT INTO task_completions (task_id, previous_scheduled_date) VALUES ($1, $2::date)`,
		taskID, prevScheduledDate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record completion"})
		return
	}

	if _, err := h.db.Exec(c,
		`UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2`,
		taskID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to complete task"})
		return
	}

	updated, err := queryOne[task](h.db, c, fmt.Sprintf(
		`SELECT %s FROM tasks t WHERE t.id = @taskID AND t.user_id = @userID`, taskSelectSQL),
		pgx.NamedArgs{"taskID": taskID, "userID": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reload task"})
		return
	}
	if updated.Tags == nil {
		updated.Tags = []string{}
	}

	c.JSON(http.StatusOK, updated)
}

/* ─── Undo completion ─────────────────────────────────────────────────── */

// undoCompletion handles DELETE /api/tasks/:id/completions/latest.
// Deletes the most recent task_completions row.
// For recurring tasks: restores scheduled_date to the value before the completion.
// For non-recurring tasks: restores status to 'todo' and clears completed_at.
func (h *Handler) undoCompletion(c *gin.Context) {
	userID := c.GetInt("user_id")
	taskID := c.Param("id")

	// Fetch the latest completion record.
	var completionID int
	var prevScheduledDate *string // nil if no scheduled_date was recorded
	err := h.db.QueryRow(c,
		`SELECT id, TO_CHAR(previous_scheduled_date, 'YYYY-MM-DD')
         FROM task_completions
         WHERE task_id = $1
         ORDER BY completed_at DESC
         LIMIT 1`,
		taskID).Scan(&completionID, &prevScheduledDate)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no completion record found"})
		return
	}

	// Verify task ownership and check if it has a recurrence rule.
	var hasRecurrence bool
	err = h.db.QueryRow(c,
		`SELECT recurrence_rule IS NOT NULL FROM tasks WHERE id = $1 AND user_id = $2`,
		taskID, userID).Scan(&hasRecurrence)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	// Delete the completion record.
	if _, err := h.db.Exec(c, `DELETE FROM task_completions WHERE id = $1`, completionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete completion"})
		return
	}

	// Restore task state based on whether it is recurring.
	if hasRecurrence {
		// Restore previous scheduled_date. Also restore status to 'todo' if the task is
		// currently 'completed' — this handles the completeTaskForever undo path where
		// the task was permanently completed despite having a recurrence rule.
		if prevScheduledDate != nil {
			_, err = h.db.Exec(c,
				`UPDATE tasks
				 SET scheduled_date = $1::date,
				     status = CASE WHEN status = 'completed' THEN 'todo' ELSE status END,
				     completed_at = CASE WHEN status = 'completed' THEN NULL ELSE completed_at END,
				     updated_at = NOW()
				 WHERE id = $2 AND user_id = $3`,
				*prevScheduledDate, taskID, userID)
		} else {
			_, err = h.db.Exec(c,
				`UPDATE tasks
				 SET scheduled_date = NULL,
				     status = CASE WHEN status = 'completed' THEN 'todo' ELSE status END,
				     completed_at = CASE WHEN status = 'completed' THEN NULL ELSE completed_at END,
				     updated_at = NOW()
				 WHERE id = $1 AND user_id = $2`,
				taskID, userID)
		}
	} else {
		// Non-recurring: revert to todo.
		_, err = h.db.Exec(c,
			`UPDATE tasks SET status = 'todo', completed_at = NULL, canceled_at = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
			taskID, userID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to restore task"})
		return
	}

	updated, err := queryOne[task](h.db, c, fmt.Sprintf(
		`SELECT %s FROM tasks t WHERE t.id = @taskID AND t.user_id = @userID`, taskSelectSQL),
		pgx.NamedArgs{"taskID": taskID, "userID": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reload task"})
		return
	}
	if updated.Tags == nil {
		updated.Tags = []string{}
	}

	c.JSON(http.StatusOK, updated)
}
