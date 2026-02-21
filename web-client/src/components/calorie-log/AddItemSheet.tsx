// AddItemSheet — bottom sheet for creating or editing a calorie log item.
// Slides up with a backdrop overlay. Supports "Log Item" (create) and
// "Edit Item" (pre-filled) modes. Type selector uses segmented buttons.

import { useState, type FormEvent } from 'react'
import type { CalorieLogItem } from '../../api'

const TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'exercise'] as const
const UNITS = ['each', 'g', 'miles', 'km', 'minutes'] as const

// Unit display labels (DB stores lowercase).
const UNIT_LABELS: Record<string, string> = {
  each: 'Each', g: 'g', miles: 'Miles', km: 'KM', minutes: 'Minutes',
}

interface Props {
  open: boolean
  onClose: () => void
  onSave: (item: {
    item_name: string
    type: string
    qty: number | null
    uom: string | null
    calories: number
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
  }) => void
  // Pre-fill fields from an existing item (edit mode).
  editItem?: CalorieLogItem | null
  // Default meal type when creating (set by the meal section that triggered the open).
  defaultType?: string
}

export default function AddItemSheet({ open, onClose, onSave, editItem, defaultType }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('snack')
  const [qty, setQty] = useState('1')
  const [uom, setUom] = useState('each')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [prevOpen, setPrevOpen] = useState(false)

  // Reset or pre-fill form when the sheet transitions from closed to open.
  // Uses the "adjust state during render" pattern instead of useEffect.
  if (open && !prevOpen) {
    setPrevOpen(true)
    if (editItem) {
      setName(editItem.item_name)
      setType(editItem.type)
      setQty(editItem.qty?.toString() ?? '1')
      setUom(editItem.uom ?? 'each')
      setCalories(editItem.calories.toString())
      setProtein(editItem.protein_g?.toString() ?? '')
      setCarbs(editItem.carbs_g?.toString() ?? '')
      setFat(editItem.fat_g?.toString() ?? '')
    } else {
      setName('')
      setType(defaultType || 'snack')
      setQty('1')
      setUom('each')
      setCalories('')
      setProtein('')
      setCarbs('')
      setFat('')
    }
  }
  if (!open && prevOpen) {
    setPrevOpen(false)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !calories) return
    onSave({
      item_name: name.trim(),
      type,
      qty: qty ? parseFloat(qty) : null,
      uom: uom || null,
      calories: parseInt(calories, 10),
      protein_g: protein ? parseFloat(protein) : null,
      carbs_g: carbs ? parseFloat(carbs) : null,
      fat_g: fat ? parseFloat(fat) : null,
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 shadow-2xl transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '85vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 2rem)' }}>
          <h2 className="text-lg font-semibold mb-4">
            {editItem ? 'Edit Item' : 'Log Item'}
          </h2>

          {/* Item name */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Item name</label>
            <input
              type="text"
              placeholder="e.g. Banana Smoothie"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
            />
          </div>

          {/* Type selector — segmented buttons */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="grid grid-cols-5 gap-1">
              {TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-2 py-2 text-xs font-medium rounded-lg border capitalize ${
                    type === t
                      ? 'border-stride-600 bg-stride-50 text-stride-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity + Unit */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input
                type="number"
                value={qty}
                onChange={e => setQty(e.target.value)}
                min="0"
                step="0.25"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select
                value={uom}
                onChange={e => setUom(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              >
                {UNITS.map(u => (
                  <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Calories */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Calories</label>
            <input
              type="number"
              placeholder="0"
              value={calories}
              onChange={e => setCalories(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
            />
          </div>

          {/* Macros */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Protein (g)</label>
              <input
                type="number" placeholder="—" value={protein}
                onChange={e => setProtein(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Carbs (g)</label>
              <input
                type="number" placeholder="—" value={carbs}
                onChange={e => setCarbs(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fat (g)</label>
              <input
                type="number" placeholder="—" value={fat}
                onChange={e => setFat(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-stride-600 hover:bg-stride-700 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {editItem ? 'Save Changes' : 'Save Item'}
          </button>
        </form>
      </div>
    </>
  )
}
