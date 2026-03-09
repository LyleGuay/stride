// progressGrouping.ts — pure functions for bucketing WeekDaySummary rows into
// chart bars for the Progress tab. Grouping modes:
//   month:     one bar per calendar day (30 bars)
//   6months:   one bar per ISO week    (26 bars)
//   ytd:       one bar per month, Jan–Dec of the current year (12 bars)
//   lastyear:  one bar per month, rolling last 12 calendar months (12 bars)
//   all:       one bar per year
// Extracted here so they can be unit-tested independently of the component.

import type { WeekDaySummary, WeightEntry } from '../types'
import { todayString } from './dates'

/* ─── Types ─────────────────────────────────────────────────────────────── */

// ProgressRange identifies the five range presets on the Progress tab.
// Determines both the date window (getRangeDates) and bar grouping (groupDays).
export type ProgressRange = 'month' | '6months' | 'ytd' | 'lastyear' | 'all'

// Maps each ProgressRange to its compact pill label used in the sub-header.
export const RANGE_LABELS: Record<ProgressRange, string> = {
  month: '1M',
  '6months': '6M',
  ytd: 'YTD',
  lastyear: '1Y',
  all: 'All',
}

/* ─── ChartBar ──────────────────────────────────────────────────────────── */

// ChartBar represents one bar in the Progress tab calorie chart.
// For 'month':              one bar per calendar day.
// For '6months':            one bar per ISO week.
// For 'ytd'/'lastyear':    one bar per calendar month (12 bars).
// For 'all':               one bar per calendar year.
export interface ChartBar {
  label: string         // Display label: "15", "Wk 3", "Jan", "Jan '25", or "2024"
  totalFood: number
  totalExercise: number
  netCalories: number
  budget: number        // Sum of calorie_budget for tracked days in this bucket
  trackedDays: number   // Days in this bucket that have logged data
  totalDays: number     // Total calendar days in this bucket
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// addDay advances a YYYY-MM-DD string by one calendar day.
function addDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// getISOWeek returns the ISO week number (1-53) for a YYYY-MM-DD string.
// ISO weeks start on Monday; the Thursday of a week determines its year.
function getISOWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z')
  // Advance to Thursday of this week so the year calculation is unambiguous
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// getISOWeekYear returns the year that "owns" an ISO week (differs from the calendar
// year for the first/last few days of January/December).
function getISOWeekYear(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  return d.getUTCFullYear()
}

// daysInYear returns 365 or 366 depending on whether the year is a leap year.
function daysInYear(year: number): number {
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365
}

// getMonthFirstDays returns an array of "YYYY-MM-01" strings for every calendar
// month from start's month through end's month (inclusive).
function getMonthFirstDays(start: string, end: string): string[] {
  const dates: string[] = []
  let y = parseInt(start.slice(0, 4), 10)
  let m = parseInt(start.slice(5, 7), 10)
  const endY = parseInt(end.slice(0, 4), 10)
  const endM = parseInt(end.slice(5, 7), 10)
  while (y < endY || (y === endY && m <= endM)) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return dates
}

/* ─── Public API ────────────────────────────────────────────────────────── */

/* ─── getRangeDates ──────────────────────────────────────────────────────── */

// getRangeDates returns start/end YYYY-MM-DD strings for a given range preset.
// - 'month':    first → last day of the current calendar month (always a full month)
// - '6months':  6 calendar months ago → today
// - 'ytd':      Jan 1 of the current year → today
// - 'lastyear': 365 days ago → today
// - 'all':      earliestDate (or '2020-01-01' if absent) → today
//
// 'month' uses the full calendar month so the bar chart always has 28–31 bars,
// even on the 1st of the month. Future days appear as empty (no-data) bars.
export function getRangeDates(
  range: ProgressRange,
  earliestDate?: string | null,
): { start: string; end: string } {
  const today = todayString()
  if (range === 'month') {
    const y  = today.slice(0, 4)
    const mm = today.slice(5, 7)
    // Last day of the current month: day 0 of next month == last day of this month
    const lastDay = new Date(parseInt(y, 10), parseInt(mm, 10), 0).getDate()
    return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` }
  }
  if (range === '6months') {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() - 6)
    return { start: d.toISOString().slice(0, 10), end: today }
  }
  if (range === 'ytd')  return { start: today.slice(0, 4) + '-01-01', end: today }
  if (range === 'lastyear') {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 365)
    return { start: d.toISOString().slice(0, 10), end: today }
  }
  return { start: earliestDate ?? '2020-01-01', end: today }  // 'all'
}

/* ─── groupDays ─────────────────────────────────────────────────────────── */

// groupDays converts WeekDaySummary rows from the API into chart bars.
// days contains only dates with logged data; calendar gaps are filled with
// empty bars so the chart always covers the full selected range.
export function groupDays(
  days: WeekDaySummary[],
  range: ProgressRange,
  start: string,
  end: string,
): ChartBar[] {
  if (range === 'month')    return groupByDay(days, start, end)
  if (range === '6months')  return groupByISOWeek(days, start, end)
  if (range === 'ytd') {
    // 12 monthly slots: Jan–Dec of the current year. Future months are empty.
    // The calorie data only covers Jan 1 to today, but we extend the slot
    // window to Dec 31 so all 12 buckets are always rendered.
    const yearEnd = start.slice(0, 4) + '-12-31'
    return groupByMonth(days, start, yearEnd)
  }
  if (range === 'lastyear') {
    // 12 rolling monthly slots: first of the month 11 months before 'end' through
    // the last day of 'end's month. The API fetch (365 days) covers this window.
    const endDate = new Date(end + 'T00:00:00Z')
    const rollingStart = new Date(endDate)
    rollingStart.setUTCMonth(rollingStart.getUTCMonth() - 11)
    rollingStart.setUTCDate(1)
    const monthStart = rollingStart.toISOString().slice(0, 10)
    const endYear  = parseInt(end.slice(0, 4), 10)
    const endMonth = parseInt(end.slice(5, 7), 10)
    const lastDayNum = new Date(endYear, endMonth, 0).getDate()
    const monthEnd = `${end.slice(0, 7)}-${String(lastDayNum).padStart(2, '0')}`
    return groupByMonth(days, monthStart, monthEnd)
  }
  return groupByYear(days, start, end)  // 'all'
}

/* ─── getSlotDates ───────────────────────────────────────────────────────── */

// getSlotDates returns one representative date per calorie-chart slot for the
// given range and window. Used to position the weight chart's x-axis so both
// charts share the same x-granularity.
//
// Returned dates mirror the first day of each bucket used by groupDays:
//   month:    each calendar day in [start, end]
//   6months:  first calendar day of each ISO week in [start, end]
//   ytd:      1st of each month Jan–Dec (same year as start)
//   lastyear: 1st of each of the 12 rolling months
//   all:      Jan 1 of each year in [start, end]
export function getSlotDates(range: ProgressRange, start: string, end: string): string[] {
  if (range === 'month') {
    const dates: string[] = []
    let cur = start
    while (cur <= end) { dates.push(cur); cur = addDay(cur) }
    return dates
  }

  if (range === '6months') {
    // Walk day-by-day and collect the first date seen for each ISO week key —
    // that first date is the representative "slot date" for that week.
    const keyOrder: string[] = []
    const keyToDate = new Map<string, string>()
    let cur = start
    while (cur <= end) {
      const week     = getISOWeek(cur)
      const weekYear = getISOWeekYear(cur)
      const key      = `${weekYear}-W${String(week).padStart(2, '0')}`
      if (!keyToDate.has(key)) { keyOrder.push(key); keyToDate.set(key, cur) }
      cur = addDay(cur)
    }
    return keyOrder.map(k => keyToDate.get(k)!)
  }

  if (range === 'ytd') {
    const yearEnd = start.slice(0, 4) + '-12-31'
    return getMonthFirstDays(start, yearEnd)
  }

  if (range === 'lastyear') {
    // Mirror the 12-month rolling window computed in groupDays
    const endDate = new Date(end + 'T00:00:00Z')
    const rollingStart = new Date(endDate)
    rollingStart.setUTCMonth(rollingStart.getUTCMonth() - 11)
    rollingStart.setUTCDate(1)
    const monthStart = rollingStart.toISOString().slice(0, 10)
    const endYear  = parseInt(end.slice(0, 4), 10)
    const endMonth = parseInt(end.slice(5, 7), 10)
    const lastDayNum = new Date(endYear, endMonth, 0).getDate()
    const monthEnd = `${end.slice(0, 7)}-${String(lastDayNum).padStart(2, '0')}`
    return getMonthFirstDays(monthStart, monthEnd)
  }

  // 'all' — one slot per year
  const startYear = parseInt(start.slice(0, 4), 10)
  const endYear   = parseInt(end.slice(0, 4), 10)
  const dates: string[] = []
  for (let y = startYear; y <= endYear; y++) dates.push(`${y}-01-01`)
  return dates
}

/* ─── groupWeightToSlots ─────────────────────────────────────────────────── */

// groupWeightToSlots maps WeightEntry rows onto one value per calorie-chart slot
// so the weight line chart can be x-aligned with the calorie bars.
//
// For each slot date it returns:
//   - The exact entry weight if an entry falls on that date.
//   - A linearly interpolated value if the date falls between two known entries.
//   - null if the date falls before the first entry or after the last entry
//     (no extrapolation beyond the known data range).
//
// entries may include entries before slotDates[0] — they act as left anchors
// for interpolation (e.g. a pre-month weight entry anchors the 1M chart start).
export function groupWeightToSlots(
  entries: WeightEntry[],
  slotDates: string[],
): (number | null)[] {
  if (entries.length === 0 || slotDates.length === 0) return slotDates.map(() => null)

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const firstDate = sorted[0].date
  const lastDate  = sorted[sorted.length - 1].date

  return slotDates.map(slotDate => {
    // Outside the known range — do not extrapolate
    if (slotDate < firstDate || slotDate > lastDate) return null

    // Exact match
    const exact = sorted.find(e => e.date === slotDate)
    if (exact) return exact.weight_lbs

    // Find the nearest entries before and after the slot date for interpolation
    let prev: WeightEntry | null = null
    let next: WeightEntry | null = null
    for (const e of sorted) {
      if (e.date < slotDate) prev = e
      else if (e.date > slotDate && next === null) next = e
    }
    if (!prev || !next) return null

    const t1 = new Date(prev.date + 'T00:00:00Z').getTime()
    const t2 = new Date(next.date + 'T00:00:00Z').getTime()
    const ts = new Date(slotDate + 'T00:00:00Z').getTime()
    const ratio = (ts - t1) / (t2 - t1)
    return prev.weight_lbs + ratio * (next.weight_lbs - prev.weight_lbs)
  })
}

/* ─── Day grouping (month range) ────────────────────────────────────────── */

// groupByDay — one bar per calendar day. Missing days in the API response
// (no log entries) produce bars with trackedDays=0 and zero calorie values.
function groupByDay(days: WeekDaySummary[], start: string, end: string): ChartBar[] {
  const dayMap = new Map<string, WeekDaySummary>(days.map(d => [d.date, d]))
  const bars: ChartBar[] = []

  let cur = start
  while (cur <= end) {
    const day = dayMap.get(cur)
    const d = new Date(cur + 'T00:00:00Z')
    bars.push({
      label: String(d.getUTCDate()),
      totalFood:      day?.calories_food     ?? 0,
      totalExercise:  day?.calories_exercise  ?? 0,
      netCalories:    day?.net_calories       ?? 0,
      budget:         day?.calorie_budget     ?? 0,
      trackedDays:    day ? 1 : 0,
      totalDays:      1,
    })
    cur = addDay(cur)
  }
  return bars
}

/* ─── ISO-week grouping (6M range) ──────────────────────────────────────── */

// groupByISOWeek — one bar per ISO week. Empty weeks produce bars with
// trackedDays=0. The label is "Wk N" where N is the ISO week number.
function groupByISOWeek(days: WeekDaySummary[], start: string, end: string): ChartBar[] {
  const barMap = new Map<string, ChartBar>()
  const keyOrder: string[] = []

  // Walk every day in range to create all week buckets (including empty ones)
  let cur = start
  while (cur <= end) {
    const week     = getISOWeek(cur)
    const weekYear = getISOWeekYear(cur)
    const key      = `${weekYear}-W${String(week).padStart(2, '0')}`
    if (!barMap.has(key)) {
      keyOrder.push(key)
      barMap.set(key, { label: `Wk ${week}`, totalFood: 0, totalExercise: 0, netCalories: 0, budget: 0, trackedDays: 0, totalDays: 0 })
    }
    barMap.get(key)!.totalDays++
    cur = addDay(cur)
  }

  // Accumulate data from days that have logged entries
  for (const day of days) {
    const week     = getISOWeek(day.date)
    const weekYear = getISOWeekYear(day.date)
    const key      = `${weekYear}-W${String(week).padStart(2, '0')}`
    const bar = barMap.get(key)
    if (!bar) continue  // day is outside the start/end range
    bar.totalFood      += day.calories_food
    bar.totalExercise  += day.calories_exercise
    bar.netCalories    += day.net_calories
    bar.budget         += day.calorie_budget
    bar.trackedDays++
  }

  return keyOrder.map(k => barMap.get(k)!)
}

/* ─── Month grouping (ytd / lastyear ranges) ────────────────────────────── */

// groupByMonth — one bar per calendar month. When the range spans multiple years,
// labels include a 2-digit year suffix ("Jan '25") to disambiguate.
function groupByMonth(days: WeekDaySummary[], start: string, end: string): ChartBar[] {
  const startYear = parseInt(start.slice(0, 4), 10)
  const endYear   = parseInt(end.slice(0, 4), 10)
  const multiYear = startYear !== endYear

  const barMap = new Map<string, ChartBar>()
  const keyOrder: string[] = []

  // Walk every day in range to build month buckets (including months with no data)
  let cur = start
  while (cur <= end) {
    const year  = parseInt(cur.slice(0, 4), 10)
    const month = parseInt(cur.slice(5, 7), 10)  // 1-based
    const key   = `${year}-${String(month).padStart(2, '0')}`
    if (!barMap.has(key)) {
      keyOrder.push(key)
      const label = multiYear
        ? `${MONTH_LABELS[month - 1]} '${String(year).slice(2)}`
        : MONTH_LABELS[month - 1]
      barMap.set(key, { label, totalFood: 0, totalExercise: 0, netCalories: 0, budget: 0, trackedDays: 0, totalDays: 0 })
    }
    barMap.get(key)!.totalDays++
    cur = addDay(cur)
  }

