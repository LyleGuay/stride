// LogWeightSheet — bottom sheet / modal for logging or editing a weight entry.
// Mobile: slides up as a bottom sheet. Desktop: centered modal (mirrors AddItemSheet).
// Weight is displayed in the user's preferred unit (lbs or kg) but always saved
// as lbs — the onSave callback receives the converted value in lbs.

import { useState, useEffect, type FormEvent } from 'react'
import type { WeightEntry } from '../../types'
import { todayString } from '../../utils/dates'

// LBS_PER_KG conversion factor
const LBS_PER_KG = 2.20462

interface Props {
  open: boolean
  onClose: () => void
  // onSave receives (date: YYYY-MM-DD, weightLbs: number) — always in lbs
  onSave: (date: string, weightLbs: number) => Promise<void>
  // Pre-fill for edit mode; null/undefined means create mode
  editEntry?: WeightEntry | null
  // User's preferred unit for display ('imperial' uses lbs, 'metric' uses kg)
  units: string
}

export default function LogWeightSheet({ open, onClose, onSave, editEntry, units }: Props) {
  const [date, setDate]     = useState('')
  const [weight, setWeight] = useState('')
  const [saving, setSaving] = useState(false)

  const isMetric   = units === 'metric'
  const unitLabel  = isMetric ? 'kg' : 'lbs'
  const isEditMode = !!editEntry

  // Reset / pre-fill form when the sheet opens
  useEffect(() => {
    if (!open) return
    if (editEntry) {
      setDate(editEntry.date)
      // Convert stored lbs to display unit
      const displayWeight = isMetric
        ? (editEntry.weight_lbs / LBS_PER_KG)
        : editEntry.weight_lbs
      setWeight(displayWeight.toFixed(1))
    } else {
      setDate(todayString())
      setWeight('')
    }
    setSaving(false)
  }, [open, editEntry, isMetric])

  const weightNum = parseFloat(weight)
  const isValid   = date.length === 10 && !isNaN(weightNum) && weightNum > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    // Convert display unit back to lbs for storage
    const weightLbs = isMetric ? weightNum * LBS_PER_KG : weightNum

    setSaving(true)
    try {
      await onSave(date, weightLbs)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300
        sm:flex sm:items-center sm:justify-center sm:p-4
        ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={onClose}
    >
      {/* Render inner panel only when open so that test assertions like
          not.toBeVisible() on the heading work — Playwright considers
          opacity-0 elements still "visible". */}
      {open && (
        <div
          className="bg-white shadow-2xl overflow-hidden
            fixed bottom-0 left-0 right-0 rounded-t-2xl
            sm:static sm:rounded-xl sm:w-full sm:max-w-sm"
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <form onSubmit={handleSubmit} className="px-5 pt-4 pb-6 sm:pt-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{isEditMode ? 'Edit Weight' : 'Log Weight'}</h2>
              <button
                type="button"
                onClick={onClose}
                className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Date field */}
            <div className="mb-3">
              <label htmlFor="lw-date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                id="lw-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                max={todayString()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>

            {/* Weight field */}
            <div className="mb-5">
              <label htmlFor="lw-weight" className="block text-sm font-medium text-gray-700 mb-1">
                Weight ({unitLabel})
              </label>
              <input
                id="lw-weight"
                type="number"
                placeholder={isMetric ? 'e.g. 75.5' : 'e.g. 165.5'}
                value={weight}
                onChange={e => setWeight(e.target.value)}
                min="0.1"
                step="0.1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={!isValid || saving}
              className="w-full bg-stride-600 hover:bg-stride-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-3 rounded-xl transition-colors"
            >
              {saving ? 'Saving…' : isEditMode ? 'Save Changes' : 'Save Weight'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
