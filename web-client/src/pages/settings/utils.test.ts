import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  computePreview,
  autoSplitBudgets,
  buildFormState,
  cmToFtIn,
  ftInToCm,
  lbsToKg,
  kgToLbs,
} from './utils'
import type { FormState } from './utils'
import type { CalorieLogUserSettings } from '../../api'

/* ─── Helpers ─────────────────────────────────────────────────────────── */

// A complete, valid form that computePreview can process. Individual tests
// override specific fields to exercise edge cases.
function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    sex: 'male',
    dateOfBirth: '1990-01-01',
    heightFt: '5',
    heightIn: '11',
    heightCm: '180.3',
    weightLbs: '180',
    weightKg: '81.6',
    activityLevel: 'sedentary',
    exerciseTarget: '',
    targetWeightLbs: '170',
    targetWeightKg: '77.1',
    targetDate: '',
    units: 'us',
    budgetAuto: true,
    manualBudget: '2000',
    mealBudgetAuto: true,
    breakfastBudget: '400',
    lunchBudget: '400',
    dinnerBudget: '800',
    snackBudget: '400',
    ...overrides,
  }
}

// A minimal CalorieLogUserSettings suitable for buildFormState tests.
function makeSettings(overrides: Partial<CalorieLogUserSettings> = {}): CalorieLogUserSettings {
  return {
    user_id: 1,
    calorie_budget: 2000,
    protein_target_g: 150,
    carbs_target_g: 200,
    fat_target_g: 65,
    breakfast_budget: 400,   // 20% of 2000
    lunch_budget: 400,       // 20%
    dinner_budget: 800,      // 40%
    snack_budget: 400,       // 20%
    exercise_target_calories: 0,
    sex: 'male',
    date_of_birth: '1990-01-01',
    height_cm: 180,
    weight_lbs: 180,
    activity_level: 'sedentary',
    target_weight_lbs: 170,
    target_date: '2026-12-31',
    units: 'us',
    budget_auto: false,
    setup_complete: true,
    ...overrides,
  }
}

// Pin "today" so age-based and date-based tests are deterministic.
// Feb 24, 2026 — matches the project's current date.
const FIXED_NOW = new Date('2026-02-24T12:00:00Z').getTime()

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW) })
afterEach(() => { vi.useRealTimers() })

/* ─── computePreview ──────────────────────────────────────────────────── */

