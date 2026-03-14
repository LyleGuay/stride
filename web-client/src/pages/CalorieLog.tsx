// CalorieLog page — main view with Daily, Weekly, and Progress tabs.
// Daily tab: fetches the daily summary (items + settings + computed totals)
// and renders the date header, summary panel, item table, bottom sheet, FAB,
// and context menu. Manages state for date navigation, sheet open/close,
// inline editing, and context menu actions (edit in modal, duplicate, delete,
// save as favorite). Also loads the favorites list used by InlineAddRow and AddItemSheet.
// Weekly tab: renders WeeklySummary; row clicks switch back to Daily for that date.
// Progress tab: renders ProgressView with calorie trend chart, weight log, and stats.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import {
  fetchWeekSummary, createCalorieLogItem, updateCalorieLogItem, deleteCalorieLogItem,
  fetchProgress, fetchEarliestLogDate, fetchWeightLog,
  upsertWeightEntry, updateWeightEntry, deleteWeightEntry,
  fetchFavorites, createFavorite, deleteFavorite,
  type WeekSummaryResponse, type CalorieLogItem, type ProgressResponse, type WeightEntry,
  type CalorieLogFavorite,
} from '../api'
import { useDailySummary } from '../hooks/useDailySummary'
import { useSidebar } from '../components/SidebarContext'
import { todayString, getMondayOf, shiftWeek, formatWeekRange } from '../utils/dates'
import { getRangeDates, RANGE_LABELS, type ProgressRange } from '../utils/progressGrouping'
import { ITEM_TYPES } from '../constants'
import DateHeader from '../components/calorie-log/DateHeader'
import DailySummary from '../components/calorie-log/DailySummary'
import ItemTable from '../components/calorie-log/ItemTable'
import AddItemSheet from '../components/calorie-log/AddItemSheet'
import FloatingActionButton from '../components/calorie-log/FloatingActionButton'
import ContextMenu from '../components/calorie-log/ContextMenu'
import WeeklySummary from '../components/calorie-log/WeeklySummary'
import ProgressView from '../components/calorie-log/ProgressView'
import ManageFavoritesModal from '../components/calorie-log/ManageFavoritesModal'
import RecipeIngredientsModal from '../components/calorie-log/RecipeIngredientsModal'
import MobileModuleHeader, { type TabDef } from '../components/MobileModuleHeader'

/* ─── CalorieLog ─────────────────────────────────────────────────────────── */

