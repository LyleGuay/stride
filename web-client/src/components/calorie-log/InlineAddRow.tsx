// InlineAddRow — inline row for quick-adding items within a meal section.
// Two states: a collapsed "+ Add" trigger row, and an expanded input row with
// column-aligned fields (name, qty, unit, cal, and P/C/F for non-exercise).
// Open state is controlled by the parent so only one row can be open at a time.
// Enter submits, Escape cancels.

import { useState, useRef, useEffect } from 'react'

const ALL_UNITS = ['each', 'g', 'miles', 'km', 'minutes'] as const
const EXERCISE_UNITS = ['each', 'minutes', 'miles', 'km'] as const
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

  // Auto-focus name input when the row opens.
  useEffect(() => {
    if (isOpen) nameRef.current?.focus()
  }, [isOpen])

  // Reset all fields then delegate to the parent close handler.
  const handleClose = () => {
    setName(''); setQty('1'); setUom('each')
    setCalories(''); setProtein(''); setCarbs(''); setFat('')
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
          onChange={e => setQty(e.target.value)}
          onKeyDown={handleKeyDown}
          min="0" step="0.25"
          className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-right focus:outline-none focus:border-stride-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </td>

      {/* Unit */}
      <td className="py-1 px-1 w-20">
        <select
          value={uom}
          onChange={e => setUom(e.target.value)}
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
          onChange={e => setCalories(e.target.value)}
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
            onChange={e => setProtein(e.target.value)}
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
            onChange={e => setCarbs(e.target.value)}
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
            onChange={e => setFat(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-right focus:outline-none focus:border-stride-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        )}
      </td>

      {/* Mobile combined P/C/F column — empty placeholder */}
      <td className="sm:hidden" />
    </tr>
  )
}
