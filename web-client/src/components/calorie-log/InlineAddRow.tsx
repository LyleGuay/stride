// InlineAddRow — expandable "+ Add" row for quick-adding items within a meal
// section. Shows a name + calories input pair with an Add button and a "···"
// link to open the full bottom sheet.

import { useState, useRef, useEffect, type FormEvent } from 'react'

interface Props {
  mealType: string
  onAdd: (name: string, calories: number) => void
  onOpenSheet: () => void
}

export default function InlineAddRow({ mealType, onAdd, onOpenSheet }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [calories, setCalories] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // Auto-focus the name input when expanded
  useEffect(() => {
    if (open) nameRef.current?.focus()
  }, [open])

  const handleAdd = (e?: FormEvent) => {
    e?.preventDefault()
    if (!name.trim() || !calories) return
    onAdd(name.trim(), parseInt(calories, 10))
    setName('')
    setCalories('')
    setOpen(false)
  }

  return (
    <tr className="border-t border-gray-50">
      <td colSpan={8} className="py-0 px-0">
        <button
          onClick={() => setOpen(!open)}
          className="w-full text-left py-1.5 pl-[18px] text-[11px] text-gray-400 hover:text-stride-600 transition-colors"
        >
          + Add
        </button>

        {/* Expandable inline form */}
        <div
          className="overflow-hidden transition-all duration-200"
          style={{ maxHeight: open ? '200px' : '0', opacity: open ? 1 : 0 }}
        >
          <form onSubmit={handleAdd} className="px-3 py-2 flex items-center gap-2 bg-stride-50/50">
            <input
              ref={nameRef}
              type="text"
              placeholder={mealType === 'exercise' ? 'Activity' : 'Item name'}
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-stride-500"
            />
            <input
              type="number"
              placeholder="Cal"
              value={calories}
              onChange={e => setCalories(e.target.value)}
              className="w-16 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-stride-500"
            />
            <button
              type="submit"
              className="bg-stride-600 text-white px-2.5 py-1.5 rounded text-xs font-medium hover:bg-stride-700"
            >
              Add
            </button>
            <button
              type="button"
              onClick={onOpenSheet}
              className="text-gray-400 hover:text-stride-600 text-xs"
              title="Add with full details"
            >
              &middot;&middot;&middot;
            </button>
          </form>
        </div>
      </td>
    </tr>
  )
}
