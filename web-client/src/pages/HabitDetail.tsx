// HabitDetail — full history page for a single habit.
// Route: /habits/:id
// Shows stats row, levels card, level breakdown, 13-week heatmap, and recent log.

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import { todayString, getMondayOf } from '../utils/dates'
import { fetchHabits, fetchHabitLogs, updateHabit, deleteHabit } from '../api'
import type { HabitWithLog, HabitLog, CreateHabitInput } from '../types'
import AddHabitSheet from '../components/habits/AddHabitSheet'

/* ─── Helpers ───────────────────────────────────────────────────────────── */

// Shifts a YYYY-MM-DD string by `days`.
function shiftDay(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Formats "Sat, Mar 7" from a YYYY-MM-DD string.
function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

const LEVEL_COLORS = ['#e5e7eb', '#4f46e5', '#10b981', '#f59e0b']
const LEVEL_BG     = ['', '#e0e7ff', '#d1fae5', '#fef3c7']
const LEVEL_TEXT   = ['', '#4338ca', '#065f46', '#92400e']
const DAY_LETTERS  = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTH_NAMES  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* ─── HabitDetail ───────────────────────────────────────────────────────── */

export default function HabitDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const habitId = parseInt(id ?? '0', 10)
  const today = todayString()

  const [habit, setHabit] = useState<HabitWithLog | null>(null)
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)

  // Heatmap covers the last 13 weeks (Mon-aligned).
  const HEATMAP_WEEKS = 13
  const heatmapStartMonday = getMondayOf(shiftDay(today, -(HEATMAP_WEEKS - 1) * 7))

  // Load habit stats and logs in parallel on mount.
  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchHabits(today),
      fetchHabitLogs(habitId, heatmapStartMonday, today),
    ])
      .then(([habits, logData]) => {
        const found = habits.find(h => h.id === habitId)
        if (!found) { setError('Habit not found'); return }
        setHabit(found)
        setLogs(logData)
      })
      .catch(() => setError('Failed to load habit'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitId])

  /* ─── Edit / delete ─────────────────────────────────────────────────── */

  const handleSave = async (input: CreateHabitInput) => {
    if (!habit) return
    try {
      await updateHabit(habit.id, input)
      setSheetOpen(false)
      const habits = await fetchHabits(today)
      const found = habits.find(h => h.id === habitId)
      if (found) setHabit(found)
    } catch { /* ignore */ }
  }

  const handleDelete = async () => {
    if (!habit) return
    try {
      await deleteHabit(habit.id)
      navigate('/habits')
    } catch { /* ignore */ }
  }

  /* ─── Derived data ──────────────────────────────────────────────────── */

  // date → level map for O(1) heatmap lookup.
  const logMap = new Map<string, number>()
  for (const l of logs) logMap.set(l.date, l.level)

  // Level counts for breakdown (last 30 days).
  const recentCutoff = shiftDay(today, -29)
  const recentLogs = logs.filter(l => l.date >= recentCutoff && l.date <= today)
  const levelCounts = [0, 0, 0, 0]
  for (const l of recentLogs) levelCounts[l.level]++
  levelCounts[0] = 30 - recentLogs.length  // missed = 30 - logged days

  // Heatmap grid: 13 rows × 7 columns.
  const heatmapRows = Array.from({ length: HEATMAP_WEEKS }, (_, w) => {
    const weekMon = shiftDay(heatmapStartMonday, w * 7)
    const weekDate = new Date(weekMon + 'T00:00:00')
    const monthLabel = (w === 0 || weekDate.getDate() <= 7)
      ? MONTH_NAMES[weekDate.getMonth()]
      : ''
    const cells = Array.from({ length: 7 }, (_, d) => {
      const date = shiftDay(weekMon, d)
      const isFut = date > today
      const lvl = isFut ? -1 : (logMap.get(date) ?? 0)
      return { date, lvl, isTod: date === today }
    })
    return { monthLabel, cells }
  })

  // Last 14 days for the recent log list (newest first).
  const recentDays = Array.from({ length: 14 }, (_, i) => shiftDay(today, -i))

  /* ─── Render ────────────────────────────────────────────────────────── */

  if (loading) return <div className="px-6 py-8 text-sm text-gray-400">Loading…</div>

  if (error || !habit) {
    return (
      <div className="px-6 py-8 text-sm text-red-600">
        {error || 'Habit not found.'}
        <button onClick={() => navigate('/habits')} className="ml-3 text-stride-600 underline">
          Back
        </button>
      </div>
    )
  }

  const maxLevels = habit.level3_label ? 3 : habit.level2_label ? 2 : 1
  const levelLabels = [habit.level1_label, habit.level2_label, habit.level3_label]

  return (
    <div className="pb-16">
      {/* ── Sticky header ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="flex items-center px-6 gap-3" style={{ height: 56 }}>
          <button
            onClick={() => navigate('/habits')}
            className="p-1 -ml-1 rounded-md hover:bg-gray-100 text-gray-500 flex items-center"
            aria-label="Back to Habits"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-400">Habits</span>
          <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-sm font-semibold text-gray-900 truncate">
            {habit.emoji && <span className="mr-1">{habit.emoji}</span>}
            {habit.name}
          </span>
          <button
            onClick={() => setSheetOpen(true)}
            className="ml-auto text-xs font-semibold text-stride-600 hover:text-stride-700 px-3 py-1.5 rounded-lg hover:bg-stride-50 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 py-4">

        {/* Stats row */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-gray-900 flex items-center justify-center gap-1">
                🔥 {habit.current_streak}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Current streak</div>
            </div>
            <div className="border-l border-gray-100">
              <div className="text-xl font-bold text-gray-900">{habit.longest_streak}</div>
              <div className="text-xs text-gray-400 mt-0.5">Longest streak</div>
            </div>
            <div className="border-l border-gray-100">
              <div className="text-xl font-bold text-stride-600">{habit.consistency_30d}%</div>
              <div className="text-xs text-gray-400 mt-0.5">Last 30 days</div>
            </div>
            <div className="border-l border-gray-100">
              <div
                className="text-xl font-bold"
                style={{ color: LEVEL_COLORS[Math.min(3, Math.floor(habit.avg_level_30d))] }}
              >
                {habit.avg_level_30d.toFixed(1)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Avg level</div>
            </div>
          </div>
        </div>

        {/* Two-column: Levels + Level breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">

          {/* Levels card — definition view (no current/next indicators) */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Levels</p>
            <div className="space-y-2">
              {([1, 2, 3] as const).slice(0, maxLevels).map(lv => (
                <div key={lv} className="flex items-center gap-3 p-2 rounded-md">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: LEVEL_COLORS[lv] }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 900, color: 'white' }}>{lv}</span>
                  </div>
                  <span className="text-sm text-gray-700 flex-1">{levelLabels[lv - 1]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Level breakdown — horizontal bar chart, last 30 days */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Level breakdown <span className="font-normal text-gray-300">· last 30 days</span>
            </p>
            <div className="space-y-2.5">
              {([1, 2, 3] as const).slice(0, maxLevels).map(lv => (
                <div key={lv} className="flex items-center gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: LEVEL_COLORS[lv] }}
                  >
                    <span style={{ fontSize: 8, fontWeight: 900, color: 'white' }}>{lv}</span>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ background: LEVEL_COLORS[lv], width: `${Math.round(levelCounts[lv] / 30 * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 w-5 text-right">{levelCounts[lv]}</span>
                </div>
              ))}
              {/* Missed row */}
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span style={{ fontSize: 9, color: '#9ca3af' }}>–</span>
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gray-300 rounded-full"
                    style={{ width: `${Math.round(levelCounts[0] / 30 * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-400 w-5 text-right">{levelCounts[0]}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            History <span className="font-normal text-gray-300">· last {HEATMAP_WEEKS} weeks</span>
          </p>
          {/* Day letter header */}
          <div className="flex gap-1 mb-1.5 ml-8">
            {DAY_LETTERS.map((l, i) => (
              <div key={i} className="text-[9px] text-gray-300 flex-1 text-center">{l}</div>
            ))}
          </div>
          {/* Grid */}
          <div className="space-y-1 overflow-x-auto">
            {heatmapRows.map(({ monthLabel, cells }, w) => (
              <div key={w} className="flex gap-1" style={{ minWidth: 'max-content' }}>
                <div className="text-[9px] text-gray-300 w-7 text-right flex items-center justify-end flex-shrink-0">
                  {monthLabel}
                </div>
                {cells.map(({ date, lvl, isTod }) => (
                  <div
                    key={date}
                    className={`flex-1 h-5 rounded-sm ${isTod ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                    style={{ background: lvl < 0 ? '#f3f4f6' : LEVEL_COLORS[lvl], minWidth: 20 }}
                    title={date}
                  />
                ))}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
            <div className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200" />
            <span className="text-[10px] text-gray-400">Miss</span>
            {([1, 2, 3] as const).slice(0, maxLevels).map(lv => (
              <span key={lv} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm ml-1" style={{ background: LEVEL_COLORS[lv] }} />
                <span className="text-[10px] text-gray-400">L{lv}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Recent log */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recent</p>
          </div>
          <div>
            {recentDays.map((date, i) => {
              const lvl = logMap.get(date) ?? 0
              const label = date === today ? 'Today' : formatDate(date)
              return (
                <div
                  key={date}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i < recentDays.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <span className="text-xs text-gray-400 w-28 flex-shrink-0">{label}</span>
                  {lvl > 0 ? (
                    <>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: LEVEL_BG[lvl], color: LEVEL_TEXT[lvl] }}
                      >
                        {lvl === 3 && maxLevels === 3 ? 'L3 ✦' : `L${lvl}`}
                      </span>
                      <span className="text-xs text-gray-500 truncate">{levelLabels[lvl - 1]}</span>
                    </>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                      Missed
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Edit sheet */}
      <AddHabitSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        editHabit={habit}
        onDelete={handleDelete}
      />
    </div>
  )
}
