// Pure utility functions and types for the Settings page.
// No React imports — everything here is independently unit-testable.

import type { CalorieLogUserSettings } from '../../api'

/* ─── Types ──────────────────────────────────────────────────────────── */

// All editable fields in display units. Weights stored as lbs (canonical),
// heights stored as cm (canonical); display inputs are derived from those.
export interface FormState {
  sex: string
  dateOfBirth: string  // YYYY-MM-DD
  heightFt: string
  heightIn: string
  heightCm: string     // canonical storage
  weightLbs: string    // canonical storage
  weightKg: string
  activityLevel: string
  exerciseTarget: string   // planned daily exercise burn (calories); adds to food budget
  targetWeightLbs: string  // canonical storage
  targetWeightKg: string
  targetDate: string
  units: 'us' | 'metric'
  budgetAuto: boolean
  manualBudget: string
  // Meal budgets — auto-split from food budget (net + exercise target) when mealBudgetAuto=true
  mealBudgetAuto: boolean
  breakfastBudget: string
  lunchBudget: string
  dinnerBudget: string
  snackBudget: string
}

// Computed preview shown in the "Your Calorie Plan" card.
export interface Preview {
  bmr: number
  tdee: number
  budget: number       // net calorie target (TDEE-derived or manual)
  foodBudget: number   // what to eat = budget + exerciseTarget
  deficit: number
  pace: number
  goalDate: Date | null  // null when not computable (e.g. no target weight set in manual mode)
}

/* ─── Activity level definitions ─────────────────────────────────────── */

export const ACTIVITY_LEVELS = [
  { value: 'sedentary',   emoji: '🪑', label: 'Sedentary',         mult: '×1.2',   desc: 'Desk job or mostly seated. Little movement outside of logged exercise.' },
  { value: 'light',       emoji: '🚶', label: 'Lightly Active',    mult: '×1.375', desc: 'On your feet some of the day — errands, light walking, standing desk.' },
  { value: 'moderate',    emoji: '🏃', label: 'Moderately Active', mult: '×1.55',  desc: 'Standing or moving most of the day — retail, service, active job.' },
  { value: 'active',      emoji: '🏋️', label: 'Very Active',       mult: '×1.725', desc: 'On your feet all day — construction, warehouse, nursing, physical trade.' },
  { value: 'very_active', emoji: '⚡', label: 'Extra Active',      mult: '×1.9',   desc: 'Intense physical job plus an active lifestyle. Rare.' },
]

/* ─── Client-side TDEE (mirrors Go computeTDEE) ─────────────────────── */

// computePreview handles both auto and manual budget modes:
// - Auto: budget derived from TDEE and goal pace toward target date
// - Manual: budget taken from form.manualBudget; deficit/pace/goal date derived from it
export function computePreview(form: FormState): Preview | null {
  const heightCm = parseFloat(form.heightCm)
  const weightLbs = parseFloat(form.weightLbs)

  // Derive age from date of birth
  let age = NaN
  if (form.dateOfBirth) {
    const dob = new Date(form.dateOfBirth)
    const today = new Date()
    age = today.getFullYear() - dob.getFullYear()
    const mDiff = today.getMonth() - dob.getMonth()
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < dob.getDate())) age--
  }

  // BMR + TDEE required for both modes
  if (!form.sex || isNaN(age) || isNaN(heightCm) || isNaN(weightLbs) || !form.activityLevel) {
    return null
  }

  const weightKg = weightLbs / 2.20462
  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age
  bmr += form.sex === 'male' ? 5 : -161

  const multipliers: Record<string, number> = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
  }
  const mult = multipliers[form.activityLevel]
  if (!mult) return null
  const tdee = bmr * mult

  // Exercise target adds to food budget on top of net calorie budget.
  // foodBudget = net budget + exercise target (Formula A).
  const exerciseTarget = parseInt(form.exerciseTarget) || 0

  if (!form.budgetAuto) {
    // Manual mode: budget is given; derive deficit/pace/goal date from it.
    // Negative deficit = caloric surplus = weight gain.
    const budget = parseInt(form.manualBudget)
    if (isNaN(budget) || budget <= 0) return null
    const deficit = tdee - budget
    const pace = deficit / 500  // negative when budget > TDEE (gaining)

    // Goal date: derive from pace + weight delta. Works for both loss (pace > 0)
    // and gain (pace < 0, target > current).
    let goalDate: Date | null = null
    const targetWeightLbs = parseFloat(form.targetWeightLbs)
    if (!isNaN(targetWeightLbs) && pace !== 0) {
      const delta = weightLbs - targetWeightLbs   // negative when gaining
      if ((delta > 0 && pace > 0) || (delta < 0 && pace < 0)) {
        const weeksNeeded = delta / pace
        goalDate = new Date(Date.now() + weeksNeeded * 7 * 24 * 60 * 60 * 1000)
      }
    }
    return {
      bmr: Math.round(bmr), tdee: Math.round(tdee),
      budget, foodBudget: budget + exerciseTarget,
      deficit: Math.round(deficit), pace, goalDate,
    }
  }

  // Auto mode: derive budget from pace toward goal date.
  // Negative pace = gaining (target > current weight).
  const targetWeightLbs = parseFloat(form.targetWeightLbs)
  if (isNaN(targetWeightLbs) || !form.targetDate) return null

  const msUntil = new Date(form.targetDate).getTime() - Date.now()
  const weeksUntil = msUntil / 1000 / 60 / 60 / 24 / 7
  if (weeksUntil <= 0) return null

  let pace = (weightLbs - targetWeightLbs) / weeksUntil
  // Cap rate at ±2 lbs/wk for both loss and gain. Only apply the 0.25 minimum
  // for weight loss — gaining should be shown as-is without a floor.
  if (pace > 2) pace = 2
  else if (pace > 0 && pace < 0.25) pace = 0.25
  else if (pace < -2) pace = -2

  const deficit = pace * 500  // negative when gaining
  const budget = Math.round(tdee - deficit)
  return {
    bmr: Math.round(bmr), tdee: Math.round(tdee),
    budget, foodBudget: budget + exerciseTarget,
    deficit: Math.round(deficit), pace, goalDate: null,
  }
}

