/* Date utility functions for the calorie log.
   All functions work in local time (not UTC) to avoid date shifts for users
   east of UTC — toISOString() returns UTC and would show the wrong date. */

// todayString returns today's date as "YYYY-MM-DD" in local time.
export function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// getMondayOf returns the Monday of the week containing the given YYYY-MM-DD date.
export function getMondayOf(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// shiftWeek returns a Monday YYYY-MM-DD shifted by offsetWeeks (±).
export function shiftWeek(mondayStr: string, offsetWeeks: number): string {
  const d = new Date(mondayStr + 'T00:00:00')
  d.setDate(d.getDate() + offsetWeeks * 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// formatWeekRange formats "Feb 9 – Feb 15" from a Monday YYYY-MM-DD string.
export function formatWeekRange(mondayStr: string): string {
  const start = new Date(mondayStr + 'T00:00:00')
  const end = new Date(mondayStr + 'T00:00:00')
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

// dayLabel returns the 3-letter weekday abbreviation for a YYYY-MM-DD string.
export function dayLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
}

// dayNumber returns the day-of-month number for a YYYY-MM-DD string.
export function dayNumber(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDate()
}
