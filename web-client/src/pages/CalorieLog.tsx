// CalorieLog page — main view with Daily and Weekly tabs.
// Daily tab: fetches the daily summary (items + settings + computed totals)
// and renders the date header, summary panel, item table, bottom sheet, FAB,
// and context menu. Manages state for date navigation, sheet open/close,
// inline editing, and context menu actions (edit in modal, duplicate, delete).
// Weekly tab: renders WeeklySummary; row clicks switch back to Daily for that date.

import { useState, useEffect } from 'react'
import {
  fetchWeekSummary, createCalorieLogItem, updateCalorieLogItem, deleteCalorieLogItem,
  type WeekDaySummary, type CalorieLogItem,
} from '../api'
import { useDailySummary } from '../hooks/useDailySummary'
import { todayString, getMondayOf } from '../utils/dates'
import { ITEM_TYPES } from '../constants'
import DateHeader from '../components/calorie-log/DateHeader'
import DailySummary from '../components/calorie-log/DailySummary'
import ItemTable from '../components/calorie-log/ItemTable'
import AddItemSheet from '../components/calorie-log/AddItemSheet'
import FloatingActionButton from '../components/calorie-log/FloatingActionButton'
import ContextMenu from '../components/calorie-log/ContextMenu'
import WeeklySummary from '../components/calorie-log/WeeklySummary'

export default function CalorieLog() {
  // Active tab — Daily shows the per-day log; Weekly shows the summary view.
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily')

  const [date, setDate] = useState(todayString)
  const { summary, loading, reload: loadSummary } = useDailySummary(date)
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

  // Week data — fetched here so WeeklySummary can be a pure presentational component
  const [weekStart, setWeekStart] = useState(() => getMondayOf(todayString()))
  const [weekData, setWeekData] = useState<WeekDaySummary[]>([])
  const [weekLoading, setWeekLoading] = useState(false)
  const [weekError, setWeekError] = useState<string | null>(null)

  // Synchronous setState here is safe — weekLoading/weekError are not in the dep
  // array so there's no cascade risk. The rule fires but the pattern is correct.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeekLoading(true)
    setWeekError(null)
    fetchWeekSummary(weekStart)
      .then(data => { setWeekData(data); setWeekLoading(false) })
      .catch((e: Error) => { setWeekError(e.message); setWeekLoading(false) })
  }, [weekStart])

  /* ─── Item creation (inline add + bottom sheet) ────────────────────── */

  // Inline add — create item from the column-aligned inline row.
  const handleInlineAdd = async (type: string, fields: {
    name: string; qty: number | null; uom: string | null; calories: number
    protein_g: number | null; carbs_g: number | null; fat_g: number | null
  }) => {
    // Validate type to prevent silent cast of invalid values to the union type.
    if (!ITEM_TYPES.includes(type as CalorieLogItem['type'])) {
      setError('Invalid item type')
      return
    }
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-24">

      {/* Segment control — always visible regardless of tab or load state */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
        {(['daily', 'weekly'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors
              ${tab === t ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'daily' ? 'Daily' : 'Weekly'}
          </button>
        ))}
      </div>

      {/* ── Weekly tab ─────────────────────────────────────────────────── */}
      {tab === 'weekly' && (
        <WeeklySummary
          days={weekData}
          loading={weekLoading}
          error={weekError}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          onNavigateToDay={d => { setDate(d); setTab('daily') }}
        />
      )}

      {/* ── Daily tab ──────────────────────────────────────────────────── */}
      {tab === 'daily' && (
        <>
          {/* Loading state (only on initial load before any summary is cached) */}
          {loading && !summary && (
            <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
          )}

          {error && !summary && (
            <div className="py-8 text-center text-red-500 text-sm">{error}</div>
          )}

          {summary && (
            <>
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
            </>
          )}

          <AddItemSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            onSave={handleSheetSave}
            editItem={editItem}
            defaultType={sheetType}
          />

          {/* FAB only shown on daily tab */}
          <FloatingActionButton onClick={handleFabClick} />
        </>
      )}

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