describe('computePreview', () => {
  it('returns null when sex is missing', () => {
    expect(computePreview(makeForm({ sex: '' }))).toBeNull()
  })

  it('returns null when dateOfBirth is missing', () => {
    expect(computePreview(makeForm({ dateOfBirth: '' }))).toBeNull()
  })

  it('returns null when heightCm is not a number', () => {
    expect(computePreview(makeForm({ heightCm: '' }))).toBeNull()
  })

  it('returns null when weightLbs is not a number', () => {
    expect(computePreview(makeForm({ weightLbs: '' }))).toBeNull()
  })

  it('returns null when activityLevel is missing', () => {
    expect(computePreview(makeForm({ activityLevel: '' }))).toBeNull()
  })

  describe('auto mode', () => {
    // Basic case: 180 lbs male, 180.3 cm, sedentary, age 36 (born 1990-01-01, today Feb 24 2026)
    // Expected BMR ≈ 10*(180/2.20462) + 6.25*180.3 - 5*36 + 5
    it('returns a preview with bmr, tdee, budget, pace', () => {
      const form = makeForm({
        budgetAuto: true,
        targetWeightLbs: '170',
        // 10 lbs to lose over ~10 months from Feb 24 2026 → Dec 31 2026
        targetDate: '2026-12-31',
      })
      const p = computePreview(form)
      expect(p).not.toBeNull()
      expect(p!.bmr).toBeGreaterThan(0)
      expect(p!.tdee).toBeGreaterThan(p!.bmr)
      expect(p!.pace).toBeGreaterThan(0)
      expect(p!.budget).toBeLessThan(p!.tdee)
    })

    it('caps pace at 2 lbs/wk when computed pace would exceed 2', () => {
      // Very large weight delta, very short timeline → pace would be >> 2
      const form = makeForm({
        budgetAuto: true,
        targetWeightLbs: '100',  // 80 lbs to lose
        targetDate: '2026-03-10', // only ~2 weeks away
      })
      const p = computePreview(form)
      expect(p).not.toBeNull()
      expect(p!.pace).toBe(2)
    })

    it('floors pace at 0.25 lbs/wk for weight loss when pace is very small', () => {
      // Small delta, very long timeline → pace would be < 0.25 naturally
      const form = makeForm({
        budgetAuto: true,
        targetWeightLbs: '179',  // only 1 lb to lose
        targetDate: '2030-12-31', // ~5 years away
      })
      const p = computePreview(form)
      expect(p).not.toBeNull()
      // Pace should be floored at 0.25 since the computed pace (< 0.25) is for weight loss
      expect(p!.pace).toBe(0.25)
    })

    it('does NOT apply 0.25 floor for weight gain (negative pace returned as-is)', () => {
      // Target weight above current → gaining; small gain over long period
      const form = makeForm({
        budgetAuto: true,
        weightLbs: '150',
        targetWeightLbs: '151',  // 1 lb to gain
        targetDate: '2030-12-31', // ~5 years away → very slow gain
      })
      const p = computePreview(form)
      expect(p).not.toBeNull()
      // Pace is negative (gaining) and should NOT be floored — it should be close to 0
      expect(p!.pace).toBeLessThan(0)
      expect(p!.pace).toBeGreaterThan(-0.25)
    })

    it('caps pace at -2 lbs/wk for weight gain', () => {
      // Large gain, short timeline → pace would be < -2
      const form = makeForm({
        budgetAuto: true,
        weightLbs: '150',
        targetWeightLbs: '230',  // 80 lbs to gain
        targetDate: '2026-03-10', // ~2 weeks
      })
      const p = computePreview(form)
      expect(p).not.toBeNull()
      expect(p!.pace).toBe(-2)
    })

    it('returns null when target date is in the past', () => {
      const form = makeForm({
        budgetAuto: true,
        targetWeightLbs: '170',
        targetDate: '2025-01-01',  // in the past
      })
      expect(computePreview(form)).toBeNull()
    })

    it('returns null when targetWeightLbs is missing', () => {
      const form = makeForm({
        budgetAuto: true,
        targetWeightLbs: '',
        targetDate: '2026-12-31',
      })
      expect(computePreview(form)).toBeNull()
    })

    it('returns null when targetDate is missing', () => {
      const form = makeForm({
        budgetAuto: true,
        targetWeightLbs: '170',
        targetDate: '',
      })
      expect(computePreview(form)).toBeNull()
    })

    it('foodBudget equals budget when exerciseTarget is 0', () => {
      const form = makeForm({
        budgetAuto: true,
        targetWeightLbs: '170',
        targetDate: '2026-12-31',
        exerciseTarget: '',
      })
      const p = computePreview(form)
      expect(p).not.toBeNull()
      expect(p!.foodBudget).toBe(p!.budget)
    })

    it('foodBudget adds exerciseTarget to budget', () => {
      const form = makeForm({
        budgetAuto: true,
        targetWeightLbs: '170',
        targetDate: '2026-12-31',
        exerciseTarget: '300',
      })
      const p = computePreview(form)
      expect(p).not.toBeNull()
      expect(p!.foodBudget).toBe(p!.budget + 300)
    })
  })

  describe('manual mode', () => {
    it('derives deficit and pace from manual budget', () => {
      const form = makeForm({
        budgetAuto: false,
        manualBudget: '1800',
      })
      const p = computePreview(form)
      expect(p).not.toBeNull()
      // deficit = tdee - 1800; pace = deficit / 500
      expect(p!.budget).toBe(1800)
      expect(p!.deficit).toBe(p!.tdee - 1800)
      // pace = deficit / 500; deficit is rounded so check to 2 decimal places
      expect(p!.pace * 500).toBeCloseTo(p!.deficit, 0)
    })

    it('computes goalDate when weight delta and pace direction match (loss)', () => {
      const form = makeForm({
        budgetAuto: false,
        manualBudget: '1800',   // below TDEE → positive pace (losing)
        weightLbs: '180',
        targetWeightLbs: '170', // 10 lbs to lose → goalDate should be set
      })
      const p = computePreview(form)
      expect(p).not.toBeNull()
      expect(p!.goalDate).toBeInstanceOf(Date)
      expect(p!.goalDate!.getTime()).toBeGreaterThan(FIXED_NOW)
    })

    it('returns null goalDate when no target weight is set', () => {
      const form = makeForm({
        budgetAuto: false,
        manualBudget: '1800',
        targetWeightLbs: '',
      })
      const p = computePreview(form)
      expect(p).not.toBeNull()
      expect(p!.goalDate).toBeNull()
    })

    it('returns null when budget is 0', () => {
      expect(computePreview(makeForm({ budgetAuto: false, manualBudget: '0' }))).toBeNull()
    })

    it('returns null when budget is negative', () => {
      expect(computePreview(makeForm({ budgetAuto: false, manualBudget: '-500' }))).toBeNull()
    })

    it('returns null when manualBudget is not a number', () => {
      expect(computePreview(makeForm({ budgetAuto: false, manualBudget: '' }))).toBeNull()
    })
  })
})

/* ─── autoSplitBudgets ────────────────────────────────────────────────── */

describe('autoSplitBudgets', () => {
  it('splits 2000 into 20/20/40/20 percent allocations', () => {
    expect(autoSplitBudgets(2000)).toEqual({
      breakfast: 400,
      lunch: 400,
      dinner: 800,
      snack: 400,
    })
  })

  it('rounds to integers for non-even totals', () => {
    const result = autoSplitBudgets(1999)
    expect(result.breakfast).toBe(Math.round(1999 * 0.2))
    expect(result.lunch).toBe(Math.round(1999 * 0.2))
    expect(result.dinner).toBe(Math.round(1999 * 0.4))
    expect(result.snack).toBe(Math.round(1999 * 0.2))
    // All values should be integers
    expect(Number.isInteger(result.breakfast)).toBe(true)
    expect(Number.isInteger(result.dinner)).toBe(true)
  })
})

