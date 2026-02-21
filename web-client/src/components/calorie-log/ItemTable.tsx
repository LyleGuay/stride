// ItemTable — main calorie log table with sticky header, items grouped by meal
// type, colored section headers, inline add rows, and a net total footer.
// Supports double-click inline cell editing, right-click context menu, and
// mobile "···" action button. Responsive: P/C/F separate on desktop, combined
// on mobile.

import { useState, useRef, useEffect } from 'react'
import type { CalorieLogItem } from '../../api'
import InlineAddRow from './InlineAddRow'

// Meal types in display order.
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'exercise'] as const

// Colored left-border classes per meal type.
const MEAL_BORDER_COLORS: Record<string, string> = {
  breakfast: 'border-l-orange-400',
  lunch: 'border-l-yellow-400',
  dinner: 'border-l-indigo-400',
  snack: 'border-l-green-400',
  exercise: 'border-l-emerald-500',
}

// Field order for Tab navigation between editable cells.
const EDITABLE_FIELDS = ['item_name', 'qty', 'uom', 'calories', 'protein_g', 'carbs_g', 'fat_g']
const NUMERIC_FIELDS = new Set(['qty', 'calories', 'protein_g', 'carbs_g', 'fat_g'])

// Options for the unit-of-measure select in inline cell editing.
const UNIT_OPTIONS = [
  { value: 'each', label: 'Each' },
  { value: 'g', label: 'g' },
  { value: 'miles', label: 'Miles' },
  { value: 'km', label: 'km' },
  { value: 'minutes', label: 'Minutes' },
]

interface Props {
  items: CalorieLogItem[]
  onInlineAdd: (type: string, fields: {
    name: string; qty: number | null; uom: string | null; calories: number
    protein_g: number | null; carbs_g: number | null; fat_g: number | null
  }) => void
  onUpdateItem: (id: number, field: string, value: unknown) => Promise<boolean>
  onItemAction: (item: CalorieLogItem, position: { x: number; y: number }) => void
}

