import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { groupDays, getRangeDates } from './progressGrouping'
import type { WeekDaySummary } from '../types'

/* ─── Helpers ────────────────────────────────────────────────────────────── */

// Build a minimal WeekDaySummary for a given date.
function makeDay(date: string, overrides: Partial<WeekDaySummary> = {}): WeekDaySummary {
  return {
    date,
    calorie_budget: 2000,
    calories_food: 1500,
    calories_exercise: 200,
    net_calories: 1300,
    calories_left: 700,
    protein_g: 80,
    carbs_g: 150,
    fat_g: 50,
    has_data: true,
    ...overrides,
  }
}

// Pin "today" so date-based tests are deterministic.
// March 1, 2026 — matches the project's current date.
const FIXED_NOW = new Date('2026-03-01T12:00:00Z').getTime()

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW) })
afterEach(() => { vi.useRealTimers() })

/* ─── groupDays: month range ─────────────────────────────────────────────── */

describe('groupDays — month range', () => {
  it('produces one bar per calendar day', () => {
    const bars = groupDays([], 'month', '2026-03-01', '2026-03-31')
    expect(bars).toHaveLength(31)
  })

  it('labels bars with the day-of-month number', () => {
    const bars = groupDays([], 'month', '2026-03-01', '2026-03-05')
    expect(bars.map(b => b.label)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('fills missing days with trackedDays=0 and zero calorie values', () => {
    const days = [makeDay('2026-03-03')]
    const bars = groupDays(days, 'month', '2026-03-01', '2026-03-05')

    // Only the 3rd has data
    expect(bars[0].trackedDays).toBe(0)  // Mar 1
    expect(bars[1].trackedDays).toBe(0)  // Mar 2
    expect(bars[2].trackedDays).toBe(1)  // Mar 3
    expect(bars[3].trackedDays).toBe(0)  // Mar 4
    expect(bars[4].trackedDays).toBe(0)  // Mar 5

    // Missing days have zero calories
    expect(bars[0].netCalories).toBe(0)
    expect(bars[0].totalFood).toBe(0)
    expect(bars[0].budget).toBe(0)
  })

  it('populates calorie fields from the matching API day', () => {
    const day = makeDay('2026-03-15', { calories_food: 1800, calories_exercise: 300, net_calories: 1500, calorie_budget: 2000 })
    const bars = groupDays([day], 'month', '2026-03-01', '2026-03-31')
    const bar = bars[14]  // index 14 = March 15 (0-indexed)
    expect(bar.totalFood).toBe(1800)
    expect(bar.totalExercise).toBe(300)
    expect(bar.netCalories).toBe(1500)
    expect(bar.budget).toBe(2000)
    expect(bar.trackedDays).toBe(1)
    expect(bar.totalDays).toBe(1)
  })

  it('every bar has totalDays=1', () => {
    const bars = groupDays([], 'month', '2026-03-01', '2026-03-10')
    expect(bars.every(b => b.totalDays === 1)).toBe(true)
  })
})

/* ─── groupDays: ytd range ───────────────────────────────────────────────── */

describe('groupDays — ytd range', () => {
  it('produces approximately 52-53 week bars for a full year', () => {
    const bars = groupDays([], 'ytd', '2026-01-01', '2026-12-31')
    // ISO 2026 has 52 weeks, but the year spans parts of week 53/1 at the edges
    expect(bars.length).toBeGreaterThanOrEqual(52)
    expect(bars.length).toBeLessThanOrEqual(54)
  })

  it('labels week bars with "Wk N"', () => {
    const bars = groupDays([], 'ytd', '2026-01-01', '2026-01-31')
    for (const bar of bars) {
      expect(bar.label).toMatch(/^Wk \d+$/)
    }
  })

  it('sums food and exercise from all days in a week', () => {
    // Week 10 of 2026: March 2–8
    const days = [
      makeDay('2026-03-02', { calories_food: 1000, calories_exercise: 100, net_calories: 900, calorie_budget: 2000 }),
      makeDay('2026-03-03', { calories_food: 1200, calories_exercise: 200, net_calories: 1000, calorie_budget: 2000 }),
      makeDay('2026-03-04', { calories_food: 800,  calories_exercise: 0,   net_calories: 800,  calorie_budget: 2000 }),
    ]
    const bars = groupDays(days, 'ytd', '2026-01-01', '2026-12-31')
    // Find the bar that covers week 10 (Mar 2–8 is week 10 in ISO 2026)
    const wk10 = bars.find(b => b.label === 'Wk 10')
    expect(wk10).toBeDefined()
    expect(wk10!.totalFood).toBe(3000)
    expect(wk10!.totalExercise).toBe(300)
    expect(wk10!.netCalories).toBe(2700)
    expect(wk10!.trackedDays).toBe(3)
    expect(wk10!.budget).toBe(6000)  // 2000 × 3 tracked days
  })

  it('produces bars with trackedDays=0 for empty weeks', () => {
    const bars = groupDays([], 'ytd', '2026-01-01', '2026-12-31')
    for (const bar of bars) {
      expect(bar.trackedDays).toBe(0)
      expect(bar.netCalories).toBe(0)
    }
  })

  it('each week bar totalDays reflects actual calendar days in range', () => {
    // A full year — most weeks have 7 days; first/last may have fewer
    const bars = groupDays([], 'ytd', '2026-01-01', '2026-12-31')
    const totalDays = bars.reduce((s, b) => s + b.totalDays, 0)
    expect(totalDays).toBe(365)  // 2026 is not a leap year
  })
})

/* ─── groupDays: all-time range ─────────────────────────────────────────── */

describe('groupDays — all-time range', () => {
  it('produces one bar per calendar month', () => {
    const bars = groupDays([], 'all', '2026-01-01', '2026-12-31')
    expect(bars).toHaveLength(12)
  })

  it('uses short month names as labels for single-year ranges', () => {
    const bars = groupDays([], 'all', '2026-01-01', '2026-06-30')
    expect(bars.map(b => b.label)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'])
  })

  it('adds year suffix to labels when range spans multiple years', () => {
    const bars = groupDays([], 'all', '2025-11-01', '2026-02-28')
    expect(bars.map(b => b.label)).toEqual(["Nov '25", "Dec '25", "Jan '26", "Feb '26"])
  })

  it('sums food and exercise from all days in a month', () => {
    const days = [
      makeDay('2026-01-10', { calories_food: 1500, calories_exercise: 100, net_calories: 1400, calorie_budget: 2000 }),
      makeDay('2026-01-20', { calories_food: 1800, calories_exercise: 200, net_calories: 1600, calorie_budget: 2000 }),
    ]
    const bars = groupDays(days, 'all', '2026-01-01', '2026-03-31')
    const jan = bars.find(b => b.label === 'Jan')
    expect(jan).toBeDefined()
    expect(jan!.totalFood).toBe(3300)
    expect(jan!.totalExercise).toBe(300)
    expect(jan!.netCalories).toBe(3000)
    expect(jan!.trackedDays).toBe(2)
    expect(jan!.budget).toBe(4000)  // 2000 × 2 tracked days
  })

  it('produces bars with trackedDays=0 and netCalories=0 for empty months', () => {
    // Only Jan has data; Feb and Mar are empty
    const days = [makeDay('2026-01-15')]
    const bars = groupDays(days, 'all', '2026-01-01', '2026-03-31')
    const feb = bars.find(b => b.label === 'Feb')
    const mar = bars.find(b => b.label === 'Mar')
    expect(feb!.trackedDays).toBe(0)
    expect(feb!.netCalories).toBe(0)
    expect(mar!.trackedDays).toBe(0)
    expect(mar!.netCalories).toBe(0)
  })

  it('each month bar totalDays reflects the number of calendar days in that month', () => {
    const bars = groupDays([], 'all', '2026-01-01', '2026-03-31')
    expect(bars[0].totalDays).toBe(31)  // January
    expect(bars[1].totalDays).toBe(28)  // February 2026 (not a leap year)
    expect(bars[2].totalDays).toBe(31)  // March
  })
})

/* ─── getRangeDates ──────────────────────────────────────────────────────── */

describe('getRangeDates', () => {
  it("'month' returns the full calendar month (first to last day)", () => {
    const { start, end } = getRangeDates('month')
    expect(start).toBe('2026-03-01')  // first day of March 2026
    expect(end).toBe('2026-03-31')    // last day of March 2026
  })

  it("'6months' returns 6 calendar months ago through today", () => {
    const { start, end } = getRangeDates('6months')
    expect(start).toBe('2025-09-01')  // 6 months before March 2026
    expect(end).toBe('2026-03-01')
  })

  it("'ytd' returns Jan 1 of the current year through today", () => {
    const { start, end } = getRangeDates('ytd')
    expect(start).toBe('2026-01-01')
    expect(end).toBe('2026-03-01')
  })

  it("'lastyear' returns 365 days ago through today", () => {
    const { start, end } = getRangeDates('lastyear')
    expect(start).toBe('2025-03-01')  // 365 days before March 1, 2026
    expect(end).toBe('2026-03-01')
  })

  it("'all' returns '2020-01-01' through today when no earliestDate is provided", () => {
    const { start, end } = getRangeDates('all')
    expect(start).toBe('2020-01-01')
    expect(end).toBe('2026-03-01')
  })

  it("'all' uses the provided earliestDate as start", () => {
    const { start } = getRangeDates('all', '2024-06-15')
    expect(start).toBe('2024-06-15')
  })

  it("'all' falls back to '2020-01-01' when earliestDate is null", () => {
    const { start } = getRangeDates('all', null)
    expect(start).toBe('2020-01-01')
  })

  it('all returned dates are valid YYYY-MM-DD strings', () => {
    const isoPattern = /^\d{4}-\d{2}-\d{2}$/
    for (const range of ['month', '6months', 'ytd', 'lastyear', 'all'] as const) {
      const { start, end } = getRangeDates(range)
      expect(start).toMatch(isoPattern)
      expect(end).toMatch(isoPattern)
    }
  })
})
