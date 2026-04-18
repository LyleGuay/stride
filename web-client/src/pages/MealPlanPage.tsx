// MealPlanPage — the top-level Meal Planning module page.
// Manages week navigation state and the add/edit entry sheet.
// Passes all data and callbacks down to WeeklyGrid (presentational).

import { useState, useCallback } from 'react'
import { useSidebar } from '../components/SidebarContext'
import { useMealPlanWeek } from '../hooks/useMealPlanWeek'
import { getMondayOf, shiftWeek, formatWeekRange } from '../utils/dates'
import { fetchFavorites } from '../api'
import { useEffect } from 'react'
import type { MealPlanEntry, CopyWeekInput, CalorieLogFavorite, CreateMealPlanEntryInput, UpdateMealPlanEntryInput } from '../types'
import WeeklyGrid from '../components/meal-plan/WeeklyGrid'
import MealPlanEntrySheet from '../components/meal-plan/MealPlanEntrySheet'

export default function MealPlanPage() {
  const { setOpen: setSidebarOpen } = useSidebar()

  // Week navigation — defaults to the current week (Monday of today).
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date().toISOString().split('T')[0]))
  const { entries, loading, error, addEntry, updateEntry, deleteEntry, copyFromLastWeek } = useMealPlanWeek(weekStart)

  // Entry sheet state.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDay, setSheetDay] = useState('')
  const [sheetMealType, setSheetMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast')
  const [editEntry, setEditEntry] = useState<MealPlanEntry | null>(null)

  // Favorites — fetched once for MealPlanEntrySheet.
  const [favorites, setFavorites] = useState<CalorieLogFavorite[]>([])
  useEffect(() => {
    fetchFavorites().then(setFavorites).catch(() => {})
  }, [])

  // Handlers passed to WeeklyGrid.

  const handleAdd = useCallback((day: string, mealType: string) => {
    setEditEntry(null)
    setSheetDay(day)
    setSheetMealType(mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack')
    setSheetOpen(true)
  }, [])

  const handleEdit = useCallback((entry: MealPlanEntry) => {
    setEditEntry(entry)
    setSheetDay(entry.date)
    setSheetMealType(entry.meal_type)
    setSheetOpen(true)
  }, [])

  const handleDelete = useCallback((id: number) => {
    deleteEntry(id).catch(() => {})
  }, [deleteEntry])

  const handleCopyWeek = useCallback((input: CopyWeekInput) => {
    copyFromLastWeek(input).catch(() => {})
  }, [copyFromLastWeek])

  const handleSheetSave = useCallback(async (input: CreateMealPlanEntryInput | UpdateMealPlanEntryInput) => {
    if (editEntry) {
      await updateEntry(editEntry.id, input as UpdateMealPlanEntryInput)
    } else {
      await addEntry({ ...input as CreateMealPlanEntryInput, date: sheetDay, meal_type: sheetMealType })
    }
    setSheetOpen(false)
  }, [editEntry, updateEntry, addEntry, sheetDay, sheetMealType])

  // Week summary: sum calories and macros across all entries.
  const totalCalories = entries.reduce((sum, e) => sum + (e.calories ?? 0), 0)
  const totalProtein  = entries.reduce((sum, e) => sum + (e.protein_g ?? 0), 0)
  const totalCarbs    = entries.reduce((sum, e) => sum + (e.carbs_g ?? 0), 0)
  const totalFat      = entries.reduce((sum, e) => sum + (e.fat_g ?? 0), 0)

  return (
    <div className="flex flex-col h-screen">
      {/* ── Sticky module header ─────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shrink-0" style={{ height: 56 }}>
        <div className="h-full flex items-center px-4 gap-3">
          {/* Hamburger — mobile only */}
          <button
            className="lg:hidden p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          <h1 className="text-base font-semibold text-gray-800 shrink-0">Meal Planning</h1>

          {/* Week navigator capsule — centered */}
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center bg-gray-100 rounded-full px-1 py-1">
              <button
                onClick={() => setWeekStart(w => shiftWeek(w, -1))}
                className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center"
                aria-label="Previous week"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-gray-800 px-3 min-w-[160px] text-center">
                {formatWeekRange(weekStart)}
              </span>
              <button
                onClick={() => setWeekStart(w => shiftWeek(w, 1))}
                className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center"
                aria-label="Next week"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Week summary strip ──────────────────────────────────────── */}
      {!loading && !error && (
        <div className="bg-white border-b border-gray-100 px-5 py-2 shrink-0">
          <div className="flex items-center gap-5 text-xs text-gray-500 flex-wrap">
            <span className="font-semibold text-gray-700 text-sm">{totalCalories.toLocaleString()} kcal</span>
            <span>{Math.round(totalProtein)}g protein</span>
            <span>{Math.round(totalCarbs)}g carbs</span>
            <span>{Math.round(totalFat)}g fat</span>
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
        )}
        {error && (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">{error}</div>
        )}
        {!loading && !error && (
          <WeeklyGrid
            weekStart={weekStart}
            entries={entries}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCopyWeek={handleCopyWeek}
          />
        )}
      </div>

      {/* ── Add / Edit sheet ────────────────────────────────────────── */}
      <MealPlanEntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        day={sheetDay || weekStart}
        mealType={sheetMealType}
        entry={editEntry ?? undefined}
        onSave={handleSheetSave}
        favorites={favorites}
      />
    </div>
  )
}
