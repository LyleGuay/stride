// JournalDatePicker — calendar popover for the journal daily date picker.
// Shows a month grid (Mon–Sun columns) with mood-colored dots for days that
// have entries. Dot color encodes the day's average mental-state score:
//   green-400 (≥ 4), violet-400 (2–3), red-400 (≤ 1), gray-300 (entries but no score tag).
// Future dates are grayed out and not tappable. Tapping a valid day calls
// onSelect then onClose so the parent can close the popover.

import { useState, useEffect } from 'react'
import type { JournalCalendarDay } from '../../types'

interface Props {
  selectedDate: string                                             // YYYY-MM-DD
  onSelect: (date: string) => void
  onClose: () => void
  loadMonth: (month: string) => void                              // from useJournalCalendar
  getMonthData: (month: string) => JournalCalendarDay[] | null   // returns cache or null
  isLoadingMonth: (month: string) => boolean
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Returns the dot background color for a given avg_score.
function dotColor(avgScore: number | null): string {
  if (avgScore === null) return '#d1d5db'  // gray-300 — entries but no emotion tags
  if (avgScore >= 4) return '#4ade80'      // green-400
  if (avgScore >= 2) return '#a78bfa'      // violet-400
  return '#f87171'                          // red-400
}

// toYMD formats a Date to YYYY-MM-DD using local date components.
// Avoids UTC conversion issues from toISOString().
function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// buildGrid returns a 2D array of Dates for a Mon–Sun month grid.
// Slots outside the current month are null so the layout is correct but the
// cells are left blank.
function buildGrid(year: number, jsMonth: number): (Date | null)[][] {
  const firstDay = new Date(year, jsMonth, 1)
  const lastDay = new Date(year, jsMonth + 1, 0)

  // Number of days to step back from the 1st to reach the preceding Monday.
  // getDay() returns 0=Sun, 1=Mon, …, 6=Sat.
  const startDow = firstDay.getDay()
  const backDays = startDow === 0 ? 6 : startDow - 1

  // Number of days to extend past the last day to reach the following Sunday.
  const endDow = lastDay.getDay()
  const fwdDays = endDow === 0 ? 0 : 7 - endDow

  const start = new Date(firstDay)
  start.setDate(start.getDate() - backDays)
  const end = new Date(lastDay)
  end.setDate(end.getDate() + fwdDays)

  const grid: (Date | null)[][] = []
  const cursor = new Date(start)

  while (cursor <= end) {
    const week: (Date | null)[] = []
    for (let i = 0; i < 7; i++) {
      const inMonth = cursor.getMonth() === jsMonth && cursor.getFullYear() === year
      week.push(inMonth ? new Date(cursor) : null)
      cursor.setDate(cursor.getDate() + 1)
    }
    grid.push(week)
  }
  return grid
}

// shiftMonth returns a new YYYY-MM string offset by delta months.
function shiftMonth(yyyyMM: string, delta: number): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function JournalDatePicker({
  selectedDate,
  onSelect,
  onClose,
  loadMonth,
  getMonthData,
  isLoadingMonth,
}: Props) {
  // displayMonth always stays at or before today's month — users can navigate
  // forward up to the current month but not into the future.
  const [displayMonth, setDisplayMonth] = useState(selectedDate.slice(0, 7))

  const today = toYMD(new Date())
  const currentMonth = today.slice(0, 7)

  const [yearStr, monthStr] = displayMonth.split('-')
  const year = Number(yearStr)
  const jsMonth = Number(monthStr) - 1  // 0-based for Date constructor

  // Load data whenever the displayed month changes.
  useEffect(() => {
    loadMonth(displayMonth)
  }, [displayMonth, loadMonth])

  // Build a lookup map so each day cell can find its data in O(1).
  const calendarData = getMonthData(displayMonth)
  const dayMap = new Map<string, JournalCalendarDay>()
  if (calendarData) {
    for (const day of calendarData) dayMap.set(day.date, day)
  }

  const grid = buildGrid(year, jsMonth)
  const monthLabel = new Date(year, jsMonth, 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })

  const handleDayClick = (dateStr: string) => {
    if (dateStr > today) return
    onSelect(dateStr)
    onClose()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-4 w-[272px]">

      {/* ── Month navigation ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setDisplayMonth(shiftMonth(displayMonth, -1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Previous month"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
        <button
          onClick={() => setDisplayMonth(shiftMonth(displayMonth, 1))}
          disabled={displayMonth >= currentMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-default"
          aria-label="Next month"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* ── Day-of-week headers ───────────────────────────────────────── */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map(h => (
          <div key={h} className="text-center text-[10px] font-medium text-gray-400">{h}</div>
        ))}
      </div>

      {/* ── Day grid ──────────────────────────────────────────────────── */}
      {isLoadingMonth(displayMonth) && !calendarData ? (
        <div className="h-[136px] flex items-center justify-center text-xs text-gray-400">
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-y-1">
          {grid.map((week, wi) =>
            week.map((date, di) => {
              // Blank slot — outside the current month
              if (!date) return <div key={`blank-${wi}-${di}`} className="h-8" />

              const dateStr = toYMD(date)
              const dayData = dayMap.get(dateStr)
              const isFuture = dateStr > today
              const isSelected = dateStr === selectedDate
              const isToday = dateStr === today

              return (
                <button
                  key={dateStr}
                  onClick={() => handleDayClick(dateStr)}
                  disabled={isFuture}
                  className={`relative flex flex-col items-center justify-center h-8 rounded-lg transition-colors
                    ${isFuture ? 'cursor-default' : 'hover:bg-gray-50 cursor-pointer'}
                    ${isSelected ? 'ring-2 ring-indigo-500 ring-inset' : ''}
                    ${isToday && !isSelected ? 'ring-1 ring-gray-300 ring-inset' : ''}
                  `}
                >
                  <span className={`text-xs font-medium leading-none ${
                    isFuture ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    {date.getDate()}
                  </span>
                  {dayData && !isFuture ? (
                    <span
                      className="w-1.5 h-1.5 rounded-full mt-0.5"
                      style={{ backgroundColor: dotColor(dayData.avg_score) }}
                    />
                  ) : (
                    // Empty spacer to keep row height consistent
                    <span className="w-1.5 h-1.5 mt-0.5" />
                  )}
                </button>
              )
            })
          )}
        </div>
      )}

      {/* ── Color legend ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-gray-100">
        {[
          { color: '#4ade80', label: 'Good' },
          { color: '#a78bfa', label: 'Ok' },
          { color: '#f87171', label: 'Low' },
          { color: '#d1d5db', label: 'Logged' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
