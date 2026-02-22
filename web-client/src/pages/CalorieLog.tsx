// CalorieLog page — main daily view. Fetches the daily summary (items +
// settings + computed totals) and renders the date header, summary panel,
// item table, bottom sheet, FAB, and context menu. Manages state for date
// navigation, sheet open/close, inline editing, and context menu actions
// (edit in modal, duplicate, delete).

import { useState, useEffect, useCallback } from 'react'
import {
  fetchDailySummary, createCalorieLogItem, updateCalorieLogItem, deleteCalorieLogItem,
  type DailySummary as DailySummaryData, type CalorieLogItem,
} from '../api'
import DateHeader from '../components/calorie-log/DateHeader'
import DailySummary from '../components/calorie-log/DailySummary'
import ItemTable from '../components/calorie-log/ItemTable'
import AddItemSheet from '../components/calorie-log/AddItemSheet'
import FloatingActionButton from '../components/calorie-log/FloatingActionButton'
import ContextMenu from '../components/calorie-log/ContextMenu'

// Returns today's date as a YYYY-MM-DD string in local time.
// Intentionally avoids toISOString() which returns UTC and would show the
// wrong date for users east of UTC after midnight.
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CalorieLog() {
  const [date, setDate] = useState(today)
  const [summary, setSummary] = useState<DailySummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Bottom sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetType, setSheetType] = useState('snack')
  const [editItem, setEditItem] = useState<CalorieLogItem | null>(null)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    item: CalorieLogItem
    x: number
    y: number
  } | null>(null)

  // Fetch the daily summary whenever the date changes.
  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchDailySummary(date)
      setSummary(data)
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { loadSummary() }, [loadSummary])

  /* ─── Item creation (inline add + bottom sheet) ────────────────────── */

  // Inline add — create item from the column-aligned inline row.
  const handleInlineAdd = async (type: string, fields: {
    name: string; qty: number | null; uom: string | null; calories: number
    protein_g: number | null; carbs_g: number | null; fat_g: number | null
  }) => {
    try {
      await createCalorieLogItem({
        date, item_name: fields.name, type: type as CalorieLogItem['type'],
        calories: fields.calories, qty: fields.qty,
        uom: fields.uom as CalorieLogItem['uom'],
        protein_g: fields.protein_g, carbs_g: fields.carbs_g, fat_g: fields.fat_g,
      })
      loadSummary()
    } catch {
      setError('Failed to add item')
    }
  }

  // Save from the bottom sheet — creates or updates depending on editItem.
  const handleSheetSave = async (item: {
    item_name: string; type: string; qty: number | null; uom: string | null;
    calories: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
  }) => {
    try {
      if (editItem) {
        // Edit mode — update existing item
        await updateCalorieLogItem(editItem.id, {
          ...item, type: item.type as CalorieLogItem['type'],
        })
      } else {
        // Create mode — new item
        await createCalorieLogItem({
          ...item, date, type: item.type as CalorieLogItem['type'],
        })
      }
      setSheetOpen(false)
      loadSummary()
    } catch {
      setError('Failed to save item')
    }
  }

  // FAB opens the sheet with a default type.
  const handleFabClick = () => {
    setSheetType('snack')
    setEditItem(null)
    setSheetOpen(true)
  }

  /* ─── Inline cell editing ──────────────────────────────────────────── */

  // Called by ItemTable when a cell edit is committed (double-click → Enter/Tab/blur).
  const handleUpdateItem = async (id: number, field: string, value: unknown): Promise<boolean> => {
    try {
      await updateCalorieLogItem(id, {
        [field]: value,
      } as Partial<Omit<CalorieLogItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>>)
      loadSummary()
      return true
    } catch {
      return false
    }
  }

  /* ─── Context menu actions ─────────────────────────────────────────── */

  // Open context menu (from right-click or mobile "···" button).
  const handleItemAction = (item: CalorieLogItem, position: { x: number; y: number }) => {
    setCtxMenu({ item, ...position })
  }

  const closeCtxMenu = () => setCtxMenu(null)

  // "Edit item..." — open the bottom sheet pre-filled with the item's data.
  const handleCtxEdit = () => {
    if (!ctxMenu) return
    setEditItem(ctxMenu.item)
    setSheetType(ctxMenu.item.type)
    setSheetOpen(true)
    closeCtxMenu()
  }

  // "Duplicate" — create a copy of the item.
  const handleCtxDuplicate = async () => {
    if (!ctxMenu) return
    const src = ctxMenu.item
    closeCtxMenu()
    try {
      await createCalorieLogItem({
        date: src.date, item_name: src.item_name, type: src.type,
        qty: src.qty, uom: src.uom, calories: src.calories,
        protein_g: src.protein_g, carbs_g: src.carbs_g, fat_g: src.fat_g,
      })
      loadSummary()
    } catch {
      setError('Failed to duplicate item')
    }
  }

  // "Delete" — remove the item.
  const handleCtxDelete = async () => {
    if (!ctxMenu) return
    const id = ctxMenu.item.id
    closeCtxMenu()
    try {
      await deleteCalorieLogItem(id)
      loadSummary()
    } catch {
      setError('Failed to delete item')
    }
  }

  /* ─── Render ───────────────────────────────────────────────────────── */

  // Loading state (only on initial load)
  if (loading && !summary) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  if (error && !summary) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center text-red-500 text-sm">
        {error}
      </div>
    )
  }

  if (!summary) return null

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-24">
      <DateHeader date={date} onDateChange={setDate} />
      <DailySummary summary={summary} />
      <ItemTable
        items={summary.items}
        netCalories={summary.net_calories}
        netProtein={summary.protein_g}
        netCarbs={summary.carbs_g}
        netFat={summary.fat_g}
        onInlineAdd={handleInlineAdd}
        onUpdateItem={handleUpdateItem}
        onItemAction={handleItemAction}
      />
      <AddItemSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSheetSave}
        editItem={editItem}
        defaultType={sheetType}
      />
      <FloatingActionButton onClick={handleFabClick} />

      {/* Context menu — rendered when an item is right-clicked or "···" is tapped */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={handleCtxEdit}
          onDuplicate={handleCtxDuplicate}
          onDelete={handleCtxDelete}
          onClose={closeCtxMenu}
        />
      )}
    </div>
  )
}
