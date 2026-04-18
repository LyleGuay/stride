/*
 * WeeklyGrid — the main weekly meal planning view.
 *
 * Renders two layouts driven by a single data/prop surface:
 *   - Desktop (≥ sm): scrollable 7-column table with 4 meal rows, macro expand
 *     rows, and a sticky row-label column.
 *   - Mobile (< sm): day-tab strip with a single-day vertical meal section list.
 *
 * Also owns the CopyWeekModal (local component) and the week summary strip.
 */

import { useState, useRef, useEffect } from 'react'
import type { MealPlanEntry, CopyWeekInput } from '../../types'
import { MEAL_PLAN_MEAL_TYPES } from '@stride/shared'
import { todayString, dayLabel, formatWeekRange } from '../../utils/dates'

/* ─── Prop types ─────────────────────────────────────────────────────────── */

interface Props {
  weekStart: string             // YYYY-MM-DD (Monday)
  entries: MealPlanEntry[]
  onAdd: (day: string, mealType: string) => void
  onEdit: (entry: MealPlanEntry) => void
  onDelete: (id: number) => void
  onCopyWeek: (input: CopyWeekInput) => void
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

// Color swatches for each meal type row label and mobile section header.
const MEAL_COLORS: Record<string, string> = {
  breakfast: 'bg-orange-400',
  lunch:     'bg-yellow-400',
  dinner:    'bg-indigo-400',
  snack:     'bg-green-400',
}

// Left-border accent for entry cards, matching meal type color.
const MEAL_BORDER_COLORS: Record<string, string> = {
  breakfast: 'border-l-orange-400',
  lunch:     'border-l-yellow-400',
  dinner:    'border-l-indigo-400',
  snack:     'border-l-green-400',
}

// Human-readable meal labels.
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  snack:     'Snacks',
}

/* ─── Utility helpers ────────────────────────────────────────────────────── */

// Returns the 7 YYYY-MM-DD dates for the week starting at weekStart (Monday).
function weekDates(weekStart: string): string[] {
  const dates: string[] = []
  const base = new Date(weekStart + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
  }
  return dates
}

// Returns a YYYY-MM-DD date shifted by offsetDays from a base date string.
function shiftDate(dateStr: string, offsetDays: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Formats a date as "Mon Apr 14" for column headers.
function shortDateLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

// Returns the display name (item_name or takeout_name) for an entry.
function entryDisplayName(entry: MealPlanEntry): string {
  if (entry.entry_type === 'takeout') return entry.takeout_name ?? 'Takeout'
  return entry.item_name ?? 'Unnamed'
}

// Returns the calorie value to display for an entry.
// Takeout entries show the calorie_limit; others show calories.
function entryCalories(entry: MealPlanEntry): number | null {
  if (entry.entry_type === 'takeout') return entry.calorie_limit
  return entry.calories
}

// Sums a macro field across a list of entries, returning null when all are null.
function sumMacro(entries: MealPlanEntry[], field: 'protein_g' | 'carbs_g' | 'fat_g'): number | null {
  const vals = entries.map(e => e[field]).filter((v): v is number => v !== null)
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null
}

/* ─── Entry card ─────────────────────────────────────────────────────────── */

/*
 * EntryCard renders a single meal plan entry with a left color-border accent,
 * item name, type badge, calories, and a ··· context menu for Edit/Delete.
 * The context menu is click-toggled (not hover) for reliability on mobile.
 */
interface EntryCardProps {
  entry: MealPlanEntry
  mealType: string
  onEdit: (entry: MealPlanEntry) => void
  onDelete: (id: number) => void
}

function EntryCard({ entry, mealType, onEdit, onDelete }: EntryCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the context menu when the user clicks outside of it.
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const displayName = entryDisplayName(entry)
  const calories    = entryCalories(entry)
  const borderColor = MEAL_BORDER_COLORS[mealType] ?? 'border-l-gray-300'

  return (
    <div
      className={`group relative bg-white rounded-lg border border-gray-200 border-l-4 ${borderColor} px-2 py-1.5 mb-1 flex items-center justify-between gap-1.5`}
    >
      {/* Item name and type badge */}
      <div className="flex-1 min-w-0">
        <div className="text-gray-800 text-xs font-medium leading-snug break-words">
          {displayName}
        </div>
        {/* Type badge — only for takeout and recipe; food needs no badge */}
        {entry.entry_type === 'takeout' && (
          <span className="inline-flex items-center gap-0.5 text-xs bg-amber-100 text-amber-600 rounded px-1 py-0 mt-0.5">
            ≤{entry.calorie_limit ?? '?'} kcal
          </span>
        )}
        {entry.entry_type === 'recipe' && (
          <span className="inline-flex items-center gap-0.5 text-xs bg-violet-100 text-violet-600 rounded px-1 py-0 mt-0.5">
            Recipe
          </span>
        )}
      </div>

      {/* Calories + context menu */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-gray-500">
          {calories !== null ? `${calories}` : '—'}
        </span>

        {/* ··· button — always visible on mobile, hover-visible on desktop */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o) }}
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            aria-label="Entry options"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-50 bg-white border border-gray-200 rounded-lg shadow-md min-w-[110px]">
              <button
                onClick={() => { setMenuOpen(false); onEdit(entry) }}
                className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-t-lg"
              >
                Edit
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(entry.id) }}
                className="block w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-b-lg"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Copy Week Modal ────────────────────────────────────────────────────── */

