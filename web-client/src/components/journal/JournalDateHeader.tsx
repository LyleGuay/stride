// JournalDateHeader — date navigator for the journal daily tab.
// Mirrors the prev/next arrow capsule layout of calorie-log/DateHeader but the
// center label is a button that opens JournalDatePicker as a popover. A
// transparent full-screen overlay behind the popover closes it on click-outside.

import { useState } from 'react'
import type { JournalCalendarDay } from '../../types'
import JournalDatePicker from './JournalDatePicker'

interface Props {
  date: string                                                   // YYYY-MM-DD
  onDateChange: (date: string) => void
  loadMonth: (month: string) => void
  getMonthData: (month: string) => JournalCalendarDay[] | null
  isLoadingMonth: (month: string) => boolean
}

// Returns display labels for a YYYY-MM-DD date string.
// isSpecial is true for Today/Yesterday/Tomorrow (shown in blue).
function getDateLabels(dateStr: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  let primary = ''
  let isSpecial = true
  if (diffDays === 0) primary = 'Today'
  else if (diffDays === 1) primary = 'Yesterday'
  else if (diffDays === -1) primary = 'Tomorrow'
  else isSpecial = false

  const sub = date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

  return { primary, sub, isSpecial }
}

// Shifts a YYYY-MM-DD string forward or backward by a number of days.
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// Calendar icon — a simple calendar outline matching the design mockup.
function CalendarIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  )
}

export default function JournalDateHeader({
  date,
  onDateChange,
  loadMonth,
  getMonthData,
  isLoadingMonth,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { primary, sub, isSpecial } = getDateLabels(date)

  return (
    <div className="flex items-center justify-center py-2.5 relative">
      <div className="flex items-center bg-gray-100 rounded-full px-1 py-1">

        {/* ← Previous day */}
        <button
          onClick={() => onDateChange(shiftDate(date, -1))}
          className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center"
          aria-label="Previous day"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        {/* Date label — clicking opens the calendar picker popover */}
        <button
          onClick={() => setPickerOpen(v => !v)}
          className="flex items-center gap-1.5 px-2 min-w-[196px] justify-center hover:bg-gray-200 rounded-full py-0.5 transition-colors"
          aria-label="Open date picker"
          aria-expanded={pickerOpen}
        >
          {isSpecial ? (
            <>
              <span className="text-sm font-semibold text-blue-600">{primary}</span>
              <span className="text-xs text-gray-500">{sub}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-gray-800">{sub}</span>
          )}
          <CalendarIcon />
        </button>

        {/* → Next day */}
        <button
          onClick={() => onDateChange(shiftDate(date, 1))}
          className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center"
          aria-label="Next day"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* ── Calendar picker popover ───────────────────────────────────── */}
      {pickerOpen && (
        <>
          {/* Transparent overlay — clicking outside closes the picker */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setPickerOpen(false)}
            aria-hidden="true"
          />
          {/* Popover — positioned below the header, centered */}
          <div className="absolute top-full mt-1 z-40 left-1/2 -translate-x-1/2">
            <JournalDatePicker
              selectedDate={date}
              onSelect={onDateChange}
              onClose={() => setPickerOpen(false)}
              loadMonth={loadMonth}
              getMonthData={getMonthData}
              isLoadingMonth={isLoadingMonth}
            />
          </div>
        </>
      )}
    </div>
  )
}
