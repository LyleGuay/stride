// InlineAddRow — inline row for quick-adding items within a meal section.
// Two states: a collapsed "+ Add" trigger row, and an expanded input row with
// column-aligned fields (name, qty, unit, cal, P, C, F). Enter submits,
// Escape cancels.

import { useState, useRef, useEffect } from 'react'

const UNITS = ['each', 'g', 'miles', 'km', 'minutes'] as const
const UNIT_LABELS: Record<string, string> = {
  each: 'Each', g: 'g', miles: 'Miles', km: 'km', minutes: 'Minutes',
}

interface Props {
  mealType: string
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

export default function InlineAddRow({ mealType, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [uom, setUom] = useState('each')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // Auto-focus name input when the row expands
  useEffect(() => {
    if (open) nameRef.current?.focus()
  }, [open])

  const reset = () => {
    setName(''); setQty('1'); setUom('each')
    setCalories(''); setProtein(''); setCarbs(''); setFat('')
  }

  const handleSubmit = () => {
    if (!name.trim() || !calories) return
    onAdd({
      name: name.trim(),
      qty: qty ? parseFloat(qty) : null,
      uom: uom || null,
      calories: parseInt(calories, 10),
      protein_g: protein ? parseFloat(protein) : null,
      carbs_g: carbs ? parseFloat(carbs) : null,
      fat_g: fat ? parseFloat(fat) : null,
    })
    reset()
    setOpen(false)
  }

  const handleCancel = () => {
    reset()
    setOpen(false)
  }

  // Shared keyDown handler for all inputs — Enter submits, Escape cancels
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
    else if (e.key === 'Escape') handleCancel()
  }

  // Collapsed state — simple "+ Add" trigger
  if (!open) {
    return (
      <tr className="border-t border-gray-50">
        <td colSpan={8} className="py-0 px-0">
          <button
            onClick={() => setOpen(true)}
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
            placeholder={mealType === 'exercise' ? 'Activity' : 'Item name'}
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
            onClick={handleCancel}
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
          {UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
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

      {/* Protein — desktop only */}
      <td className="py-1 px-1 w-12 hidden sm:table-cell">
        <input
          type="number" placeholder="P"
          value={protein}
          onChange={e => setProtein(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-right focus:outline-none focus:border-stride-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </td>

      {/* Carbs — desktop only */}
      <td className="py-1 px-1 w-12 hidden sm:table-cell">
        <input
          type="number" placeholder="C"
          value={carbs}
          onChange={e => setCarbs(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-right focus:outline-none focus:border-stride-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </td>

      {/* Fat — desktop only */}
      <td className="py-1 px-1 w-12 hidden sm:table-cell">
        <input
          type="number" placeholder="F"
          value={fat}
          onChange={e => setFat(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full border border-gray-200 rounded px-1 py-1 text-xs text-right focus:outline-none focus:border-stride-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </td>

      {/* Mobile combined P/C/F column — empty placeholder for column count */}
      <td className="sm:hidden" />
    </tr>
  )
}