/*
 * CopyWeekModal — lets the user choose which days and meal types to copy from
 * the previous week. All checkboxes are checked by default.
 * Calls onCopyWeek({ source_week, target_week, days, meal_types }) on confirm.
 */
interface CopyWeekModalProps {
  weekStart: string
  onCopyWeek: (input: CopyWeekInput) => void
  onClose: () => void
}

// Short labels for the 7-day checkbox columns (Mon–Sun).
const DAY_LABELS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function CopyWeekModal({ weekStart, onCopyWeek, onClose }: CopyWeekModalProps) {
  // Track which days (0–6) and meal types are selected; all on by default.
  const [selectedDays, setSelectedDays]       = useState<Set<number>>(new Set([0,1,2,3,4,5,6]))
  const [selectedMeals, setSelectedMeals]     = useState<Set<string>>(new Set(MEAL_PLAN_MEAL_TYPES))

  const allSelected = selectedDays.size === 7 && selectedMeals.size === MEAL_PLAN_MEAL_TYPES.length

  function toggleAll() {
    if (allSelected) {
      setSelectedDays(new Set())
      setSelectedMeals(new Set())
    } else {
      setSelectedDays(new Set([0,1,2,3,4,5,6]))
      setSelectedMeals(new Set(MEAL_PLAN_MEAL_TYPES))
    }
  }

  function toggleDay(d: number) {
    setSelectedDays(prev => {
      const next = new Set(prev)
      if (next.has(d)) { next.delete(d) } else { next.add(d) }
      return next
    })
  }

  function toggleMeal(m: string) {
    setSelectedMeals(prev => {
      const next = new Set(prev)
      if (next.has(m)) { next.delete(m) } else { next.add(m) }
      return next
    })
  }

  function handleCopy() {
    onCopyWeek({
      source_week: shiftDate(weekStart, -7),
      target_week: weekStart,
      days:        Array.from(selectedDays).sort((a, b) => a - b),
      meal_types:  MEAL_PLAN_MEAL_TYPES.filter(m => selectedMeals.has(m)),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Modal header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Copy from last week</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Choose which meal slots to copy into {formatWeekRange(weekStart)}.
          </p>
        </div>

        {/* Select all / deselect all */}
        <div className="px-5 pt-3">
          <button
            onClick={toggleAll}
            className="text-xs text-stride-600 hover:underline"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        {/* 4×7 checkbox grid — rows = meal types, columns = days */}
        <div className="px-5 pt-2 pb-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {/* Empty corner cell */}
                <th className="w-20 text-left pb-2 text-gray-500 font-medium">Meal</th>
                {DAY_LABELS_SHORT.map((d, i) => (
                  <th key={i} className="text-center pb-2 text-gray-500 font-medium w-8">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_PLAN_MEAL_TYPES.map(meal => (
                <tr key={meal} className="border-t border-gray-100">
                  {/* Meal label with toggle — clicking the label toggles the whole row */}
                  <td className="py-2 pr-2">
                    <button
                      onClick={() => toggleMeal(meal)}
                      className="flex items-center gap-1.5 text-gray-700"
                    >
                      <div className={`w-2 h-2 rounded-full ${MEAL_COLORS[meal]}`} />
                      <span className={selectedMeals.has(meal) ? 'text-gray-800 font-medium' : 'text-gray-400'}>
                        {MEAL_LABELS[meal]}
                      </span>
                    </button>
                  </td>
                  {[0,1,2,3,4,5,6].map(d => (
                    <td key={d} className="text-center py-2">
                      <input
                        type="checkbox"
                        checked={selectedDays.has(d) && selectedMeals.has(meal)}
                        onChange={() => {
                          // Toggling a cell: if the meal row is off, turn it on first,
                          // then ensure the day is toggled. This keeps row/column state
                          // in sync without a separate 2D grid state.
                          if (!selectedMeals.has(meal)) {
                            setSelectedMeals(prev => new Set([...prev, meal]))
                          }
                          toggleDay(d)
                        }}
                        className="rounded border-gray-300 text-stride-600 cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer buttons */}
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            disabled={selectedDays.size === 0 || selectedMeals.size === 0}
            className="px-4 py-2 text-sm text-white bg-stride-600 rounded-lg hover:bg-stride-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export default function WeeklyGrid({ weekStart, entries, onAdd, onEdit, onDelete, onCopyWeek }: Props) {
  // Which day is selected on mobile (0-indexed offset from weekStart).
  const [activeMobileDayIdx, setActiveMobileDayIdx] = useState<number>(() => {
    // Default to today if it falls in this week, otherwise Monday.
    const today = todayString()
    const dates = weekDates(weekStart)
    const idx   = dates.indexOf(today)
    return idx >= 0 ? idx : 0
  })

  // Which meal type rows have their macro sub-row expanded.
  const [expandedMacros, setExpandedMacros] = useState<Set<string>>(new Set())

  // Whether the copy-week modal is open.
  const [copyModalOpen, setCopyModalOpen] = useState(false)

  const today = todayString()
  const dates = weekDates(weekStart)

  // Sync mobile active day when weekStart changes (e.g. user navigates weeks).
  // If today is in the new week, jump to it; otherwise reset to Monday.
  useEffect(() => {
    const idx = dates.indexOf(today)
    setActiveMobileDayIdx(idx >= 0 ? idx : 0)
    // weekStart is the only dependency — recompute when the week changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  function toggleMacroRow(mealType: string) {
    setExpandedMacros(prev => {
      const next = new Set(prev)
      if (next.has(mealType)) { next.delete(mealType) } else { next.add(mealType) }
      return next
    })
  }

  // Entries for a specific date + meal type, sorted by sort_order.
  function cellEntries(date: string, mealType: string): MealPlanEntry[] {
    return entries
      .filter(e => e.date === date && e.meal_type === mealType)
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  // Total calories for a given date across all meal types.
  function dayCalories(date: string): number {
    return entries
      .filter(e => e.date === date)
      .reduce((sum, e) => sum + (entryCalories(e) ?? 0), 0)
  }

  // Week-level macro/calorie totals for the summary strip.
  const weekCalories = dates.reduce((sum, d) => sum + dayCalories(d), 0)
  const weekProtein  = sumMacro(entries, 'protein_g')
  const weekCarbs    = sumMacro(entries, 'carbs_g')
  const weekFat      = sumMacro(entries, 'fat_g')

  // Number of days that have at least one entry — shown in the summary strip.
  const plannedDays = dates.filter(d => entries.some(e => e.date === d)).length

  /* ── Week summary strip ─────────────────────────────────────────────── */

  const SummaryStrip = (
    <div className="bg-white border-b border-gray-200 px-4 sm:px-5 py-2.5 flex items-center gap-4 flex-shrink-0 flex-wrap">
      <div className="text-xs text-gray-400 uppercase tracking-wide">Week total</div>
      <div className="font-semibold text-gray-900 text-sm">
        {weekCalories > 0 ? weekCalories.toLocaleString() : '—'} kcal
      </div>
      <div className="w-px h-4 bg-gray-200 hidden sm:block" />
      <div className="flex gap-4 text-xs">
        <div>
          <span className="font-semibold text-blue-600">{weekProtein !== null ? `${Math.round(weekProtein)}g` : '—'}</span>{' '}
          <span className="text-gray-400">Protein</span>
        </div>
        <div>
          <span className="font-semibold text-amber-500">{weekCarbs !== null ? `${Math.round(weekCarbs)}g` : '—'}</span>{' '}
          <span className="text-gray-400">Carbs</span>
        </div>
        <div>
          <span className="font-semibold text-pink-500">{weekFat !== null ? `${Math.round(weekFat)}g` : '—'}</span>{' '}
          <span className="text-gray-400">Fat</span>
        </div>
      </div>
      <div className="ml-auto text-xs text-gray-400">{plannedDays} of 7 days planned</div>
    </div>
  )

  /* ── Desktop grid ───────────────────────────────────────────────────── */

  const DesktopGrid = (
    <div className="hidden sm:block flex-1 overflow-auto">
      <table className="border-collapse" style={{ minWidth: 700, width: '100%' }}>
        <thead>
          <tr className="border-b-2 border-gray-200">
            {/* Sticky row-label spacer */}
            <th className="sticky left-0 z-20 w-20 border-r border-gray-200 bg-white" />
            {dates.map((date) => {
              const isToday    = date === today
              const cals       = dayCalories(date)
              const headerBg   = isToday ? 'bg-stride-50' : 'bg-white'
              return (
                <th
                  key={date}
                  className={`sticky top-0 z-10 px-2 py-2 text-left font-normal border-r border-gray-100 align-top ${headerBg}`}
                  style={{ width: 'calc((100% - 80px) / 7)' }}
                >
                  {/* Day name row — today gets a blue dot indicator */}
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-semibold ${isToday ? 'text-stride-600' : 'text-gray-400'}`}>
                      {dayLabel(date).toUpperCase()}
                    </span>
                    {isToday && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />}
                  </div>
                  <div className={`text-xs mt-0.5 ${isToday ? 'text-stride-400' : 'text-gray-400'}`}>
                    {shortDateLabel(date)}{isToday ? ' · Today' : ''}
                  </div>
                  {/* Daily calorie total */}
                  {cals > 0 ? (
                    <div className={`text-xs font-semibold mt-1 ${isToday ? 'text-stride-700' : 'text-stride-600'}`}>
                      {cals.toLocaleString()} kcal
                    </div>
                  ) : (
                    <div className="text-xs text-gray-300 mt-1">—</div>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {MEAL_PLAN_MEAL_TYPES.map((mealType) => {
            const macroExpanded = expandedMacros.has(mealType)
            return (
              <>
                {/* ── Meal row ────────────────────────────────────── */}
                <tr key={mealType} className="border-b border-gray-100">
                  {/* Sticky row label */}
                  <td className="sticky left-0 z-10 bg-white border-r border-gray-200 px-2 py-2 align-top w-20">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${MEAL_COLORS[mealType]}`} />
                        <span className="text-xs font-semibold text-gray-600">
                          {MEAL_LABELS[mealType]}
                        </span>
                      </div>
                      {/* Toggle macro sub-row */}
                      <button
                        onClick={() => toggleMacroRow(mealType)}
                        className="text-gray-300 hover:text-gray-500 ml-1 transition-colors"
                        aria-label={macroExpanded ? 'Hide macros' : 'Show macros'}
                      >
                        <svg
                          className={`w-3.5 h-3.5 transition-transform duration-150 ${macroExpanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </td>

                  {/* One cell per day */}
                  {dates.map((date) => {
                    const isToday   = date === today
                    const cellBg    = isToday ? 'bg-stride-50/20' : ''
                    const dayMeals  = cellEntries(date, mealType)
                    return (
                      <td
                        key={date}
                        className={`px-2 py-2 align-top border-r border-gray-100 ${cellBg}`}
                      >
                        <div className="space-y-1.5">
                          {dayMeals.map(entry => (
                            <EntryCard
                              key={entry.id}
                              entry={entry}
                              mealType={mealType}
                              onEdit={onEdit}
                              onDelete={onDelete}
                            />
                          ))}
                          {/* Add button — dashed border, shown below any existing cards */}
                          <button
                            data-testid="meal-add-btn"
                            data-meal={mealType}
                            {...(isToday && { 'data-today': 'true' })}
                            onClick={() => onAdd(date, mealType)}
                            className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-stride-600 hover:bg-stride-50 border border-dashed border-gray-200 hover:border-stride-300 rounded-md py-1.5 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add
                          </button>
                        </div>
                      </td>
                    )
                  })}
                </tr>

                {/* ── Macro expand sub-row (hidden unless toggled) ─ */}
                {macroExpanded && (
                  <tr key={`${mealType}-macros`} className="bg-gray-50/60 border-b border-gray-100">
                    <td className="sticky left-0 z-10 bg-gray-50/60 border-r border-gray-200 px-3 py-1 text-right">
                      <span className="text-xs text-gray-400">P / C / F</span>
                    </td>
                    {dates.map((date) => {
                      const isToday  = date === today
                      const cellBg   = isToday ? 'bg-stride-50/20' : ''
                      const dayMeals = cellEntries(date, mealType)
                      const p = sumMacro(dayMeals, 'protein_g')
                      const c = sumMacro(dayMeals, 'carbs_g')
                      const f = sumMacro(dayMeals, 'fat_g')
                      const hasMacros = p !== null || c !== null || f !== null
                      return (
                        <td key={date} className={`px-2 py-1 border-r border-gray-100 text-xs ${cellBg}`}>
                          {hasMacros ? (
                            <>
                              <span className="text-blue-400">{p !== null ? `${Math.round(p)}g` : '—'}</span>
                              {' · '}
                              <span className="text-amber-400">{c !== null ? `${Math.round(c)}g` : '—'}</span>
                              {' · '}
                              <span className="text-pink-400">{f !== null ? `${Math.round(f)}g` : '—'}</span>
                            </>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  /* ── Mobile layout ──────────────────────────────────────────────────── */

  const activeDate = dates[activeMobileDayIdx] ?? dates[0]
  const activeDayCalories = dayCalories(activeDate)

  const MobileLayout = (
    <div className="block sm:hidden flex-1 overflow-y-auto">
      {/* Day tab strip — 7 pill tabs M T W T F S S */}
      <div className="flex gap-1.5 px-4 pt-3 pb-2 overflow-x-auto no-scrollbar">
        {dates.map((date, i) => {
          const isActive = i === activeMobileDayIdx
          const isToday  = date === today
          return (
            <button
              key={date}
              onClick={() => setActiveMobileDayIdx(i)}
              className={`relative flex-shrink-0 w-9 h-9 rounded-full text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-stride-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              aria-label={`${dayLabel(date)} ${shortDateLabel(date)}`}
            >
              {/* First letter of day abbreviation (Mon→M, Tue→T, etc.) */}
              {dayLabel(date)[0]}
              {/* Blue dot for today */}
              {isToday && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-blue-500 border-2 border-white" />
              )}
            </button>
          )
        })}
      </div>

      {/* Active day title + calorie total */}
      <div className="px-4 pb-3">
        <div className="text-sm font-semibold text-gray-900">
          {dayLabel(activeDate)}, {shortDateLabel(activeDate)}
          {activeDate === today && <span className="ml-1.5 text-xs text-stride-600 font-medium">Today</span>}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {activeDayCalories > 0 ? `${activeDayCalories.toLocaleString()} kcal planned` : 'No meals planned'}
        </div>
      </div>

      {/* Vertical meal sections */}
      <div className="px-4 space-y-4 pb-6">
        {MEAL_PLAN_MEAL_TYPES.map((mealType) => {
          const dayMeals = cellEntries(activeDate, mealType)
          return (
            <div key={mealType}>
              {/* Meal section header with color swatch and add button */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${MEAL_COLORS[mealType]}`} />
                  <span className="text-sm font-semibold text-gray-700">{MEAL_LABELS[mealType]}</span>
                </div>
                <button
                  onClick={() => onAdd(activeDate, mealType)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-stride-50 text-gray-500 hover:text-stride-600 transition-colors"
                  aria-label={`Add ${MEAL_LABELS[mealType]}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* Entry cards for this meal slot */}
              {dayMeals.length > 0 ? (
                dayMeals.map(entry => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    mealType={mealType}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))
              ) : (
                <div className="text-xs text-gray-400 italic px-1">Nothing planned</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Week summary bar — shown on both layouts */}
      {SummaryStrip}

      {/* "Copy from last week" button — above the grid, right-aligned, desktop only */}
      <div className="hidden sm:flex items-center justify-end px-5 py-2 border-b border-gray-100 bg-white flex-shrink-0">
        <button
          onClick={() => setCopyModalOpen(true)}
          className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-md px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors"
        >
          Copy from last week
        </button>
      </div>

      {/* Desktop grid (hidden on mobile) */}
      {DesktopGrid}

      {/* Mobile layout (hidden on desktop) */}
      {MobileLayout}

      {/* Copy week modal */}
      {copyModalOpen && (
        <CopyWeekModal
          weekStart={weekStart}
          onCopyWeek={onCopyWeek}
          onClose={() => setCopyModalOpen(false)}
        />
      )}
    </div>
  )
}
