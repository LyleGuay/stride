import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { groupDays, getRangeDates, getSlotDates, groupWeightToSlots } from './progressGrouping'
import type { WeekDaySummary } from '../types'
import type { WeightEntry } from '../types'

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

// Build a minimal WeightEntry for testing groupWeightToSlots.
function makeWeight(date: string, weight_lbs: number): WeightEntry {
  return { id: 0, user_id: 1, date, weight_lbs, created_at: '' }
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

/* ─── groupDays: 6months range ───────────────────────────────────────────── */

describe('groupDays — 6months range', () => {
  it('produces approximately 26 ISO-week bars for a 6-month window', () => {
    const bars = groupDays([], '6months', '2025-09-01', '2026-03-01')
    // A 6-month window spans roughly 26 ISO weeks
    expect(bars.length).toBeGreaterThanOrEqual(24)
    expect(bars.length).toBeLessThanOrEqual(28)
  })

  it('labels bars with "Wk N"', () => {
    const bars = groupDays([], '6months', '2025-09-01', '2025-09-30')
    for (const bar of bars) {
      expect(bar.label).toMatch(/^Wk \d+$/)
    }
  })
})

/* ─── groupDays: ytd range ───────────────────────────────────────────────── */

describe('groupDays — ytd range', () => {
  it('produces exactly 12 monthly bars (Jan–Dec) regardless of how far into the year we are', () => {
    // Start is Jan 1; groupDays extends the slot window to Dec 31 for a full year.
    const bars = groupDays([], 'ytd', '2026-01-01', '2026-03-01')
    expect(bars).toHaveLength(12)
  })

  it('labels bars with short month names', () => {
    const bars = groupDays([], 'ytd', '2026-01-01', '2026-03-01')
    expect(bars.map(b => b.label)).toEqual([
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ])
  })

  it('months after today are empty (trackedDays=0, netCalories=0)', () => {
    // Today is 2026-03-01 — so April through December should be empty
    const days = [
      makeDay('2026-01-10', { net_calories: 1500 }),
      makeDay('2026-02-15', { net_calories: 1600 }),
    ]
    const bars = groupDays(days, 'ytd', '2026-01-01', '2026-03-01')
    // Apr (index 3) through Dec (index 11) must be empty
    for (let i = 3; i < 12; i++) {
      expect(bars[i].trackedDays).toBe(0)
      expect(bars[i].netCalories).toBe(0)
    }
  })

  it('aggregates calorie data into the correct month bucket', () => {
    const days = [
      makeDay('2026-01-10', { calories_food: 1500, calories_exercise: 100, net_calories: 1400, calorie_budget: 2000 }),
      makeDay('2026-01-20', { calories_food: 1800, calories_exercise: 200, net_calories: 1600, calorie_budget: 2000 }),
    ]
    const bars = groupDays(days, 'ytd', '2026-01-01', '2026-03-01')
    const jan = bars[0]
    expect(jan.label).toBe('Jan')
    expect(jan.totalFood).toBe(3300)
    expect(jan.totalExercise).toBe(300)
    expect(jan.netCalories).toBe(3000)
    expect(jan.trackedDays).toBe(2)
    expect(jan.budget).toBe(4000)
  })
})

/* ─── groupDays: lastyear range ──────────────────────────────────────────── */

describe('groupDays — lastyear range', () => {
  it('produces exactly 12 monthly bars (rolling last 12 months)', () => {
    // With today = 2026-03-01, the 365-days-ago start = ~2025-03-01.
    // Rolling 12 months = April 2025 through March 2026.
    const bars = groupDays([], 'lastyear', '2025-03-01', '2026-03-01')
    expect(bars).toHaveLength(12)
  })

  it('covers the rolling 12 months ending with the current month', () => {
    const bars = groupDays([], 'lastyear', '2025-03-01', '2026-03-01')
    // Last bar should be March 2026
    expect(bars[bars.length - 1].label).toBe("Mar '26")
    // First bar should be April 2025
    expect(bars[0].label).toBe("Apr '25")
  })

  it('labels include year suffix when range spans two calendar years', () => {
    const bars = groupDays([], 'lastyear', '2025-03-01', '2026-03-01')
    for (const bar of bars) {
      expect(bar.label).toMatch(/^[A-Z][a-z]{2} '\d{2}$/)
    }
  })

  it('aggregates calorie data into the correct month bucket', () => {
    const days = [
      makeDay('2025-06-10', { calories_food: 1200, net_calories: 1000, calorie_budget: 2000, calories_exercise: 200 }),
      makeDay('2025-06-20', { calories_food: 1400, net_calories: 1200, calorie_budget: 2000, calories_exercise: 200 }),
    ]
    const bars = groupDays(days, 'lastyear', '2025-03-01', '2026-03-01')
    const jun = bars.find(b => b.label === "Jun '25")
    expect(jun).toBeDefined()
    expect(jun!.totalFood).toBe(2600)
    expect(jun!.netCalories).toBe(2200)
    expect(jun!.trackedDays).toBe(2)
  })
})

/* ─── groupDays: all-time range ─────────────────────────────────────────── */

describe('groupDays — all-time range', () => {
  it('produces one bar per calendar year', () => {
    const bars = groupDays([], 'all', '2024-01-01', '2025-12-31')
    expect(bars).toHaveLength(2)
  })

  it('uses 4-digit year as label', () => {
    const bars = groupDays([], 'all', '2023-01-01', '2025-12-31')
    expect(bars.map(b => b.label)).toEqual(['2023', '2024', '2025'])
  })

  it('sums calorie data across all days in a year', () => {
    const days = [
      makeDay('2024-01-10', { calories_food: 1500, calories_exercise: 100, net_calories: 1400, calorie_budget: 2000 }),
      makeDay('2024-07-20', { calories_food: 1800, calories_exercise: 200, net_calories: 1600, calorie_budget: 2000 }),
      makeDay('2025-03-15', { calories_food: 2000, calories_exercise: 300, net_calories: 1700, calorie_budget: 2100 }),
    ]
    const bars = groupDays(days, 'all', '2024-01-01', '2025-12-31')
    const bar2024 = bars.find(b => b.label === '2024')!
    expect(bar2024.totalFood).toBe(3300)
    expect(bar2024.netCalories).toBe(3000)
    expect(bar2024.trackedDays).toBe(2)
    expect(bar2024.budget).toBe(4000)

    const bar2025 = bars.find(b => b.label === '2025')!
    expect(bar2025.totalFood).toBe(2000)
    expect(bar2025.netCalories).toBe(1700)
    expect(bar2025.trackedDays).toBe(1)
  })

  it('empty years have trackedDays=0 and netCalories=0', () => {
    const bars = groupDays([], 'all', '2023-01-01', '2025-12-31')
    for (const bar of bars) {
      expect(bar.trackedDays).toBe(0)
      expect(bar.netCalories).toBe(0)
    }
  })

  it('totalDays reflects actual days in each year (leap year aware)', () => {
    const bars = groupDays([], 'all', '2024-01-01', '2025-12-31')
    const bar2024 = bars.find(b => b.label === '2024')!
    const bar2025 = bars.find(b => b.label === '2025')!
    expect(bar2024.totalDays).toBe(366)  // 2024 is a leap year
    expect(bar2025.totalDays).toBe(365)
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

/* ─── getSlotDates ───────────────────────────────────────────────────────── */

describe('getSlotDates', () => {
  it("'month' returns one date per calendar day in the range", () => {
    const dates = getSlotDates('month', '2026-03-01', '2026-03-05')
    expect(dates).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'])
  })

  it("'ytd' returns 12 month-first-day dates (Jan–Dec)", () => {
    const dates = getSlotDates('ytd', '2026-01-01', '2026-03-01')
    expect(dates).toHaveLength(12)
    expect(dates[0]).toBe('2026-01-01')
    expect(dates[11]).toBe('2026-12-01')
  })

  it("'lastyear' returns 12 month-first-day dates for the rolling window", () => {
    const dates = getSlotDates('lastyear', '2025-03-01', '2026-03-01')
    expect(dates).toHaveLength(12)
    expect(dates[0]).toBe('2025-04-01')  // first of month 11 months before Mar 2026
    expect(dates[11]).toBe('2026-03-01')
  })

  it("'all' returns Jan 1 of each year between start and end", () => {
    const dates = getSlotDates('all', '2023-06-15', '2025-11-30')
    expect(dates).toEqual(['2023-01-01', '2024-01-01', '2025-01-01'])
  })

  it("'6months' returns one date per ISO week (first day of each week)", () => {
    const dates = getSlotDates('6months', '2026-01-01', '2026-01-31')
    // January 2026 spans 5 ISO weeks; each returned date is the first day of that week in range
    expect(dates.length).toBeGreaterThanOrEqual(4)
    expect(dates.length).toBeLessThanOrEqual(6)
    // Each date should be a valid YYYY-MM-DD string
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

/* ─── groupWeightToSlots ─────────────────────────────────────────────────── */

describe('groupWeightToSlots', () => {
  it('returns all nulls when entries is empty', () => {
    const slots = groupWeightToSlots([], ['2026-03-01', '2026-03-02', '2026-03-03'])
    expect(slots).toEqual([null, null, null])
  })

  it('returns all nulls when slotDates is empty', () => {
    const slots = groupWeightToSlots([makeWeight('2026-03-01', 180)], [])
    expect(slots).toEqual([])
  })

  it('uses exact entry weight when slot date matches an entry', () => {
    const entries = [makeWeight('2026-03-01', 180), makeWeight('2026-03-05', 178)]
    const slots = groupWeightToSlots(entries, ['2026-03-01', '2026-03-05'])
    expect(slots[0]).toBe(180)
    expect(slots[1]).toBe(178)
  })

  it('linearly interpolates between two surrounding entries', () => {
    // Day 1 = 180lbs, Day 11 = 170lbs → day 6 should be 175lbs (halfway)
    const entries = [makeWeight('2026-03-01', 180), makeWeight('2026-03-11', 170)]
    const slots = groupWeightToSlots(entries, ['2026-03-06'])
    expect(slots[0]).toBeCloseTo(175, 1)
  })

  it('interpolates correctly across multiple intermediate slots', () => {
    // 3 entries spanning 10 daily slots: day1=200, day5=180, day10=160
    const entries = [
      makeWeight('2026-03-01', 200),
      makeWeight('2026-03-05', 180),
      makeWeight('2026-03-10', 160),
    ]
    const slotDates = [
      '2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05',
      '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10',
    ]
    const slots = groupWeightToSlots(entries, slotDates)

    // Exact matches
    expect(slots[0]).toBe(200)  // Mar 1
    expect(slots[4]).toBe(180)  // Mar 5
    expect(slots[9]).toBe(160)  // Mar 10

    // Interpolated: Mar 3 is 2/4 of the way from Mar 1 to Mar 5 → 200 - 2/4*20 = 190
    expect(slots[2]).toBeCloseTo(190, 1)
  })

  it('does not extrapolate before the first known entry (returns null)', () => {
    const entries = [makeWeight('2026-03-05', 180), makeWeight('2026-03-10', 175)]
    const slots = groupWeightToSlots(entries, ['2026-03-01', '2026-03-05'])
    expect(slots[0]).toBeNull()   // Mar 1 is before the first entry
    expect(slots[1]).toBe(180)    // Mar 5 is an exact match
  })

  it('does not extrapolate after the last known entry (returns null)', () => {
    const entries = [makeWeight('2026-03-01', 180), makeWeight('2026-03-05', 175)]
    const slots = groupWeightToSlots(entries, ['2026-03-05', '2026-03-10'])
    expect(slots[0]).toBe(175)    // Mar 5 is an exact match
    expect(slots[1]).toBeNull()   // Mar 10 is after the last entry
  })

  it('uses a pre-range entry as a left anchor for interpolation', () => {
    // Entry from Feb 20 acts as anchor for March slots
    const entries = [makeWeight('2026-02-20', 182), makeWeight('2026-03-10', 178)]
    // Slot for Mar 1 falls between the two entries → should be interpolated, not null
    const slots = groupWeightToSlots(entries, ['2026-03-01'])
    expect(slots[0]).not.toBeNull()
    // Feb 20 to Mar 10 = 18 days; Mar 1 is 9 days in → midpoint → 180lbs
    expect(slots[0]).toBeCloseTo(180, 0)
  })

  it('returns a single value for a single entry on an exact date', () => {
    const entries = [makeWeight('2026-03-15', 177.5)]
    const slots = groupWeightToSlots(entries, ['2026-03-15'])
    expect(slots[0]).toBe(177.5)
  })

  it('returns all nulls when all slot dates fall outside the entry range', () => {
    const entries = [makeWeight('2026-06-01', 175), makeWeight('2026-06-30', 170)]
    const slots = groupWeightToSlots(entries, ['2026-03-01', '2026-03-15', '2026-03-31'])
    expect(slots).toEqual([null, null, null])
  })
})
