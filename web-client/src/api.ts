// API service layer — all backend calls go through request() which handles
// auth headers, 401 redirects, and consistent error extraction.

import type { AISuggestion, CalorieLogItem, CalorieLogUserSettings, DailySummary, WeekDaySummary, WeekSummaryResponse, WeightEntry, ProgressStats, ProgressResponse, CalorieLogFavorite, RecipeListItem, RecipeDetail, CreateRecipeInput, UpdateRecipeInput, Habit, HabitLog, HabitWithLog, HabitWeekEntry, CreateHabitInput, UpdateHabitInput, JournalEntry, JournalSummaryResponse, JournalSummaryRange, JournalCalendarDay, JournalTagDay, CreateJournalEntryInput, UpdateJournalEntryInput, Task, TaskListResponse, CreateTaskInput, UpdateTaskInput } from './types'

// Re-export types so existing imports from api.ts keep working.
export type { AISuggestion, CalorieLogItem, CalorieLogUserSettings, DailySummary, WeekDaySummary, WeekSummaryResponse, WeightEntry, ProgressStats, ProgressResponse, CalorieLogFavorite, RecipeListItem, RecipeDetail, CreateRecipeInput, UpdateRecipeInput, Habit, HabitLog, HabitWithLog, HabitWeekEntry, CreateHabitInput, UpdateHabitInput, JournalEntry, JournalSummaryResponse, JournalSummaryRange, JournalCalendarDay, JournalTagDay, CreateJournalEntryInput, UpdateJournalEntryInput, Task, TaskListResponse, CreateTaskInput, UpdateTaskInput }

function getToken(): string | null {
  return localStorage.getItem('token')
}

// request is the base fetch wrapper. Attaches Bearer token, handles 401
// by clearing the token and redirecting to login, and extracts error messages.
// Pass redirect401: false to suppress the redirect (e.g. the login endpoint
// itself returns 401 for bad credentials — the caller handles that).
async function request<T>(path: string, options: RequestInit = {}, redirect401 = true): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, { ...options, headers })

  if (res.status === 401) {
    if (redirect401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

// Auth — pass redirect401=false so a 401 (wrong password) throws instead of
// redirecting, allowing Login.tsx to display the error message.
export function login(username: string, password: string) {
  return request<{ token: string; user_id: number }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }, false)
}

/* ─── API functions ───────────────────────────────────────────────── */

export function fetchDailySummary(date: string) {
  return request<DailySummary>(`/api/calorie-log/daily?date=${date}`)
}

export function createCalorieLogItem(item: Omit<CalorieLogItem, 'id' | 'user_id' | 'recipe_id' | 'created_at' | 'updated_at'>) {
  return request<CalorieLogItem>('/api/calorie-log/items', {
    method: 'POST',
    body: JSON.stringify(item),
  })
}

