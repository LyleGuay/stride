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
  // Set when this item was logged from a recipe; null for manually-added items.
  recipe_id: number | null
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

// AISuggestion is the structured nutrition data returned by POST /api/calorie-log/suggest.
// For exercise entries, only item_name and calories are meaningful (macros are 0).
// Confidence is 1-5 indicating how accurate the AI's estimate is.
export interface AISuggestion {
  item_name: string
  qty: number
  uom: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  confidence: number
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

// WeekSummaryResponse is the response from GET /api/calorie-log/week-summary.
// EstimatedWeightChangeLbs is omitted when the TDEE profile is incomplete.
export interface WeekSummaryResponse {
  days: WeekDaySummary[]
  estimated_weight_change_lbs?: number
}

// WeightEntry mirrors the weight_log DB row. One entry per user per date;
// weight_lbs is always stored in lbs — clients convert for display only.
export interface WeightEntry {
  id: number
  user_id: number
  date: string
  weight_lbs: number
  created_at: string
}

// ProgressStats holds aggregate calorie stats computed from a date range (Progress tab).
export interface ProgressStats {
  days_tracked: number
  days_on_budget: number
  avg_calories_food: number
  avg_calories_exercise: number
  avg_net_calories: number
  total_calories_left: number
  // Present when TDEE profile is complete; uses per-day historical weight + age + config.
  // Positive = net surplus (gaining), negative = net deficit (losing).
  estimated_weight_change_lbs?: number
}

// ProgressResponse is the response from GET /api/calorie-log/progress.
// Days contains only dates with logged items; the frontend fills visual gaps.
export interface ProgressResponse {
  days: WeekDaySummary[]
  stats: ProgressStats
}

// CalorieLogFavorite is a saved item template used for quick re-logging.
// Mirrors the calorie_log_favorites DB row.
export interface CalorieLogFavorite {
  id: number
  user_id: number
  item_name: string
  type: string
  qty: number | null
  uom: string | null
  calories: number
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  created_at: string
}

// Recipe mirrors the recipes DB row. emoji is null when not set by the user
// (the UI falls back to a category-default emoji for display).
export interface Recipe {
  id: number
  user_id: number
  name: string
  emoji: string | null
  category: 'breakfast' | 'lunch' | 'dinner' | 'dessert' | 'snack' | 'other'
  notes: string | null
  servings: number
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  created_at: string
  updated_at: string
}

// RecipeListItem extends Recipe with computed aggregate fields returned by
// GET /api/recipes — step_count and total_timer_seconds come from correlated subqueries.
export interface RecipeListItem extends Recipe {
  step_count: number
  total_timer_seconds: number
}

// RecipeIngredient mirrors the recipe_ingredients DB row.
export interface RecipeIngredient {
  id: number
  recipe_id: number
  name: string
  qty: number | null
  uom: string | null
  note: string | null
  sort_order: number
}

// RecipeTool mirrors the recipe_tools DB row.
export interface RecipeTool {
  id: number
  recipe_id: number
  name: string
  sort_order: number
}

// RecipeStep mirrors the recipe_steps DB row. timer_seconds and meanwhile_text
// are only populated for steps of type 'timer'.
export interface RecipeStep {
  id: number
  recipe_id: number
  type: 'instruction' | 'timer'
  text: string
  timer_seconds: number | null
  meanwhile_text: string | null
  sort_order: number
}

// RecipeDetail is the full recipe response from GET /api/recipes/:id — the base
// Recipe plus all sub-lists (ingredients, tools, steps).
export interface RecipeDetail extends Recipe {
  ingredients: RecipeIngredient[]
  tools: RecipeTool[]
  steps: RecipeStep[]
}

// RecipeDraft is the shape used for create/update requests — the input types
// that map to createRecipeRequest and updateRecipeRequest on the server.
export interface RecipeIngredientInput {
  name: string
  qty: number | null
  uom: string | null
  note: string | null
  sort_order: number
}

export interface RecipeToolInput {
  name: string
  sort_order: number
}

export interface RecipeStepInput {
  type: 'instruction' | 'timer'
  text: string
  timer_seconds: number | null
  meanwhile_text: string | null
  sort_order: number
}

// CreateRecipeInput is the body for POST /api/recipes.
export interface CreateRecipeInput {
  name: string
  emoji?: string | null
  category: string
  notes?: string | null
  servings?: number
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  ingredients?: RecipeIngredientInput[]
  tools?: RecipeToolInput[]
  steps?: RecipeStepInput[]
}

// UpdateRecipeInput is the body for PUT /api/recipes/:id — all fields optional.
export type UpdateRecipeInput = Partial<CreateRecipeInput>