  // Accumulate data from days that have logged entries
  for (const day of days) {
    const key = day.date.slice(0, 7)  // "YYYY-MM"
    const bar = barMap.get(key)
    if (!bar) continue  // day is outside the start/end range
    bar.totalFood      += day.calories_food
    bar.totalExercise  += day.calories_exercise
    bar.netCalories    += day.net_calories
    bar.budget         += day.calorie_budget
    bar.trackedDays++
  }

  return keyOrder.map(k => barMap.get(k)!)
}

/* ─── Year grouping (all-time range) ─────────────────────────────────────── */

// groupByYear — one bar per calendar year. Empty years produce bars with
// trackedDays=0. The label is the 4-digit year string ("2024").
function groupByYear(days: WeekDaySummary[], start: string, end: string): ChartBar[] {
  const startYear = parseInt(start.slice(0, 4), 10)
  const endYear   = parseInt(end.slice(0, 4), 10)

  const bars: ChartBar[] = []
  for (let year = startYear; year <= endYear; year++) {
    const yearStr  = String(year)
    const yearDays = days.filter(d => d.date.slice(0, 4) === yearStr)
    bars.push({
      label:         yearStr,
      totalFood:     yearDays.reduce((s, d) => s + d.calories_food,     0),
      totalExercise: yearDays.reduce((s, d) => s + d.calories_exercise, 0),
      netCalories:   yearDays.reduce((s, d) => s + d.net_calories,      0),
      budget:        yearDays.reduce((s, d) => s + d.calorie_budget,    0),
      trackedDays:   yearDays.length,
      totalDays:     daysInYear(year),
    })
  }
  return bars
}
