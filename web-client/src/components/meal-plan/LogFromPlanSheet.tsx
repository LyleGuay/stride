// LogFromPlanSheet — quantity-scaling modal for logging a food or recipe meal
// plan entry into the calorie log. Pre-fills name and base nutrition from the
// plan entry. The user adjusts qty and calories are recomputed proportionally.
// On save, calls createCalorieLogItem with meal_plan_entry_id so the ghost row
// disappears from the calorie log view.
//
// This sheet is used for food and recipe entry types. Takeout entries use
// AddItemSheet with mealPlanContext instead.
//
// Layout mirrors AddItemSheet: bottom sheet on mobile, centered modal on desktop.

import { useState, useEffect, type FormEvent } from 'react'
import { createCalorieLogItem } from '../../api'
import type { MealPlanEntry } from '../../api'

interface Props {
  open: boolean
  onClose: () => void
  // The plan entry being logged — must be entry_type 'food' or 'recipe'.
  entry: MealPlanEntry | null
  // Date to log the item on (the calorie log's current date).
  date: string
  // Called after the item is successfully saved.
  onSaved: () => void
}

export default function LogFromPlanSheet({ open, onClose, entry, date, onSaved }: Props) {
  // qty is a free-input string so the user can type freely before committing.
  const [qty, setQty] = useState('1')
  // calories can be overridden by the user after auto-computation.
  const [calories, setCalories] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Seed form when entry changes or sheet opens.
  useEffect(() => {
    if (!open || !entry) return
    const baseQty = entry.qty ?? 1
    setQty(String(baseQty))
    setCalories(entry.calories != null ? String(entry.calories) : '')
    setError('')
  }, [open, entry])

  if (!entry) return null

  const baseQty = entry.qty ?? 1
  const baseCalories = entry.calories ?? 0

  // Recompute calories proportionally as qty changes (unless overridden).
  const handleQtyChange = (raw: string) => {
    setQty(raw)
    const parsed = parseFloat(raw)
    if (!isNaN(parsed) && parsed > 0 && baseQty > 0) {
      setCalories(String(Math.round(baseCalories * parsed / baseQty)))
    }
  }

  const increment = () => handleQtyChange(String((parseFloat(qty) || 0) + 0.5))
  const decrement = () => {
    const next = Math.max(0.5, (parseFloat(qty) || 1) - 0.5)
    handleQtyChange(String(next))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!calories) return
    setSaving(true)
    setError('')
    try {
      const parsedQty = parseFloat(qty) || null
      // Scale macros proportionally to qty change.
      const scale = parsedQty && baseQty ? parsedQty / baseQty : 1
      await createCalorieLogItem({
        date,
        item_name: entry.item_name ?? entry.takeout_name ?? 'Meal Plan Item',
        type: entry.meal_type, // use the plan entry's meal type so it lands in the correct section
        qty: parsedQty,
        uom: entry.uom ?? null,
        calories: parseInt(calories, 10),
        protein_g: entry.protein_g != null ? Math.round(entry.protein_g * scale * 10) / 10 : null,
        carbs_g: entry.carbs_g != null ? Math.round(entry.carbs_g * scale * 10) / 10 : null,
        fat_g: entry.fat_g != null ? Math.round(entry.fat_g * scale * 10) / 10 : null,
        meal_plan_entry_id: entry.id,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const displayName = entry.item_name ?? 'Meal Plan Item'
  const uomLabel = entry.uom ?? 'serving'

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300
          sm:flex sm:items-center sm:justify-center sm:p-4
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      >
        {/* Sheet / modal */}
        <div
          className={`bg-white shadow-2xl overflow-hidden transition-all duration-300
            fixed bottom-0 left-0 right-0 rounded-t-2xl
            ${open ? 'translate-y-0' : 'translate-y-full'}
            sm:static sm:rounded-xl sm:w-full sm:max-w-sm sm:translate-y-0
            ${open ? 'sm:scale-100 sm:opacity-100' : 'sm:scale-95 sm:opacity-0'}`}
          style={{ maxHeight: '80vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <form onSubmit={handleSubmit} className="px-5 pt-4 pb-6 sm:pt-5 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 2rem)' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Log Planned Item</h2>
              <button
                type="button"
                onClick={onClose}
                className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* "From meal plan" banner */}
            <div className="mb-4 flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm text-indigo-700">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              From meal plan
            </div>

            {/* Item name — read-only */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-0.5">Item</p>
              <p className="text-sm font-medium text-gray-800">{displayName}</p>
            </div>

            {/* Qty stepper */}
            <div className="mb-4">
              <label htmlFor="log-plan-qty" className="block text-sm font-medium text-gray-700 mb-2">
                Quantity ({uomLabel})
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={decrement}
                  className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors text-lg font-medium"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  id="log-plan-qty"
                  type="number"
                  value={qty}
                  onChange={e => handleQtyChange(e.target.value)}
                  min="0.5"
                  step="0.5"
                  className="w-20 text-center border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={increment}
                  className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors text-lg font-medium"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            {/* Calories — auto-computed but editable */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Calories</label>
              <input
                type="number"
                value={calories}
                onChange={e => setCalories(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm mb-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={saving || !calories}
              className="w-full bg-stride-600 hover:bg-stride-700 disabled:bg-gray-300 text-white font-medium py-3 rounded-xl transition-colors"
            >
              {saving ? 'Saving…' : 'Log Item'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