/* ─── Unit conversion helpers ───────────────────────────────────────── */

export function cmToFtIn(cm: number) {
  const totalIn = cm / 2.54
  return { ft: Math.floor(totalIn / 12), inches: Math.round(totalIn % 12) }
}
export function ftInToCm(ft: number, inches: number) {
  return Math.round((ft * 12 + inches) * 2.54 * 10) / 10
}
export function lbsToKg(lbs: number) { return Math.round(lbs / 2.20462 * 10) / 10 }
export function kgToLbs(kg: number)  { return Math.round(kg * 2.20462 * 10) / 10 }

/* ─── Form initialization ────────────────────────────────────────────── */

// autoSplitBudgets divides a total daily food budget into default per-meal allocations.
// 20% breakfast, 20% lunch, 40% dinner, 20% snack — reflects how most people actually eat.
export function autoSplitBudgets(total: number) {
  return {
    breakfast: Math.round(total * 0.20),
    lunch:     Math.round(total * 0.20),
    dinner:    Math.round(total * 0.40),
    snack:     Math.round(total * 0.20),
  }
}

// paceToTargetDate derives a target date string from a pace preset (lbs/wk) and weight delta.
// Used by pace preset buttons so the lint rule doesn't flag Date.now() in component scope.
export function paceToTargetDate(curWeightLbs: number, goalWeightLbs: number, pace: number): string {
  const weeksNeeded = Math.abs(curWeightLbs - goalWeightLbs) / pace
  const d = new Date(Date.now() + weeksNeeded * 7 * 24 * 60 * 60 * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// buildFormState converts server settings into the mutable form state used by the UI.
// Unit display fields (ft/in, kg) are derived from canonical server values (lbs, cm).
export function buildFormState(s: CalorieLogUserSettings): FormState {
  const units = s.units === 'metric' ? 'metric' : 'us'
  let heightFt = '', heightIn = '', heightCm = ''
  if (s.height_cm != null) {
    heightCm = String(s.height_cm)
    const { ft, inches } = cmToFtIn(s.height_cm)
    heightFt = String(ft); heightIn = String(inches)
  }
  let weightLbs = '', weightKg = ''
  if (s.weight_lbs != null) {
    weightLbs = String(s.weight_lbs); weightKg = String(lbsToKg(s.weight_lbs))
  }
  let targetWeightLbs = '', targetWeightKg = ''
  if (s.target_weight_lbs != null) {
    targetWeightLbs = String(s.target_weight_lbs); targetWeightKg = String(lbsToKg(s.target_weight_lbs))
  }

  // Determine if meal budgets are auto-split (all equal to total/4) or custom
  const total = s.calorie_budget
  const autoSplit = autoSplitBudgets(total)
  const mealBudgetAuto =
    s.breakfast_budget === autoSplit.breakfast &&
    s.lunch_budget === autoSplit.lunch &&
    s.dinner_budget === autoSplit.dinner &&
    s.snack_budget === autoSplit.snack

  return {
    sex: s.sex ?? '',
    dateOfBirth: s.date_of_birth ?? '',
    heightFt, heightIn, heightCm,
    weightLbs, weightKg,
    activityLevel: s.activity_level ?? '',
    exerciseTarget: s.exercise_target_calories > 0 ? String(s.exercise_target_calories) : '',
    targetWeightLbs, targetWeightKg,
    targetDate: s.target_date ?? '',
    units: units as 'us' | 'metric',
    budgetAuto: s.budget_auto,
    manualBudget: String(s.calorie_budget),
    mealBudgetAuto,
    breakfastBudget: String(s.breakfast_budget),
    lunchBudget: String(s.lunch_budget),
    dinnerBudget: String(s.dinner_budget),
    snackBudget: String(s.snack_budget),
  }
}