export function updateCalorieLogItem(id: number, fields: Partial<Omit<CalorieLogItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) {
  return request<CalorieLogItem>(`/api/calorie-log/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  })
}

export function deleteCalorieLogItem(id: number) {
  return request<void>(`/api/calorie-log/items/${id}`, { method: 'DELETE' })
}

// fetchWeekSummary returns per-day calorie totals for the week starting on
// weekStart (YYYY-MM-DD, must be a Monday). Returns 7 WeekDaySummary objects
// ordered Mon–Sun plus an optional TDEE-based estimated_weight_change_lbs.
export function fetchWeekSummary(weekStart: string) {
  return request<WeekSummaryResponse>(`/api/calorie-log/week-summary?week_start=${weekStart}`)
}

export function fetchUserSettings() {
  return request<CalorieLogUserSettings>('/api/calorie-log/user-settings')
}

export function patchUserSettings(settings: Partial<Omit<CalorieLogUserSettings, 'user_id'>>) {
  return request<CalorieLogUserSettings>('/api/calorie-log/user-settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  })
}

// fetchProgress returns per-day calorie totals and aggregate stats for the given date range.
// Only days with logged items are in the response; the frontend fills visual gaps.
export function fetchProgress(start: string, end: string) {
  return request<ProgressResponse>(`/api/calorie-log/progress?start=${start}&end=${end}`)
}

// fetchEarliestLogDate returns the user's earliest calorie log date, used to compute
// the "All Time" range start. Returns null if the user has no items yet.
export function fetchEarliestLogDate() {
  return request<{ date: string | null }>('/api/calorie-log/earliest-date')
}

// fetchWeightLog returns weight entries for the given date range ordered by date ASC.
export function fetchWeightLog(start: string, end: string) {
  return request<WeightEntry[]>(`/api/weight-log?start=${start}&end=${end}`)
}

// upsertWeightEntry creates or updates the weight entry for the given date (always in lbs).
// Posts the same date a second time updates the existing entry (upsert via ON CONFLICT).
export function upsertWeightEntry(date: string, weightLbs: number) {
  return request<WeightEntry>('/api/weight-log', {
    method: 'POST',
    body: JSON.stringify({ date, weight_lbs: weightLbs }),
  })
}

// updateWeightEntry partially updates an existing weight entry (date and/or weight_lbs).
export function updateWeightEntry(id: number, fields: { date?: string; weight_lbs?: number }) {
  return request<WeightEntry>(`/api/weight-log/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  })
}

// deleteWeightEntry removes a weight log entry by id.
export function deleteWeightEntry(id: number) {
  return request<void>(`/api/weight-log/${id}`, { method: 'DELETE' })
}

// fetchFavorites returns all saved favorites for the current user, newest first.
export function fetchFavorites(): Promise<CalorieLogFavorite[]> {
  return request<CalorieLogFavorite[]>('/api/calorie-log/favorites')
}

// createFavorite saves a new favorite template from a logged item's fields.
export function createFavorite(fav: Omit<CalorieLogFavorite, 'id' | 'user_id' | 'created_at'>) {
  return request<CalorieLogFavorite>('/api/calorie-log/favorites', {
    method: 'POST',
    body: JSON.stringify(fav),
  })
}

// deleteFavorite removes a favorite by id.
export function deleteFavorite(id: number) {
  return request<void>(`/api/calorie-log/favorites/${id}`, { method: 'DELETE' })
}

/* ─── Recipe API ──────────────────────────────────────────────────── */

// fetchRecipes returns all recipes for the current user, ordered by last updated.
export function fetchRecipes() {
  return request<RecipeListItem[]>('/api/recipes')
}

// fetchRecipe returns the full detail for a single recipe (includes ingredients, tools, steps).
export function fetchRecipe(id: number) {
  return request<RecipeDetail>(`/api/recipes/${id}`)
}

