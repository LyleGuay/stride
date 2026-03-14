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

/* ─── Habits ─────────────────────────────────────────────────────────────── */

// Habit mirrors the habits DB row. Habits have 1–3 levels of completion;
// level1_label is required, level2_label/level3_label are optional stretch goals.
export interface Habit {
  id: number
  user_id: number
  name: string
  emoji: string | null
  color: string | null
  frequency: 'daily' | 'weekly'
  weekly_target: number | null  // null for daily habits; 1–7 for weekly habits
  level1_label: string
  level2_label: string | null
  level3_label: string | null
  sort_order: number
  archived_at: string | null
  created_at: string
  updated_at: string
}

// HabitLog mirrors a single habit_logs DB row. Sparse model — absence means not done.
export interface HabitLog {
  id: number
  user_id: number
  habit_id: number
  date: string      // YYYY-MM-DD
  level: 1 | 2 | 3
}

// HabitWithLog is returned by GET /api/habits?date= — the habit plus today's log
// entry (null if not logged) and computed streak/consistency stats.
export interface HabitWithLog extends Habit {
  log: HabitLog | null
  current_streak: number
  longest_streak: number
  consistency_30d: number  // 0–100 percentage
  avg_level_30d: number
}

// HabitWeekEntry is one element of GET /api/habits/week — a habit with stats
// (streak/consistency) and all its logs for the requested 7-day window.
// habit.log will be null (no single-date log in week view; use logs array instead).
export interface HabitWeekEntry {
  habit: HabitWithLog
  logs: HabitLog[]
}

// CreateHabitInput is the body for POST /api/habits.
export type CreateHabitInput = Omit<Habit, 'id' | 'user_id' | 'archived_at' | 'created_at' | 'updated_at'>

// UpdateHabitInput is the body for PATCH /api/habits/:id — all fields optional.
export type UpdateHabitInput = Partial<CreateHabitInput>

/* ─── Journal ────────────────────────────────────────────────────────────── */

// JournalTag is the union of all emotion and entry-type tag values.
// Mirrors the journal_tag PostgreSQL enum.
export type JournalTag =
  // Emotions
  | 'happy' | 'excited' | 'motivated' | 'energized' | 'calm' | 'content' | 'grateful'
  | 'neutral' | 'bored' | 'unmotivated' | 'anxious' | 'overwhelmed' | 'low'
  | 'sad' | 'angry' | 'frustrated' | 'depressed'
  // Entry types
  | 'thoughts' | 'idea' | 'venting' | 'open_loop' | 'reminder' | 'life_update' | 'feelings'

// EMOTION_TAGS is the set of tags that represent emotional states.
// Used to classify tags for coloring and mental-state scoring.
export const EMOTION_TAGS = new Set<JournalTag>([
  'happy', 'excited', 'motivated', 'energized', 'calm', 'content', 'grateful',
  'neutral', 'bored', 'unmotivated', 'anxious', 'overwhelmed', 'low',
  'sad', 'angry', 'frustrated', 'depressed',
])

// ENTRY_TYPE_TAGS is the set of tags that describe the kind of entry written.
// Rendered as plain chips with no color.
export const ENTRY_TYPE_TAGS = new Set<JournalTag>([
  'thoughts', 'idea', 'venting', 'open_loop', 'reminder', 'life_update', 'feelings',
])

// Which feature created the journal entry. Extensible enum — only 'habit' for now.
export type JournalEntrySource = 'habit'

// JournalEntry mirrors a journal_entries DB row, with habit name joined from habits.
export interface JournalEntry {
  id: number
  entry_date: string        // YYYY-MM-DD
  entry_time: string        // HH:MM, set server-side
  body: string              // raw markdown
  tags: JournalTag[]
  habit_id: number | null
  habit_name: string | null
  // Nullable — only set when the entry was created from a feature (e.g. a habit card).
  source: JournalEntrySource | null
  // The habit's log level at the time of journaling. 0 = failed/missed, 1–3 = completed level.
  // Null for pre-migration entries or entries not linked to a habit.
  habit_level: number | null
  created_at: string
}

// JournalSummaryResponse is returned by GET /api/journal/summary.
export interface JournalSummaryResponse {
  mental_state_points: { date: string; score: number }[]
  top_emotions: { tag: JournalTag; count: number }[]
  entry_type_counts: { tag: JournalTag; count: number }[]
}

// CreateJournalEntryInput is the body for POST /api/journal.
// entry_time is optional — client should send local HH:MM; server falls back to NOW().
export interface CreateJournalEntryInput {
  entry_date: string        // YYYY-MM-DD
  entry_time?: string       // HH:MM local time; omit for habit-auto-created entries
  body: string
  tags: JournalTag[]
  habit_id?: number | null
  source?: JournalEntrySource | null
  habit_level?: number | null
}

// UpdateJournalEntryInput is the body for PUT /api/journal/:id — all fields optional.
export type UpdateJournalEntryInput = Partial<CreateJournalEntryInput>
