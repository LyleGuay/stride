// progressGrouping.ts — pure functions for bucketing WeekDaySummary rows into
// chart bars for the Progress tab. Three modes: day (month range), ISO-week
// (year range), and calendar-month (all-time range). Extracted here so they
// can be unit-tested independently of the component.

import type { WeekDaySummary } from '../types'
import { todayString } from './dates'

/* ─── ChartBar ──────────────────────────────────────────────────────────── */

// ChartBar represents one bar in the Progress tab calorie chart.
// For 'month': one bar per calendar day.
// For 'year':  one bar per ISO week (~52 bars).
// For 'all':   one bar per calendar month.
export interface ChartBar {
  label: string         // Display label: "15", "Wk 3", "Jan", or "Jan '25"
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

/* ─── Public API ────────────────────────────────────────────────────────── */

/* ─── getRangeDates ──────────────────────────────────────────────────────── */

// getRangeDates returns start/end YYYY-MM-DD strings for a given range preset.
// - 'month': first → last day of the current calendar month (always a full month)
// - 'year':  Jan 1 of the current year → today
// - 'all':   earliestDate (or '2020-01-01' if absent) → today
//
// 'month' uses the full calendar month so the bar chart always has 28–31 bars,
// even on the 1st of the month. Future days appear as empty (no-data) bars.
export function getRangeDates(
  range: 'month' | 'year' | 'all',
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
  if (range === 'year')  return { start: today.slice(0, 4) + '-01-01', end: today }
  return { start: earliestDate ?? '2020-01-01', end: today }
}

/* ─── groupDays ─────────────────────────────────────────────────────────── */

// groupDays converts WeekDaySummary rows from the API into chart bars.
// days contains only dates with logged data; calendar gaps are filled with
// empty bars so the chart always covers the full selected range.
export function groupDays(
  days: WeekDaySummary[],
  range: 'month' | 'year' | 'all',
  start: string,
  end: string,
): ChartBar[] {
  if (range === 'month') return groupByDay(days, start, end)
  if (range === 'year')  return groupByISOWeek(days, start, end)
  return groupByMonth(days, start, end)
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

/* ─── ISO-week grouping (year range) ────────────────────────────────────── */

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

/* ─── Month grouping (all-time range) ───────────────────────────────────── */

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