// createRecipe inserts a new recipe with its sub-lists and returns the full detail.
export function createRecipe(data: CreateRecipeInput) {
  return request<RecipeDetail>('/api/recipes', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// updateRecipe updates a recipe's fields and optionally replaces its sub-lists.
export function updateRecipe(id: number, data: UpdateRecipeInput) {
  return request<RecipeDetail>(`/api/recipes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// deleteRecipe deletes a recipe (FK cascade removes sub-tables).
export function deleteRecipe(id: number) {
  return request<void>(`/api/recipes/${id}`, { method: 'DELETE' })
}

// duplicateRecipe copies a recipe and all its sub-lists into a new record.
export function duplicateRecipe(id: number) {
  return request<RecipeDetail>(`/api/recipes/${id}/duplicate`, { method: 'POST' })
}

// generateRecipe calls OpenAI to create a new recipe from a text prompt,
// inserts it into the DB, and returns the full detail.
export function generateRecipe(prompt: string) {
  return request<RecipeDetail>('/api/recipes/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
}

// aiModifyRecipe asks OpenAI to apply a modification to the current recipe.
// The server does NOT save the result — the caller applies it to the local draft
// and must call updateRecipe to persist.
export function aiModifyRecipe(id: number, prompt: string) {
  return request<CreateRecipeInput>(`/api/recipes/${id}/ai-modify`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
}

// aiCopyRecipe asks OpenAI to create a variation of the current recipe.
// Same as aiModifyRecipe — result is a draft; caller saves as new via createRecipe.
export function aiCopyRecipe(id: number, prompt: string) {
  return request<CreateRecipeInput>(`/api/recipes/${id}/ai-copy`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
}

// aiNutrition estimates nutrition totals for the recipe's ingredient list.
// Returns per-serving macros without saving anything.
export function aiNutrition(id: number) {
  return request<{ calories: number; protein_g: number; carbs_g: number; fat_g: number }>(
    `/api/recipes/${id}/ai-nutrition`,
    { method: 'POST' },
  )
}

// logFromRecipe creates a calorie log item from a recipe, scaling macros by the
// given servings multiplier and linking the entry back to the recipe via recipe_id.
export function logFromRecipe(
  recipe: RecipeDetail,
  servings: number,
  mealType: string,
  date: string,
) {
  const scale = servings / recipe.servings
  return request<CalorieLogItem>('/api/calorie-log/items', {
    method: 'POST',
    body: JSON.stringify({
      date,
      item_name: recipe.name,
      type: mealType,
      qty: servings,
      uom: 'serving',
      calories: recipe.calories != null ? Math.round(recipe.calories * scale) : 0,
      protein_g: recipe.protein_g != null ? Math.round(recipe.protein_g * scale * 10) / 10 : null,
      carbs_g: recipe.carbs_g != null ? Math.round(recipe.carbs_g * scale * 10) / 10 : null,
      fat_g: recipe.fat_g != null ? Math.round(recipe.fat_g * scale * 10) / 10 : null,
      recipe_id: recipe.id,
    }),
  })
}

/* ─── Habit API ───────────────────────────────────────────────────── */

// fetchHabits returns all active habits with today's log entry (null if not logged)
// and computed streak/consistency stats for the given date (YYYY-MM-DD).
export function fetchHabits(date: string) {
  return request<HabitWithLog[]>(`/api/habits?date=${date}`)
}

// createHabit creates a new habit and returns it.
export function createHabit(input: CreateHabitInput) {
  return request<Habit>('/api/habits', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// updateHabit patches the given fields on a habit and returns the updated record.
export function updateHabit(id: number, input: UpdateHabitInput) {
  return request<Habit>(`/api/habits/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

// archiveHabit sets archived_at on a habit, hiding it from the active list.
export function archiveHabit(id: number) {
  return request<void>(`/api/habits/${id}/archive`, { method: 'POST' })
}

// deleteHabit permanently deletes a habit and all its logs.
export function deleteHabit(id: number) {
  return request<void>(`/api/habits/${id}`, { method: 'DELETE' })
}

// upsertHabitLog sets the level for a habit on a given date. level=0 deletes the log
// (resets to not done). Returns the upserted log, or null after a delete.
export function upsertHabitLog(habitId: number, date: string, level: 0 | 1 | 2 | 3) {
  return request<HabitLog | null>('/api/habit-logs', {
    method: 'PUT',
    body: JSON.stringify({ habit_id: habitId, date, level }),
  })
}

// fetchHabitsWeek returns all active habits with their logs for the 7-day window
// starting at weekStart (YYYY-MM-DD, must be a Monday). Used by the Progress tab.
export function fetchHabitsWeek(weekStart: string) {
  return request<HabitWeekEntry[]>(`/api/habits/week?week_start=${weekStart}`)
}

// fetchHabitLogs returns all logs for a single habit in [from, to] (YYYY-MM-DD).
// Used by the Habit Detail heatmap (90-day window).
export function fetchHabitLogs(habitId: number, from: string, to: string) {
  return request<HabitLog[]>(`/api/habits/${habitId}/logs?from=${from}&to=${to}`)
}

/* ─── Journal API ────────────────────────────────────────────────── */

// fetchJournalEntries returns all journal entries for the given date (YYYY-MM-DD).
export function fetchJournalEntries(date: string) {
  return request<JournalEntry[]>(`/api/journal?date=${date}`)
}

// createJournalEntry creates a new journal entry. entry_time should be the client's
// local HH:MM so the stored time matches the user's clock rather than UTC server time.
export function createJournalEntry(input: CreateJournalEntryInput) {
  return request<JournalEntry>('/api/journal', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// updateJournalEntry updates the given fields of an existing entry.
export function updateJournalEntry(id: number, input: UpdateJournalEntryInput) {
  return request<JournalEntry>(`/api/journal/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

// deleteJournalEntry deletes a journal entry by id.
export function deleteJournalEntry(id: number) {
  return request<void>(`/api/journal/${id}`, { method: 'DELETE' })
}

// fetchJournalCalendar returns per-day entry counts and avg mental-state scores
// for the given month (YYYY-MM). Only days with at least one entry are returned.
export function fetchJournalCalendar(month: string) {
  return request<JournalCalendarDay[]>(`/api/journal/calendar?month=${month}`)
}

// fetchJournalSummary returns mental-state bar chart data and tag frequency counts
// for the given date range. ref_date anchors week/month ranges (defaults to today).
export function fetchJournalSummary(range: JournalSummaryRange, refDate?: string) {
  const params = new URLSearchParams({ range })
  if (refDate) params.set('ref_date', refDate)
  return request<JournalSummaryResponse>(`/api/journal/summary?${params}`)
}

// fetchJournalTagDays returns days within a range that contain the given tag,
// ordered newest first. Fetched lazily when the user taps an emotion/type bar.
export function fetchJournalTagDays(tag: string, range: JournalSummaryRange, refDate?: string) {
  const params = new URLSearchParams({ tag, range })
  if (refDate) params.set('ref_date', refDate)
  return request<JournalTagDay[]>(`/api/journal/tag-days?${params}`)
}

/* ─── AI calorie suggestion ───────────────────────────────────────── */

// fetchSuggestion asks the AI to parse a food/exercise description into structured
// nutrition data. Returns the suggestion, or null if the food was unrecognized.
// Throws on server errors. Supports AbortSignal for cancellation.
export async function fetchSuggestion(description: string, type: string, signal?: AbortSignal): Promise<AISuggestion | null> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch('/api/calorie-log/suggest', {
    method: 'POST',
    headers,
    body: JSON.stringify({ description, type }),
    signal,
  })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  const body = await res.json()

  if (!res.ok) {
    throw new Error(body.error || `Request failed: ${res.status}`)
  }

  // The API returns {"error": "unrecognized"} for foods it can't parse
  if (body.error === 'unrecognized') return null

  return body as AISuggestion
}

/* ─── Tasks ───────────────────────────────────────────────────────── */

export function fetchTasks(params: {
  view: string
  today: string
  search?: string
  limit?: number
  offset?: number
}): Promise<TaskListResponse> {
  const qs = new URLSearchParams({ view: params.view, today: params.today })
  if (params.search) qs.set('search', params.search)
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  if (params.offset !== undefined) qs.set('offset', String(params.offset))
  return request<TaskListResponse>(`/api/tasks?${qs}`)
}

export function fetchOverdueTaskCount(today: string): Promise<{ count: number }> {
  return request<{ count: number }>(`/api/tasks/overdue-count?today=${today}`)
}

export function createTask(input: CreateTaskInput): Promise<Task> {
  return request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) })
}

export function fetchTask(id: number): Promise<Task> {
  return request<Task>(`/api/tasks/${id}`)
}

export function updateTask(id: number, input: UpdateTaskInput): Promise<Task> {
  return request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteTask(id: number): Promise<void> {
  return request<void>(`/api/tasks/${id}`, { method: 'DELETE' })
}