/* ─── buildFormState ──────────────────────────────────────────────────── */

describe('buildFormState', () => {
  it('populates heightFt/In and weightLbs for US units', () => {
    const s = makeSettings({ height_cm: 180, weight_lbs: 180, units: 'us' })
    const f = buildFormState(s)
    expect(f.units).toBe('us')
    expect(f.heightCm).toBe('180')
    expect(f.heightFt).toBe('5')
    expect(f.heightIn).toBe('11')
    expect(f.weightLbs).toBe('180')
    expect(parseFloat(f.weightKg)).toBeCloseTo(81.6, 0)
  })

  it('populates heightCm and weightKg for metric units', () => {
    const s = makeSettings({ height_cm: 175, weight_lbs: 154, units: 'metric' })
    const f = buildFormState(s)
    expect(f.units).toBe('metric')
    expect(f.heightCm).toBe('175')
    expect(f.weightLbs).toBe('154')
    expect(parseFloat(f.weightKg)).toBeCloseTo(69.9, 0)
  })

  it('detects mealBudgetAuto=true when all meal values match auto-split percentages', () => {
    // 20/20/40/20 split of 2000
    const s = makeSettings({
      calorie_budget: 2000,
      breakfast_budget: 400,
      lunch_budget: 400,
      dinner_budget: 800,
      snack_budget: 400,
    })
    expect(buildFormState(s).mealBudgetAuto).toBe(true)
  })

  it('sets mealBudgetAuto=false when any meal value differs from auto-split', () => {
    const s = makeSettings({
      calorie_budget: 2000,
      breakfast_budget: 500,  // differs from auto (400)
      lunch_budget: 400,
      dinner_budget: 700,
      snack_budget: 400,
    })
    expect(buildFormState(s).mealBudgetAuto).toBe(false)
  })

  it('handles null height', () => {
    const s = makeSettings({ height_cm: null })
    const f = buildFormState(s)
    expect(f.heightCm).toBe('')
    expect(f.heightFt).toBe('')
    expect(f.heightIn).toBe('')
  })

  it('handles null weight', () => {
    const s = makeSettings({ weight_lbs: null })
    const f = buildFormState(s)
    expect(f.weightLbs).toBe('')
    expect(f.weightKg).toBe('')
  })

  it('handles null date of birth', () => {
    const s = makeSettings({ date_of_birth: null })
    expect(buildFormState(s).dateOfBirth).toBe('')
  })

  it('handles null target weight', () => {
    const s = makeSettings({ target_weight_lbs: null })
    const f = buildFormState(s)
    expect(f.targetWeightLbs).toBe('')
    expect(f.targetWeightKg).toBe('')
  })

  it('handles null target date', () => {
    const s = makeSettings({ target_date: null })
    expect(buildFormState(s).targetDate).toBe('')
  })

  it('sets exerciseTarget to empty string when value is 0', () => {
    const s = makeSettings({ exercise_target_calories: 0 })
    expect(buildFormState(s).exerciseTarget).toBe('')
  })

  it('sets exerciseTarget when value is non-zero', () => {
    const s = makeSettings({ exercise_target_calories: 300 })
    expect(buildFormState(s).exerciseTarget).toBe('300')
  })
})

/* ─── Unit conversion helpers ─────────────────────────────────────────── */

describe('cmToFtIn', () => {
  it('converts 180 cm to 5 ft 11 in', () => {
    expect(cmToFtIn(180)).toEqual({ ft: 5, inches: 11 })
  })

  it('converts 152.4 cm (exactly 5 ft 0 in)', () => {
    expect(cmToFtIn(152.4)).toEqual({ ft: 5, inches: 0 })
  })
})

describe('ftInToCm', () => {
  it('converts 5 ft 11 in to ~180.3 cm', () => {
    expect(ftInToCm(5, 11)).toBeCloseTo(180.3, 1)
  })

  it('converts 6 ft 0 in to ~182.9 cm', () => {
    expect(ftInToCm(6, 0)).toBeCloseTo(182.9, 1)
  })
})

describe('lbsToKg and kgToLbs', () => {
  it('lbsToKg: 180 lbs → ~81.6 kg', () => {
    expect(lbsToKg(180)).toBeCloseTo(81.6, 0)
  })

  it('kgToLbs: 81.6 kg → ~180 lbs', () => {
    expect(kgToLbs(81.6)).toBeCloseTo(180, 0)
  })

  it('round-trips lbs → kg → lbs within 0.2 lbs', () => {
    const original = 165.5
    expect(kgToLbs(lbsToKg(original))).toBeCloseTo(original, 0)
  })
})
