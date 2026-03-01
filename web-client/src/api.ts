// API service layer — all backend calls go through request() which handles
// auth headers, 401 redirects, and consistent error extraction.

import type { AISuggestion, CalorieLogItem, CalorieLogUserSettings, DailySummary, WeekDaySummary, WeightEntry, ProgressStats, ProgressResponse } from './types'

// Re-export types so existing imports from api.ts keep working.
export type { AISuggestion, CalorieLogItem, CalorieLogUserSettings, DailySummary, WeekDaySummary, WeightEntry, ProgressStats, ProgressResponse }

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

export function createCalorieLogItem(item: Omit<CalorieLogItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>) {
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
// ordered Mon–Sun; days with no entries have has_data=false.
export function fetchWeekSummary(weekStart: string) {
  return request<WeekDaySummary[]>(`/api/calorie-log/week-summary?week_start=${weekStart}`)
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
