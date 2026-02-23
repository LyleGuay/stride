// Shared domain types for the Stride calorie log API.
// Mirrors the Go structs in go-api/models.go.

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