export default function ItemTable({ items, onInlineAdd, onUpdateItem, onItemAction }: Props) {
  // Group items by meal type
  const grouped: Record<string, CalorieLogItem[]> = Object.fromEntries(
    MEAL_TYPES.map(t => [t, items.filter(i => i.type === t)])
  )

  // Compute net totals (exercise subtracts from the net)
  const netCalories = items.reduce(
    (sum, i) => sum + (i.type === 'exercise' ? -i.calories : i.calories), 0
  )
  const netProtein = items.reduce((sum, i) => sum + (i.protein_g ?? 0), 0)
  const netCarbs = items.reduce((sum, i) => sum + (i.carbs_g ?? 0), 0)
  const netFat = items.reduce((sum, i) => sum + (i.fat_g ?? 0), 0)

  /* ─── Inline editing state ─────────────────────────────────────────── */

  const [editing, setEditing] = useState<{ itemId: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [flashKey, setFlashKey] = useState<string | null>(null)
  // Ref to prevent blur from double-committing when Tab fires first
  const skipBlurRef = useRef(false)

  // Start editing a cell — sets the active cell and seeds the input value.
  const startEdit = (item: CalorieLogItem, field: string) => {
    const raw = (item as unknown as Record<string, unknown>)[field]
    setEditing({ itemId: item.id, field })
    setEditValue(raw != null ? String(raw) : '')
  }

  // Commit the current edit — sends the update to the API and shows a green flash.
  // Accepts an optional overrideValue so select cells can commit immediately on
  // change without waiting for editValue state to update.
  const commitEdit = async (overrideValue?: string) => {
    if (!editing) return
    const { itemId, field } = editing
    const raw = overrideValue !== undefined ? overrideValue : editValue
    const value = NUMERIC_FIELDS.has(field)
      ? (raw ? parseFloat(raw) : null)
      : raw
    setEditing(null)
    const success = await onUpdateItem(itemId, field, value)
    if (success) {
      const key = `${itemId}-${field}`
      setFlashKey(key)
      setTimeout(() => setFlashKey(null), 400)
    }
  }

  const cancelEdit = () => setEditing(null)

  // Tab commits the current cell and starts editing the next (or previous) one.
  const tabToNext = (item: CalorieLogItem, currentField: string, reverse: boolean) => {
    if (!editing) return
    const { itemId, field } = editing

    // Fire the API update in the background (don't wait)
    const value = NUMERIC_FIELDS.has(field)
      ? (editValue ? parseFloat(editValue) : null)
      : editValue
    onUpdateItem(itemId, field, value).then(success => {
      if (success) {
        setFlashKey(`${itemId}-${field}`)
        setTimeout(() => setFlashKey(null), 400)
      }
    })

    // Move to next/previous editable field
    skipBlurRef.current = true
    const idx = EDITABLE_FIELDS.indexOf(currentField)
    const nextIdx = reverse ? idx - 1 : idx + 1
    if (nextIdx >= 0 && nextIdx < EDITABLE_FIELDS.length) {
      startEdit(item, EDITABLE_FIELDS[nextIdx])
    } else {
      setEditing(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wide">
            <th className="text-left py-2 px-3 font-medium sticky top-0 bg-gray-50">Item</th>
            <th className="text-right py-2 px-2 font-medium w-14 sticky top-0 bg-gray-50">Qty</th>
            <th className="text-left py-2 px-2 font-medium w-20 sticky top-0 bg-gray-50">Unit</th>
            <th className="text-right py-2 px-2 font-medium w-16 sticky top-0 bg-gray-50">Cal</th>
            <th className="text-right py-2 px-2 font-medium w-12 hidden sm:table-cell sticky top-0 bg-gray-50">P</th>
            <th className="text-right py-2 px-2 font-medium w-12 hidden sm:table-cell sticky top-0 bg-gray-50">C</th>
            <th className="text-right py-2 px-2 font-medium w-12 hidden sm:table-cell sticky top-0 bg-gray-50">F</th>
            <th className="text-right py-2 px-3 font-medium sm:hidden sticky top-0 bg-gray-50">P / C / F</th>
          </tr>
        </thead>
        <tbody>
          {MEAL_TYPES.map(type => (
            <MealSection
              key={type}
              type={type}
              items={grouped[type]}
              editing={editing}
              editValue={editValue}
              flashKey={flashKey}
              skipBlurRef={skipBlurRef}
              onStartEdit={startEdit}
              onEditChange={setEditValue}
              onCommitEdit={commitEdit}
              onCancelEdit={cancelEdit}
              onTabEdit={tabToNext}
              onItemAction={onItemAction}
              onInlineAdd={(fields) => onInlineAdd(type, fields)}
            />
          ))}

          {/* Net totals row */}
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-xs">
            <td className="py-2 px-3 text-gray-700">Net Total</td>
            <td className="py-2 px-2" />
            <td className="py-2 px-2" />
            <td className="py-2 px-2 text-right">{netCalories.toLocaleString()}</td>
            <td className="py-2 px-2 text-right text-blue-600 hidden sm:table-cell">{Math.round(netProtein)}</td>
            <td className="py-2 px-2 text-right text-amber-600 hidden sm:table-cell">{Math.round(netCarbs)}</td>
            <td className="py-2 px-2 text-right text-pink-600 hidden sm:table-cell">{Math.round(netFat)}</td>
            <td className="py-2 px-3 text-right text-gray-500 sm:hidden">
              {Math.round(netProtein)} / {Math.round(netCarbs)} / {Math.round(netFat)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/* ─── MealSection ──────────────────────────────────────────────────────── */

// MealSection renders a meal header row, its item rows, and an inline-add row.
function MealSection({ type, items, editing, editValue, flashKey, skipBlurRef,
  onStartEdit, onEditChange, onCommitEdit, onCancelEdit, onTabEdit,
  onItemAction, onInlineAdd,
}: {
  type: string
  items: CalorieLogItem[]
  editing: { itemId: number; field: string } | null
  editValue: string
  flashKey: string | null
  skipBlurRef: React.RefObject<boolean>
  onStartEdit: (item: CalorieLogItem, field: string) => void
  onEditChange: (value: string) => void
  onCommitEdit: (overrideValue?: string) => void
  onCancelEdit: () => void
  onTabEdit: (item: CalorieLogItem, field: string, reverse: boolean) => void
  onItemAction: (item: CalorieLogItem, position: { x: number; y: number }) => void
  onInlineAdd: (fields: {
    name: string; qty: number | null; uom: string | null; calories: number
    protein_g: number | null; carbs_g: number | null; fat_g: number | null
  }) => void
}) {
  const borderColor = MEAL_BORDER_COLORS[type] || 'border-l-gray-400'
  const isExercise = type === 'exercise'
  const sectionTotal = items.reduce((sum, i) => sum + i.calories, 0)
  const displayTotal = isExercise && sectionTotal > 0 ? `-${sectionTotal}` : sectionTotal.toLocaleString()
  const totalColor = isExercise ? 'text-emerald-600' : (sectionTotal > 0 ? 'text-gray-600' : 'text-gray-400')

  return (
    <>
      {/* Section header — colored left border, darker bg */}
      <tr className="border-t border-gray-200 bg-[#f0f0f4]">
        <td colSpan={4} className={`py-1.5 px-3 font-semibold text-xs text-gray-700 border-l-[3px] ${borderColor}`}>
          <span className="capitalize">{type}</span>
        </td>
        <td colSpan={3} className={`py-1.5 px-2 text-right font-semibold ${totalColor} hidden sm:table-cell`}>
          {displayTotal}
        </td>
        <td className={`py-1.5 px-3 text-right font-semibold ${totalColor} sm:hidden`}>
          {displayTotal}
        </td>
      </tr>

      {/* Item rows — indented under headers */}
      {items.map(item => (
        <ItemRow
          key={item.id}
          item={item}
          isExercise={isExercise}
          editing={editing}
          editValue={editValue}
          flashKey={flashKey}
          skipBlurRef={skipBlurRef}
          onStartEdit={onStartEdit}
          onEditChange={onEditChange}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
          onTabEdit={onTabEdit}
          onItemAction={onItemAction}
        />
      ))}

      {/* Inline quick-add row */}
      <InlineAddRow mealType={type} onAdd={onInlineAdd} />
    </>
  )
}

/* ─── ItemRow ──────────────────────────────────────────────────────────── */

// ItemRow renders a single item with editable cells, right-click context menu,
// and a mobile "···" action button.
function ItemRow({ item, isExercise, editing, editValue, flashKey, skipBlurRef,
  onStartEdit, onEditChange, onCommitEdit, onCancelEdit, onTabEdit, onItemAction,
}: {
  item: CalorieLogItem
  isExercise: boolean
  editing: { itemId: number; field: string } | null
  editValue: string
  flashKey: string | null
  skipBlurRef: React.RefObject<boolean>
  onStartEdit: (item: CalorieLogItem, field: string) => void
  onEditChange: (value: string) => void
  onCommitEdit: (overrideValue?: string) => void
  onCancelEdit: () => void
  onTabEdit: (item: CalorieLogItem, field: string, reverse: boolean) => void
  onItemAction: (item: CalorieLogItem, position: { x: number; y: number }) => void
}) {
  // Right-click handler — opens the context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    onItemAction(item, { x: e.clientX, y: e.clientY })
  }

  // Mobile "···" button — opens context menu positioned near the button
  const handleMobileAction = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    onItemAction(item, { x: rect.right, y: rect.top })
  }

  // Helper to check if a cell is currently being edited
  const isEditing = (field: string) =>
    editing?.itemId === item.id && editing?.field === field

  // Helper to check if a cell should show the green flash
  const isFlashing = (field: string) => flashKey === `${item.id}-${field}`

  return (
    <tr
      className="border-t border-gray-50 hover:bg-gray-50 select-none"
      onContextMenu={handleContextMenu}
    >
      {/* Item name */}
      <EditableCell
        item={item} field="item_name"
        displayValue={item.item_name}
        className="py-1.5 px-3 pl-[18px] font-medium text-gray-800 whitespace-nowrap relative"
        isEditing={isEditing('item_name')} editValue={editValue} isFlashing={isFlashing('item_name')}
        skipBlurRef={skipBlurRef}
        onStartEdit={onStartEdit} onEditChange={onEditChange}
        onCommitEdit={onCommitEdit} onCancelEdit={onCancelEdit} onTabEdit={onTabEdit}
      >
        {/* Mobile "···" action button — hidden on desktop */}
        <button
          onClick={handleMobileAction}
          className="absolute right-1 top-1/2 -translate-y-1/2 px-1 text-gray-400 hover:text-stride-600 sm:hidden"
        >
          &middot;&middot;&middot;
        </button>
      </EditableCell>

      {/* Qty */}
      <EditableCell
        item={item} field="qty"
        displayValue={item.qty != null ? String(item.qty) : ''}
        className="py-1.5 px-2 text-right text-gray-500 whitespace-nowrap"
        isEditing={isEditing('qty')} editValue={editValue} isFlashing={isFlashing('qty')}
        skipBlurRef={skipBlurRef}
        onStartEdit={onStartEdit} onEditChange={onEditChange}
        onCommitEdit={onCommitEdit} onCancelEdit={onCancelEdit} onTabEdit={onTabEdit}
      />

      {/* Unit — uses a select in edit mode */}
      <EditableCell
        item={item} field="uom"
        displayValue={item.uom ?? ''}
        className="py-1.5 px-2 text-gray-500 whitespace-nowrap capitalize"
        isEditing={isEditing('uom')} editValue={editValue} isFlashing={isFlashing('uom')}
        skipBlurRef={skipBlurRef}
        onStartEdit={onStartEdit} onEditChange={onEditChange}
        onCommitEdit={onCommitEdit} onCancelEdit={onCancelEdit} onTabEdit={onTabEdit}
        selectOptions={UNIT_OPTIONS}
      />

      {/* Calories */}
      <EditableCell
        item={item} field="calories"
        displayValue={isExercise ? `-${item.calories}` : item.calories.toLocaleString()}
        className={`py-1.5 px-2 text-right font-medium whitespace-nowrap ${isExercise ? 'text-emerald-600' : ''}`}
        isEditing={isEditing('calories')} editValue={editValue} isFlashing={isFlashing('calories')}
        skipBlurRef={skipBlurRef}
        onStartEdit={onStartEdit} onEditChange={onEditChange}
        onCommitEdit={onCommitEdit} onCancelEdit={onCancelEdit} onTabEdit={onTabEdit}
      />

      {/* Desktop: separate P/C/F columns */}
      <EditableCell
        item={item} field="protein_g"
        displayValue={item.protein_g != null ? String(Math.round(item.protein_g)) : ''}
        className="py-1.5 px-2 text-right text-blue-500 hidden sm:table-cell"
        isEditing={isEditing('protein_g')} editValue={editValue} isFlashing={isFlashing('protein_g')}
        skipBlurRef={skipBlurRef}
        onStartEdit={onStartEdit} onEditChange={onEditChange}
        onCommitEdit={onCommitEdit} onCancelEdit={onCancelEdit} onTabEdit={onTabEdit}
      />
      <EditableCell
        item={item} field="carbs_g"
        displayValue={item.carbs_g != null ? String(Math.round(item.carbs_g)) : ''}
        className="py-1.5 px-2 text-right text-amber-500 hidden sm:table-cell"
        isEditing={isEditing('carbs_g')} editValue={editValue} isFlashing={isFlashing('carbs_g')}
        skipBlurRef={skipBlurRef}
        onStartEdit={onStartEdit} onEditChange={onEditChange}
        onCommitEdit={onCommitEdit} onCancelEdit={onCancelEdit} onTabEdit={onTabEdit}
      />
      <EditableCell
        item={item} field="fat_g"
        displayValue={item.fat_g != null ? String(Math.round(item.fat_g)) : ''}
        className="py-1.5 px-2 text-right text-pink-500 hidden sm:table-cell"
        isEditing={isEditing('fat_g')} editValue={editValue} isFlashing={isFlashing('fat_g')}
        skipBlurRef={skipBlurRef}
        onStartEdit={onStartEdit} onEditChange={onEditChange}
        onCommitEdit={onCommitEdit} onCancelEdit={onCancelEdit} onTabEdit={onTabEdit}
      />

      {/* Mobile: combined P/C/F column (read-only — mobile uses bottom sheet for editing) */}
      <td className="py-1.5 px-3 text-right text-gray-400 sm:hidden">
        {item.protein_g != null || item.carbs_g != null || item.fat_g != null
          ? `${Math.round(item.protein_g ?? 0)} / ${Math.round(item.carbs_g ?? 0)} / ${Math.round(item.fat_g ?? 0)}`
          : ''}
      </td>
    </tr>
  )
}

/* ─── EditableCell ─────────────────────────────────────────────────────── */

// EditableCell renders a <td> that supports double-click to enter edit mode.
// In edit mode, shows an <input> (or <select> when selectOptions is provided)
// with Enter/Escape/Tab key handling. Shows a brief green flash after a save.
function EditableCell({ item, field, displayValue, className, isEditing, editValue,
  isFlashing, skipBlurRef, onStartEdit, onEditChange, onCommitEdit, onCancelEdit,
  onTabEdit, selectOptions, children,
}: {
  item: CalorieLogItem
  field: string
  displayValue: string
  className?: string
  isEditing: boolean
  editValue: string
  isFlashing: boolean
  skipBlurRef: React.RefObject<boolean>
  onStartEdit: (item: CalorieLogItem, field: string) => void
  onEditChange: (value: string) => void
  onCommitEdit: (overrideValue?: string) => void
  onCancelEdit: () => void
  onTabEdit: (item: CalorieLogItem, field: string, reverse: boolean) => void
  // When provided, renders a <select> in edit mode instead of a text input.
  selectOptions?: { value: string; label: string }[]
  children?: React.ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const isNumeric = NUMERIC_FIELDS.has(field)

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
      selectRef.current?.focus()
    }
  }, [isEditing])

  if (isEditing && selectOptions) {
    // Select variant — commits immediately on change (no need to press Enter)
    return (
      <td className="p-0">
        <select
          ref={selectRef}
          value={editValue}
          onChange={e => {
            onEditChange(e.target.value)
            onCommitEdit(e.target.value)
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') onCancelEdit()
            else if (e.key === 'Tab') {
              e.preventDefault()
              skipBlurRef.current = true
              onCommitEdit(editValue)
              onTabEdit(item, field, e.shiftKey)
            }
          }}
          onBlur={() => {
            if (skipBlurRef.current) { skipBlurRef.current = false; return }
            onCommitEdit()
          }}
          className="w-full h-full border-2 border-stride-600 rounded-[3px] px-1 py-0.5 text-xs outline-none bg-stride-50"
        >
          {selectOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>
    )
  }

  if (isEditing) {
    return (
      <td className="p-0">
        <input
          ref={inputRef}
          type={isNumeric ? 'number' : 'text'}
          value={editValue}
          onChange={e => onEditChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onCommitEdit()
            else if (e.key === 'Escape') onCancelEdit()
            else if (e.key === 'Tab') {
              e.preventDefault()
              skipBlurRef.current = true
              onTabEdit(item, field, e.shiftKey)
            }
          }}
          onBlur={() => {
            // Skip blur if Tab just fired (Tab handler already committed)
            if (skipBlurRef.current) {
              skipBlurRef.current = false
              return
            }
            onCommitEdit()
          }}
          step={isNumeric ? 'any' : undefined}
          className="w-full h-full border-2 border-stride-600 rounded-[3px] px-1.5 py-0.5 text-xs outline-none bg-stride-50"
        />
      </td>
    )
  }

  return (
    <td
      className={className}
      onDoubleClick={() => onStartEdit(item, field)}
      style={{
        background: isFlashing ? '#dcfce7' : undefined,
        transition: 'background 0.3s',
        cursor: 'default',
      }}
    >
      {displayValue}
      {children}
    </td>
  )
}
