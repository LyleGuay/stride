// API service layer — all backend calls go through request() which handles
// auth headers, 401 redirects, and consistent error extraction.

import type { CalorieLogItem, CalorieLogUserSettings, DailySummary, WeekDaySummary } from './types'

// Re-export types so existing imports from api.ts keep working.
export type { CalorieLogItem, CalorieLogUserSettings, DailySummary, WeekDaySummary }

function getToken(): string | null {
  return localStorage.getItem('token')
}

// request is the base fetch wrapper. Attaches Bearer token, handles 401
// by clearing the token and redirecting to login, and extracts error messages.
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

// Auth
export function login(username: string, password: string) {
  return request<{ token: string; user_id: number }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
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
