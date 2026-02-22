// API service layer — all backend calls go through request() which handles
// auth headers, 401 redirects, and consistent error extraction.

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

/* ─── Types ───────────────────────────────────────────────────────── */

// CalorieLogItem mirrors the calorie_log_items DB row.
export interface CalorieLogItem {
  id: number
  user_id: number
  date: string
  item_name: string
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'exercise'
  qty: number | null
  uom: string | null
  calories: number
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  created_at: string
  updated_at: string
}

// CalorieLogUserSettings contains the user's daily calorie budget, macro targets,
// per-meal budgets, body-profile fields for TDEE computation, and server-computed
// values populated when all profile fields are present.
export interface CalorieLogUserSettings {
  user_id: number
  calorie_budget: number
  protein_target_g: number
  carbs_target_g: number
  fat_target_g: number
  breakfast_budget: number
  lunch_budget: number
  dinner_budget: number
  snack_budget: number
  exercise_target_calories: number
  // Profile fields — nullable until the user completes setup
  sex: string | null
  date_of_birth: string | null
  height_cm: number | null
  weight_lbs: number | null
  activity_level: string | null
  target_weight_lbs: number | null
  target_date: string | null
  units: string
  budget_auto: boolean
  setup_complete: boolean
  // Computed by server when all profile fields are present
  computed_bmr?: number
  computed_tdee?: number
  computed_budget?: number
  pace_lbs_per_week?: number
}

// DailySummary is the response from GET /calorie-log/daily — includes items,
// settings, and server-computed totals (net calories, macros, etc.).
export interface DailySummary {
  date: string
  calorie_budget: number
  calories_food: number
  calories_exercise: number
  net_calories: number
  calories_left: number
  protein_g: number
  carbs_g: number
  fat_g: number
  items: CalorieLogItem[]
  settings: CalorieLogUserSettings
}

// WeekDaySummary is one day's entry in the GET /calorie-log/week-summary response.
// Days with no logged items have has_data=false and zero calorie fields.
export interface WeekDaySummary {
  date: string
  calorie_budget: number
  calories_food: number
  calories_exercise: number
  net_calories: number
  calories_left: number
  protein_g: number
  carbs_g: number
  fat_g: number
  has_data: boolean
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
