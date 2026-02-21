// CalorieLog page — main daily view. Fetches the daily summary (items +
// settings + computed totals) and renders the date header, summary panel,
// item table, bottom sheet, and FAB. Manages state for date navigation,
// sheet open/close, and item creation.

import { useState, useEffect, useCallback } from 'react'
import {
  fetchDailySummary, createCalorieLogItem,
  type DailySummary as DailySummaryData, type CalorieLogItem,
} from '../api'
import DateHeader from '../components/calorie-log/DateHeader'
import DailySummary from '../components/calorie-log/DailySummary'
import ItemTable from '../components/calorie-log/ItemTable'
import AddItemSheet from '../components/calorie-log/AddItemSheet'
import FloatingActionButton from '../components/calorie-log/FloatingActionButton'

// Returns today's date as a YYYY-MM-DD string.
function today(): string {
  return new Date().toISOString().split('T')[0]
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

  // Inline add — create item with just name + calories for the given meal type.
  const handleInlineAdd = async (type: string, name: string, calories: number) => {
    try {
      await createCalorieLogItem({
        date, item_name: name, type: type as CalorieLogItem['type'],
        calories, qty: null, uom: null, protein_g: null, carbs_g: null, fat_g: null,
      })
      loadSummary()
    } catch {
      setError('Failed to add item')
    }
  }

  // Open the bottom sheet for a specific meal type (from inline add "···" or FAB).
  const handleOpenSheet = (type: string) => {
    setSheetType(type)
    setEditItem(null)
    setSheetOpen(true)
  }

  // Save from the bottom sheet — creates a new item with full details.
  const handleSheetSave = async (item: {
    item_name: string; type: string; qty: number | null; uom: string | null;
    calories: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
  }) => {
    try {
      await createCalorieLogItem({
        ...item, date, type: item.type as CalorieLogItem['type'],
      })
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
        onInlineAdd={handleInlineAdd}
        onOpenSheet={handleOpenSheet}
      />
      <AddItemSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSheetSave}
        editItem={editItem}
        defaultType={sheetType}
      />
      <FloatingActionButton onClick={handleFabClick} />
    </div>
  )
}