export default function CalorieLog() {
  // Active tab — Daily shows the per-day log; Weekly shows the summary view;
  // Progress shows calorie trends and weight history.
  const [tab, setTab] = useState<'daily' | 'weekly' | 'progress'>('daily')

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

  // Favorites — loaded once on mount, reloaded after create/delete.
  // An empty array is the safe default; missing favorites just means an empty dropdown.
  const [favorites, setFavorites] = useState<CalorieLogFavorite[]>([])
  const loadFavorites = () => {
    fetchFavorites()
      .then(setFavorites)
      .catch(() => { /* non-critical; empty list is acceptable */ })
  }

  // Manage favorites modal state
  const [manageFavoritesOpen, setManageFavoritesOpen] = useState(false)

  // Recipe ingredients modal — open when user clicks the recipe icon on an item.
  const [recipeModal, setRecipeModal] = useState<{ recipeId: number } | null>(null)

  // Week data — fetched here so WeeklySummary can be a pure presentational component
  const [weekStart, setWeekStart] = useState(() => getMondayOf(todayString()))
  const [weekData, setWeekData] = useState<WeekSummaryResponse | null>(null)
  const [weekLoading, setWeekLoading] = useState(false)
  const [weekError, setWeekError] = useState<string | null>(null)

  // Progress tab state
  const [progressRange, setProgressRange] = useState<ProgressRange>('month')
  const [progressData, setProgressData] = useState<ProgressResponse | null>(null)
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([])
  const [progressLoading, setProgressLoading] = useState(false)
  const [progressError, setProgressError] = useState<string | null>(null)
  // Fetched once on mount — used to compute the "All Time" range start date.
  // undefined = not yet fetched; null = no items exist; string = earliest date.
  const [earliestLogDate, setEarliestLogDate] = useState<string | null | undefined>(undefined)

  // Fetch weekly data when the Weekly tab becomes active or the week changes.
  // Gating on tab==='weekly' avoids showing stale data when items are added
  // on the Daily tab then the user switches to Weekly.
  // Synchronous setState here is safe — weekLoading/weekError are not in the dep
  // array so there's no cascade risk. The rule fires but the pattern is correct.
  useEffect(() => {
    if (tab !== 'weekly') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeekLoading(true)
    setWeekError(null)
    fetchWeekSummary(weekStart)
      .then(data => { setWeekData(data); setWeekLoading(false) })
      .catch((e: Error) => { setWeekData(null); setWeekError(e.message); setWeekLoading(false) })
  }, [tab, weekStart])

  // Fetch the earliest log date once on mount — used to set the "All Time" range start.
  useEffect(() => {
    fetchEarliestLogDate()
      .then(r => setEarliestLogDate(r.date))
      .catch(() => setEarliestLogDate(null))
  }, [])

  // Load favorites once on mount — refreshed after any create/delete.
  useEffect(() => { loadFavorites() }, [])

  // Fetch progress data whenever the progress tab is active or the range changes.
  // Wait for earliestLogDate to resolve (undefined means still loading) before fetching.
  useEffect(() => {
    if (tab !== 'progress' || earliestLogDate === undefined) return
    const { start, end } = getRangeDates(progressRange, earliestLogDate)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgressLoading(true)
    setProgressError(null)
    // Fetch weight from 30 days before the calorie range so that pre-period
    // entries can act as interpolation anchors in the weight chart (especially
    // useful for 1M when the user hasn't logged weight yet this month).
    const weightStart = (() => {
      const d = new Date(start + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() - 30)
      return d.toISOString().slice(0, 10)
    })()
    Promise.all([fetchProgress(start, end), fetchWeightLog(weightStart, end)])
      .then(([prog, weights]) => {
        setProgressData(prog)
        setWeightEntries(weights)
        setProgressLoading(false)
      })
      .catch((e: Error) => {
        setProgressError(e.message)
        setProgressLoading(false)
      })
  }, [tab, progressRange, earliestLogDate])

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

  // "Save as Favorite" — save the context menu item as a new favorite template.
  const handleCtxFavorite = async () => {
    if (!ctxMenu) return
    const src = ctxMenu.item
    closeCtxMenu()
    try {
      await createFavorite({
        item_name: src.item_name,
        type: src.type,
        qty: src.qty,
        uom: src.uom,
        calories: src.calories,
        protein_g: src.protein_g,
        carbs_g: src.carbs_g,
        fat_g: src.fat_g,
      })
      loadFavorites()
    } catch {
      // Non-critical — silently fail rather than interrupting the user
    }
  }

  // Delete a favorite from the Manage Favorites modal.
  const handleDeleteFavorite = async (id: number) => {
    try {
      await deleteFavorite(id)
      loadFavorites()
    } catch {
      // Non-critical
    }
  }

  /* ─── Weight log actions (Progress tab) ───────────────────────────── */

  // Refetch both progress data and weight entries after any weight mutation.
  const refetchProgress = () => {
    const { start, end } = getRangeDates(progressRange, earliestLogDate ?? null)
    const weightStart = (() => {
      const d = new Date(start + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() - 30)
      return d.toISOString().slice(0, 10)
    })()
    Promise.all([fetchProgress(start, end), fetchWeightLog(weightStart, end)])
      .then(([prog, weights]) => { setProgressData(prog); setWeightEntries(weights) })
      .catch(() => { /* non-critical; stale data is acceptable */ })
  }

  const handleLogWeight = async (date: string, lbs: number) => {
    await upsertWeightEntry(date, lbs)
    refetchProgress()
  }

  const handleUpdateWeight = async (id: number, date: string, lbs: number) => {
    await updateWeightEntry(id, { date, weight_lbs: lbs })
    refetchProgress()
  }

  const handleDeleteWeight = async (id: number) => {
    await deleteWeightEntry(id)
    refetchProgress()
  }

  /* ─── Render ───────────────────────────────────────────────────────── */

  const { start: progressStart, end: progressEnd } = getRangeDates(progressRange, earliestLogDate ?? null)
  const userUnits = summary?.settings?.units ?? 'imperial'
  const { setOpen: setSidebarOpen } = useSidebar()
  const navigate = useNavigate()

  return (
    <div className="pb-24">

      {/* ── Sticky header: tabs + conditional date nav ─────────────────── */}
      <div className="sticky top-0 z-20 bg-white">

        {/* Mobile header — module name + tab dropdown (hidden on desktop) */}
        {(() => {
          const calTabs: TabDef[] = [
            { value: 'daily',    label: 'Daily',    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
            { value: 'weekly',   label: 'Weekly',   icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
            { value: 'progress', label: 'Progress', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg> },
          ]
          return (
            <div className="lg:hidden">
              <MobileModuleHeader
                moduleName="Calorie Log"
                tabs={calTabs}
                activeTab={tab}
                onTabChange={t => setTab(t as typeof tab)}
                onOpenSidebar={() => setSidebarOpen(true)}
              />
            </div>
          )
        })()}

        {/* Desktop tab row — underline style, hidden on mobile */}
        <div className="hidden lg:flex items-end px-6 border-b border-gray-200" style={{ height: 56 }}>
          {/* Daily tab */}
          <button
            onClick={() => setTab('daily')}
            className={`px-4 h-full flex items-center gap-1.5 text-sm -mb-px transition-colors border-b-[3px] ${
              tab === 'daily'
                ? 'font-semibold text-gray-900 border-gray-900'
                : 'font-medium text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Daily
          </button>

          {/* Weekly tab */}
          <button
            onClick={() => setTab('weekly')}
            className={`px-4 h-full flex items-center gap-1.5 text-sm -mb-px transition-colors border-b-[3px] ${
              tab === 'weekly'
                ? 'font-semibold text-gray-900 border-gray-900'
                : 'font-medium text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Weekly
          </button>

          {/* Progress tab */}
          <button
            onClick={() => setTab('progress')}
            className={`px-4 h-full flex items-center gap-1.5 text-sm -mb-px transition-colors border-b-[3px] ${
              tab === 'progress'
                ? 'font-semibold text-gray-900 border-gray-900'
                : 'font-medium text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            Progress
          </button>
        </div>

        {/* Tab sub-header — date/week navigator or range selector depending on active tab */}
        <div className="border-b border-gray-200">
          {tab === 'daily' && (
            <DateHeader date={date} onDateChange={setDate} />
          )}
          {tab === 'weekly' && (() => {
            const isCurrentWeek = getMondayOf(todayString()) === weekStart
            return (
              <div className="flex items-center justify-center py-2.5">
                <div className="flex items-center bg-gray-100 rounded-full px-1 py-1">
                  <button
                    onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
                    className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center"
                    aria-label="Previous week"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  {/* Fixed-width center so the capsule doesn't jump as the week label changes */}
                  <div className="flex items-center justify-center px-2 min-w-[196px]">
                    <span className="text-sm font-semibold text-gray-800">{formatWeekRange(weekStart)}</span>
                    {isCurrentWeek && (
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full ml-2 leading-none">now</span>
                    )}
                  </div>
                  <button
                    onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
                    disabled={isCurrentWeek}
                    className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center disabled:text-gray-300 disabled:cursor-not-allowed"
                    aria-label="Next week"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })()}
          {tab === 'progress' && (
            <div className="flex items-center justify-center py-2.5">
              <div className="flex items-center bg-gray-100 rounded-full px-1 py-1">
                {(Object.keys(RANGE_LABELS) as ProgressRange[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setProgressRange(r)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      progressRange === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {RANGE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 py-4">

      {/* ── Weekly tab ─────────────────────────────────────────────────── */}
      {tab === 'weekly' && (
        <WeeklySummary
          days={weekData?.days ?? []}
          estimatedWeightChangeLbs={weekData?.estimated_weight_change_lbs}
          loading={weekLoading}
          error={weekError}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          onNavigateToDay={d => { setDate(d); setTab('daily') }}
          settings={summary?.settings ?? null}
        />
      )}

      {/* ── Progress tab ───────────────────────────────────────────────── */}
      {tab === 'progress' && (
        <ProgressView
          range={progressRange}
          progressData={progressData}
          weightEntries={weightEntries}
          loading={progressLoading}
          error={progressError}
          rangeStart={progressStart}
          rangeEnd={progressEnd}
          onLogWeight={handleLogWeight}
          onUpdateWeight={handleUpdateWeight}
          onDeleteWeight={handleDeleteWeight}
          units={userUnits}
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
                onOpenIngredients={item => setRecipeModal({ recipeId: item.recipe_id! })}
                favorites={favorites}
                onManageFavorites={() => setManageFavoritesOpen(true)}
              />
            </>
          )}

          <AddItemSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            onSave={handleSheetSave}
            editItem={editItem}
            defaultType={sheetType}
            favorites={favorites}
            onManageFavorites={() => setManageFavoritesOpen(true)}
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
          onFavorite={handleCtxFavorite}
          onDelete={handleCtxDelete}
          onClose={closeCtxMenu}
          recipeId={ctxMenu.item.recipe_id}
          onOpenRecipe={ctxMenu.item.recipe_id != null
            ? () => navigate(`/recipes/${ctxMenu.item.recipe_id}`)
            : undefined
          }
        />
      )}

      {/* Manage Favorites modal — accessible from FavoritesDropdown footer */}
      <ManageFavoritesModal
        open={manageFavoritesOpen}
        favorites={favorites}
        onDelete={handleDeleteFavorite}
        onClose={() => setManageFavoritesOpen(false)}
      />

      {/* Recipe ingredients modal — opened by clicking the recipe icon on an item */}
      {recipeModal && (
        <RecipeIngredientsModal
          recipeId={recipeModal.recipeId}
          onClose={() => setRecipeModal(null)}
        />
      )}
      </div>{/* end max-w-3xl content */}
    </div>
  )
}
