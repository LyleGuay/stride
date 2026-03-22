package main

import (
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
// due_time is formatted as "HH:MM" by TO_CHAR so it scans cleanly into *string —
// the same pattern used for entry_time in journal.go.
// Tags are fetched from task_tags via an ARRAY subquery; COALESCE ensures an
// empty array (not NULL) when a task has no tags.
const taskSelectSQL = `
    t.id, t.user_id, t.name, t.description,
    t.due_date,
    TO_CHAR(t.due_time, 'HH24:MI') AS due_time,
    t.priority::text AS priority,
    t.status::text  AS status,
    t.completed_at, t.canceled_at, t.created_at, t.updated_at,
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
//	today     — due today or overdue, active tasks
//	upcoming  — due in the next 7 days, active tasks
//	all       — all active tasks regardless of due date
//	backlog   — active tasks with no due date
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
	var whereExtra, orderBy string
	switch view {
	case "today":
		whereExtra = "AND t.due_date <= @today::date AND t.status::text IN ('todo', 'in_progress')"
		orderBy = "t.due_date ASC, t.created_at ASC, t.id ASC"
	case "upcoming":
		whereExtra = "AND t.due_date > @today::date AND t.due_date <= (@today::date + INTERVAL '7 days') AND t.status::text IN ('todo', 'in_progress')"
		orderBy = "t.due_date ASC, t.created_at ASC, t.id ASC"
	case "all":
		whereExtra = "AND t.status::text IN ('todo', 'in_progress')"
		orderBy = "t.due_date ASC NULLS LAST, t.created_at ASC, t.id ASC"
	case "backlog":
		whereExtra = "AND t.status::text IN ('todo', 'in_progress') AND t.due_date IS NULL"
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

// getOverdueCount returns the count of active tasks past their due date.
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
           AND due_date < $2::date`,
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
	dueDateSQL := "NULL"
	dueTimeSQL := "NULL"
	insertArgs := pgx.NamedArgs{
		"userID":      userID,
		"name":        req.Name,
		"description": req.Description,
		"priority":    req.Priority,
	}
	if req.DueDate != nil && *req.DueDate != "" {
		dueDateSQL = "@dueDate::date"
		insertArgs["dueDate"] = *req.DueDate
	}
	if req.DueTime != nil && *req.DueTime != "" {
		dueTimeSQL = "@dueTime::time"
		insertArgs["dueTime"] = *req.DueTime
	}

	// Use a fixed '{}' for tags in RETURNING — the actual tags are inserted
	// separately below and returned as part of the response manually.
	t, err := queryOne[task](h.db, c, fmt.Sprintf(`
        INSERT INTO tasks (user_id, name, description, due_date, due_time, priority)
        VALUES (@userID, @name, @description, %s, %s, @priority::task_priority)
        RETURNING
            id, user_id, name, description, due_date,
            TO_CHAR(due_time, 'HH24:MI') AS due_time,
            priority::text AS priority, status::text AS status,
            completed_at, canceled_at, created_at, updated_at,
            '{}'::text[] AS tags`, dueDateSQL, dueTimeSQL),
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
// Status transitions automatically manage completed_at and canceled_at timestamps:
//
//	completed   → set completed_at = NOW(), clear canceled_at
//	canceled    → set canceled_at = NOW(), clear completed_at
//	todo/in_progress → clear both timestamps
//
// When Tags is non-nil, the tag set is fully replaced (delete all, re-insert).
// Sending an empty string for due_date or due_time clears that field.
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
	if req.DueDate != nil {
		if *req.DueDate == "" {
			// Empty string clears the due date, routing the task to Backlog.
			setClauses = append(setClauses, "due_date = NULL")
		} else {
			setClauses = append(setClauses, "due_date = @dueDate::date")
			args["dueDate"] = *req.DueDate
		}
	}
	if req.DueTime != nil {
		if *req.DueTime == "" {
			setClauses = append(setClauses, "due_time = NULL")
		} else {
			setClauses = append(setClauses, "due_time = @dueTime::time")
			args["dueTime"] = *req.DueTime
		}
	}
	if req.Priority != nil {
		setClauses = append(setClauses, "priority = @priority::task_priority")
		args["priority"] = *req.Priority
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
		case "todo", "in_progress":
			// Restoring an active status (undo) clears both terminal timestamps.
			setClauses = append(setClauses, "completed_at = NULL", "canceled_at = NULL")
		}
	}

	t, err := queryOne[task](h.db, c, fmt.Sprintf(`
        UPDATE tasks SET %s
        WHERE id = @taskID AND user_id = @userID
        RETURNING
            id, user_id, name, description, due_date,
            TO_CHAR(due_time, 'HH24:MI') AS due_time,
            priority::text AS priority, status::text AS status,
            completed_at, canceled_at, created_at, updated_at,
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
