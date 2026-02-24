// InlineAddRow — inline row for quick-adding items within a meal section.
// Two states: a collapsed "+ Add" trigger row, and an expanded input row with
// column-aligned fields (name, qty, unit, cal, and P/C/F for non-exercise).
// Open state is controlled by the parent so only one row can be open at a time.
// Enter submits, Escape cancels.
// When the user types a food/exercise description, an AI suggestion strip
// appears below the input row after a 600ms debounce. The suggestion row is
// column-aligned with the input fields and shows merged values (user overrides
// for dirty fields, AI values for clean fields).

import { useState, useRef, useEffect } from 'react'
import { ALL_UNITS, EXERCISE_UNITS } from '../../constants'
import { useSuggestion } from '../../hooks/useSuggestion'
import type { AISuggestion } from '../../types'
import SuggestionStrip from './SuggestionStrip'

const UNIT_LABELS: Record<string, string> = {
  each: 'Each', g: 'g', miles: 'Miles', km: 'km', minutes: 'Minutes',
}

interface Props {
  mealType: string
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  onAdd: (fields: {
    name: string
    qty: number | null
    uom: string | null
    calories: number
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
  }) => void
}

export default function InlineAddRow({ mealType, isOpen, onOpen, onClose, onAdd }: Props) {
  const isExercise = mealType === 'exercise'
  const units = isExercise ? EXERCISE_UNITS : ALL_UNITS

  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [uom, setUom] = useState('each')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // Track which fields the user has manually edited so Apply doesn't overwrite them
  const dirtyFields = useRef(new Set<string>())

  const { state: suggestionState, dismiss: dismissSuggestion, markApplied } = useSuggestion(name, mealType)

  // Build merged suggestion for the inline display — shows the user's value
  // for dirty fields and the AI's value for clean fields, so the strip is
  // an accurate preview of what the form will look like after Apply.
  // When the user overrides calories but not macros, scale P/C/F proportionally
  // so the suggestion stays internally consistent.
  let displaySuggestion: AISuggestion | undefined
  if (suggestionState.status === 'success') {
    const ai = suggestionState.suggestion
    const dirty = dirtyFields.current
    const userCal = dirty.has('calories') ? (parseInt(calories) || 0) : ai.calories
    // Scale macros proportionally when the user overrides calories but not the individual macro
    const scale = (ai.calories > 0 && dirty.has('calories')) ? userCal / ai.calories : 1
    displaySuggestion = {
      item_name: ai.item_name,
      qty: dirty.has('qty') ? (parseFloat(qty) || 0) : ai.qty,
      uom: dirty.has('uom') ? uom : ai.uom,
      calories: userCal,
      protein_g: dirty.has('protein') ? (parseFloat(protein) || 0) : Math.round(ai.protein_g * scale),
      carbs_g: dirty.has('carbs') ? (parseFloat(carbs) || 0) : Math.round(ai.carbs_g * scale),
      fat_g: dirty.has('fat') ? (parseFloat(fat) || 0) : Math.round(ai.fat_g * scale),
      confidence: ai.confidence,
    }
  }

  // Auto-focus name input when the row opens.
  useEffect(() => {
    if (isOpen) nameRef.current?.focus()
  }, [isOpen])

  // Reset all fields then delegate to the parent close handler.
  const handleClose = () => {
    setName(''); setQty('1'); setUom('each')
    setCalories(''); setProtein(''); setCarbs(''); setFat('')
    dirtyFields.current.clear()
    onClose()
  }

  const handleSubmit = () => {
    if (!name.trim() || !calories) return
    onAdd({
      name: name.trim(),
      qty: qty ? parseFloat(qty) : null,
      uom: uom || null,
      calories: parseInt(calories, 10),
      protein_g: !isExercise && protein ? parseFloat(protein) : null,
      carbs_g: !isExercise && carbs ? parseFloat(carbs) : null,
      fat_g: !isExercise && fat ? parseFloat(fat) : null,
    })
    handleClose()
  }

  // Apply AI suggestion — populates non-dirty fields, always replaces name.
  // Uses markApplied to prevent the name change from re-triggering a fetch.
  const applySuggestion = (suggestion: AISuggestion) => {
    setName(suggestion.item_name)
    if (!dirtyFields.current.has('qty')) setQty(suggestion.qty.toString())
    if (!dirtyFields.current.has('uom')) setUom(suggestion.uom)
    if (!dirtyFields.current.has('calories')) setCalories(suggestion.calories.toString())
    if (!isExercise) {
      if (!dirtyFields.current.has('protein')) setProtein(suggestion.protein_g.toString())
      if (!dirtyFields.current.has('carbs')) setCarbs(suggestion.carbs_g.toString())
      if (!dirtyFields.current.has('fat')) setFat(suggestion.fat_g.toString())
    }
    markApplied(suggestion.item_name)
  }

  // Mark a field as dirty when the user manually edits it
  const markDirty = (field: string) => {
    dirtyFields.current.add(field)
  }

  // Shared keyDown handler — Enter submits, Escape cancels
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
    else if (e.key === 'Escape') handleClose()
  }

  // Collapsed state — simple "+ Add" trigger
  if (!isOpen) {
    return (
      <tr className="border-t border-gray-50">
        <td colSpan={8} className="py-0 px-0">
          <button
            onClick={onOpen}
            className="w-full text-left py-1.5 pl-[18px] text-[11px] text-gray-400 hover:text-stride-600 transition-colors"
          >
            + Add
          </button>
        </td>
      </tr>
    )
  }

  // Expanded state — column-aligned inputs matching the table header
  return (
    <>
      <tr className="border-t border-stride-100 bg-stride-50/40">
        {/* Item name + Add/Cancel buttons */}
        <td className="py-1 pl-[14px] pr-1">
          <div className="flex items-center gap-1">
            <input
              ref={nameRef}
              type="text"
              placeholder={isExercise ? 'Activity' : 'Item name'}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 min-w-0 border border-stride-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-stride-500 bg-white"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || !calories}
              className="shrink-0 bg-stride-600 text-white text-[11px] px-2 py-1 rounded hover:bg-stride-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add
            </button>
            <button
              type="button"
              onClick={handleClose}
              tabIndex={-1}
              className="shrink-0 text-gray-400 hover:text-gray-600 text-xs px-0.5"
              aria-label="Cancel"
            >
              ✕
            </button>
          </div>
        </td>

        {/* Qty */}
        <td className="py-1 px-1 w-14">
          <input
            type="number" placeholder="Qty"
            value={qty}
            onChange={e => { markDirty('qty'); setQty(e.target.value) }}
            onKeyDown={handleKeyDown}
            min="0" step="0.25"
            className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-right focus:outline-none focus:border-stride-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </td>

        {/* Unit */}
        <td className="py-1 px-1 w-20">
          <select
            value={uom}
            onChange={e => { markDirty('uom'); setUom(e.target.value) }}
            className="w-full border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-stride-400 bg-white"
          >
            {units.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
          </select>
        </td>

        {/* Calories */}
        <td className="py-1 px-1 w-16">
          <input
            type="number" placeholder="Cal"
            value={calories}
            onChange={e => { markDirty('calories'); setCalories(e.target.value) }}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-right focus:outline-none focus:border-stride-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </td>

        {/* P/C/F — shown on desktop for non-exercise, always hidden for exercise */}
        <td className={`py-1 px-1 w-12 ${isExercise ? 'hidden' : 'hidden sm:table-cell'}`}>
          {!isExercise && (
            <input
              type="number" placeholder="P"
              value={protein}
              onChange={e => { markDirty('protein'); setProtein(e.target.value) }}
              onKeyDown={handleKeyDown}
              className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-right focus:outline-none focus:border-stride-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          )}
        </td>
        <td className={`py-1 px-1 w-12 ${isExercise ? 'hidden' : 'hidden sm:table-cell'}`}>
          {!isExercise && (
            <input
              type="number" placeholder="C"
              value={carbs}
              onChange={e => { markDirty('carbs'); setCarbs(e.target.value) }}
              onKeyDown={handleKeyDown}
              className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-right focus:outline-none focus:border-stride-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          )}
        </td>
        <td className={`py-1 px-1 w-12 ${isExercise ? 'hidden' : 'hidden sm:table-cell'}`}>
          {!isExercise && (
            <input
              type="number" placeholder="F"
              value={fat}
              onChange={e => { markDirty('fat'); setFat(e.target.value) }}
              onKeyDown={handleKeyDown}
              className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-right focus:outline-none focus:border-stride-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          )}
        </td>

        {/* Mobile combined P/C/F column — empty placeholder */}
        <td className="sm:hidden" />
      </tr>

      {/* AI suggestion strip — column-aligned below the input row */}
      <SuggestionStrip
        state={suggestionState}
        onApply={applySuggestion}
        onDismiss={dismissSuggestion}
        variant="inline"
        displaySuggestion={displaySuggestion}
        isExercise={isExercise}
      />
    </>
  )
}
