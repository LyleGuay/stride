// ProgressTab — weekly progress view for the habit tracker.
// Shows a week navigator, a summary card with per-day level bars + stats,
// and a habit list with dot strips. Expanded cards show streak/breakdown/heatmap.

import { useState, useEffect } from 'react'
import { getMondayOf, shiftWeek, formatWeekRange, todayString } from '../../utils/dates'
import { fetchHabitsWeek, fetchHabitLogs } from '../../api'
import type { HabitWeekEntry, HabitLog } from '../../types'

/* ─── Helpers ───────────────────────────────────────────────────────────── */

// Shifts a YYYY-MM-DD by `days`.
function shiftDay(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const LEVEL_COLORS = ['#e5e7eb', '#4f46e5', '#10b981', '#f59e0b']

// Returns the 7 YYYY-MM-DD dates for a week starting at `mondayStr`.
function weekDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDay(mondayStr, i))
}

// Looks up a log for a specific date from a log array.
function logForDate(logs: HabitLog[], date: string): HabitLog | undefined {
  return logs.find(l => l.date === date)
}

/* ─── Props ─────────────────────────────────────────────────────────────── */

interface Props {
  onViewDetail: (habitId: number) => void
}

/* ─── ProgressTab ───────────────────────────────────────────────────────── */

export default function ProgressTab({ onViewDetail }: Props) {
  const today = todayString()

  const [weekStart, setWeekStart] = useState(() => getMondayOf(today))
  const [entries, setEntries] = useState<HabitWeekEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Set of expanded habit IDs in the progress list.
  const [expandedIds, setExpandedIds] = useState(new Set<number>())
  // Cache of fetched logs for expanded habits (for mini heatmap). Map: habitId → logs.
  const [expandedLogs, setExpandedLogs] = useState(new Map<number, HabitLog[]>())

  const isCurrentWeek = weekStart === getMondayOf(today)
  const dates = weekDates(weekStart)

  // Re-fetch when weekStart changes.
  useEffect(() => {
    let cancelled = false
    fetchHabitsWeek(weekStart)
      .then(data => { if (!cancelled) { setEntries(data); setLoading(false) } })
      .catch(() => { if (!cancelled) { setError('Failed to load progress'); setLoading(false) } })
    return () => { cancelled = true }
  }, [weekStart])

  /* ─── Week navigation ─────────────────────────────────────────────────── */

  const navigateWeek = (next: string) => {
    setWeekStart(next)
    setLoading(true)
    setError('')
  }

  const goToPrevWeek = () => navigateWeek(shiftWeek(weekStart, -1))
  const goToNextWeek = () => {
    const next = shiftWeek(weekStart, 1)
    if (next <= getMondayOf(today)) navigateWeek(next)
  }

  /* ─── Expand / collapse ───────────────────────────────────────────────── */

  const toggleExpand = async (habitId: number) => {
    const next = new Set(expandedIds)
    if (next.has(habitId)) {
      next.delete(habitId)
    } else {
      next.add(habitId)
      // Lazily fetch 8 weeks of logs for mini heatmap if not yet cached.
      if (!expandedLogs.has(habitId)) {
        const from = shiftDay(getMondayOf(today), -7 * 8 + 1)
        fetchHabitLogs(habitId, from, today)
          .then(logs => setExpandedLogs(prev => new Map(prev).set(habitId, logs)))
          .catch(() => {/* silently skip — heatmap will show empty */})
      }
    }
    setExpandedIds(next)
  }

  /* ─── Weekly summary stats ────────────────────────────────────────────── */

  // Compute per-day max level across all habits for the summary bar row.
  const dayMaxLevels: (0 | 1 | 2 | 3)[] = dates.map(date => {
    let max = 0
    for (const { logs } of entries) {
      const l = logForDate(logs, date)
      if (l && l.level > max) max = l.level
    }
    return max as 0 | 1 | 2 | 3
  })

  // Count days on track (at least one habit logged) among non-future days.
  const totalDays = dates.filter(d => d <= today).length
  const daysHit = dayMaxLevels.filter((l, i) => dates[i] <= today && l > 0).length
  const allLevels = entries.flatMap(({ logs }) => logs.map(l => l.level))
  const avgLevel = allLevels.length
    ? (allLevels.reduce((a, b) => a + b, 0) / allLevels.length).toFixed(1)
    : '—'
  const completionPct = totalDays > 0 ? Math.round(daysHit / totalDays * 100) : 0

  return (
    <div className="px-4 pt-4 max-w-2xl mx-auto pb-12">
      {/* ── Week navigator pill ─────────────────────────────────────────── */}
      <div className="flex items-center justify-center mb-4">
        <div className="flex items-center bg-gray-100 rounded-full px-1 py-1">
          <button
            onClick={goToPrevWeek}
            className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center"
            aria-label="Previous week"
            data-testid="progress-prev-week"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          <div className="flex items-center justify-center px-3 min-w-[200px]" data-testid="progress-week-label">
            <span className="text-sm font-semibold text-gray-800">{formatWeekRange(weekStart)}</span>
            {isCurrentWeek && (
              <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full ml-2 leading-none">
                now
              </span>
            )}
          </div>

          <button
            onClick={goToNextWeek}
            disabled={isCurrentWeek}
            className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next week"
            data-testid="progress-next-week"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading && <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>}

      {!loading && (
        <>
          {/* ── Weekly summary card ───────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4" data-testid="progress-summary-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">This week</p>
              {isCurrentWeek && (
                <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                  in progress
                </span>
              )}
            </div>

            {/* Per-day colored bar row */}
            <div className="flex gap-2 mb-4">
              {dates.map((date, i) => {
                const isFut = date > today
                const isTod = date === today
                const lvl = dayMaxLevels[i]
                return (
                  <div key={date} className="flex-1 flex flex-col items-center gap-1.5">
                    <div
                      className="w-full h-2 rounded-full"
                      style={isFut
                        ? { background: '#f3f4f6', border: '1.5px dashed #d1d5db' }
                        : { background: lvl > 0 ? LEVEL_COLORS[lvl] : '#e5e7eb' }}
                    />
                    <span className={`text-[10px] font-semibold ${isTod ? 'text-stride-600' : 'text-gray-400'}`}>
                      {DAY_LETTERS[i]}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 text-center border-t border-gray-100 pt-3">
              <div>
                <div className="text-lg font-bold text-gray-900">
                  {daysHit}<span className="text-sm font-medium text-gray-400"> / {totalDays}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">Days on track</div>
              </div>
              <div>
                <div className="text-lg font-bold text-stride-600">{completionPct}%</div>
                <div className="text-[10px] text-gray-400 mt-0.5">Completion</div>
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-500">{avgLevel}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">Avg level</div>
              </div>
            </div>
          </div>

          {/* ── Habit list ─────────────────────────────────────────────── */}
          {entries.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Habits</p>
              <div className="space-y-2">
                {entries.map(({ habit, logs }) => (
                  <ProgressHabitCard
                    key={habit.id}
                    habit={habit}
                    logs={logs}
                    dates={dates}
                    today={today}
                    isCurrentWeek={isCurrentWeek}
                    expanded={expandedIds.has(habit.id)}
                    heatmapLogs={expandedLogs.get(habit.id)}
                    onToggle={() => toggleExpand(habit.id)}
                    onViewDetail={() => onViewDetail(habit.id)}
                  />
                ))}
              </div>
            </>
          )}

          {entries.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">No habits yet.</div>
          )}
        </>
      )}
    </div>
  )
}

/* ─── ProgressHabitCard ─────────────────────────────────────────────────── */

interface ProgressHabitCardProps {
  habit: HabitWeekEntry['habit']
  logs: HabitLog[]
  dates: string[]
  today: string
  isCurrentWeek: boolean
  expanded: boolean
  heatmapLogs: HabitLog[] | undefined
  onToggle: () => void
  onViewDetail: () => void
}

function ProgressHabitCard({
  habit, logs, dates, today, isCurrentWeek, expanded, heatmapLogs, onToggle, onViewDetail,
}: ProgressHabitCardProps) {
  // Compute week stats.
  const weekLogs = logs.filter(l => dates.includes(l.date))
  const daysLogged = weekLogs.length
  const totalDays = dates.filter(d => d <= today).length
  const streak = habit.current_streak ?? 0    // comes from HabitWithLog stats
  const avgLvl = weekLogs.length
    ? (weekLogs.reduce((s, l) => s + l.level, 0) / weekLogs.length).toFixed(1)
    : '—'

  // Build per-day level array for dot strip.
  const dayLevels = dates.map(date => logForDate(logs, date)?.level ?? null)

  /* ── Dot strip ────────────────────────────────────────────────────── */
  const dotStrip = habit.frequency === 'weekly' ? (
    // Weekly: fill target slots in chronological order.
    (() => {
      const completions = weekLogs
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(l => ({ lvl: l.level, day: DAY_LETTERS[dates.indexOf(l.date)] }))
      return Array.from({ length: habit.weekly_target ?? 1 }, (_, slot) => {
        const comp = completions[slot]
        return (
          <div key={slot} className="flex flex-col items-center gap-0.5">
            <div
              className="w-4 h-4 rounded-sm"
              style={{ background: comp ? LEVEL_COLORS[comp.lvl] : '#e5e7eb' }}
            />
            <span style={{ fontSize: 8, color: '#9ca3af' }}>{comp?.day ?? ''}</span>
          </div>
        )
      })
    })()
  ) : (
    // Daily: 7 dots, one per day.
    dates.map((date, i) => {
      const lvl = dayLevels[i]
      const isFut = date > today
      const isTod = date === today
      return (
        <div key={date} className="flex flex-col items-center gap-0.5">
          <div
            className="w-4 h-4 rounded-sm"
            style={isFut
              ? { background: '#f3f4f6', border: '1.5px dashed #d1d5db' }
              : { background: lvl != null && lvl > 0 ? LEVEL_COLORS[lvl] : '#e5e7eb' }}
          />
          <span style={{ fontSize: 8, color: isTod && isCurrentWeek ? '#4f46e5' : '#9ca3af', fontWeight: isTod && isCurrentWeek ? 700 : 400 }}>
            {DAY_LETTERS[i]}
          </span>
        </div>
      )
    })
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-3 py-3 cursor-pointer select-none" onClick={onToggle}>
        {/* Emoji + name + dot strip */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {habit.emoji && <span className="text-sm">{habit.emoji}</span>}
            <span className="text-sm font-medium text-gray-800">{habit.name}</span>
            {habit.frequency === 'weekly' && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {weekLogs.length}/{habit.weekly_target}×/wk
              </span>
            )}
          </div>
          <div className="flex gap-1.5">{dotStrip}</div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-right flex-shrink-0 mr-1">
          <div>
            <div className="text-sm font-bold text-gray-800">
              {daysLogged}/{habit.frequency === 'weekly' ? (habit.weekly_target ?? 1) : totalDays}
            </div>
            <div className="text-[10px] text-gray-400">days</div>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-800">🔥 {streak}</div>
            <div className="text-[10px] text-gray-400">streak</div>
          </div>
          <div>
            <div className="text-sm font-bold text-emerald-500">{avgLvl}</div>
            <div className="text-[10px] text-gray-400">avg lvl</div>
          </div>
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* 4-cell mini stats */}
          <div className="grid grid-cols-4 border-b border-gray-100">
            {[
              { label: 'Streak',  value: `🔥 ${streak}`,          color: '' },
              { label: 'Longest', value: `${habit.longest_streak ?? 0}`, color: '' },
              { label: '30-day %', value: `${habit.consistency_30d ?? 0}%`, color: 'text-stride-600' },
              { label: 'Avg level', value: `${(habit.avg_level_30d ?? 0).toFixed(1)}`, color: 'text-emerald-500' },
            ].map((stat, i) => (
              <div key={i} className={`py-3 text-center ${i < 3 ? 'border-r border-gray-100' : ''}`}>
                <div className={`text-sm font-bold text-gray-900 ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Level breakdown bars */}
          <LevelBreakdown habit={habit} logs={heatmapLogs ?? []} />

          {/* Mini heatmap — 8 weeks */}
          <MiniHeatmap logs={heatmapLogs} />

          {/* View full history link */}
          <div className="px-4 pb-3">
            <button
              onClick={onViewDetail}
              className="text-xs font-semibold text-stride-600 hover:text-stride-700 flex items-center gap-1"
            >
              View full history
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── LevelBreakdown ─────────────────────────────────────────────────────── */

function LevelBreakdown({ habit, logs }: { habit: HabitWeekEntry['habit']; logs: HabitLog[] }) {
  // Filter to last 30 days.
  const today = todayString()
  const cutoff = shiftDay(today, -30)
  const recent = logs.filter(l => l.date >= cutoff && l.date <= today)
  const missed = 30 - recent.length

  const counts = [0, 0, 0, 0]
  for (const l of recent) counts[l.level]++
  counts[0] = missed

  const maxCount = Math.max(...counts.filter((_, i) => i > 0), 1)

  const rows: Array<{ label: string; color: string; textColor: string; count: number; pct: number }> = [
    { label: 'L1', color: '#4f46e5', textColor: '#4f46e5', count: counts[1], pct: Math.round(counts[1] / 30 * 100) },
    { label: 'L2', color: '#10b981', textColor: '#10b981', count: counts[2], pct: Math.round(counts[2] / 30 * 100) },
    { label: 'L3', color: '#f59e0b', textColor: '#f59e0b', count: counts[3], pct: Math.round(counts[3] / 30 * 100) },
    { label: '–',  color: '#d1d5db', textColor: '#9ca3af', count: counts[0], pct: Math.round(counts[0] / 30 * 100) },
  ]
  const levels = habit.level3_label ? 3 : habit.level2_label ? 2 : 1

  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Level breakdown · last 30 days
      </p>
      <div className="space-y-1.5">
        {rows.slice(0, levels + 1).map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ background: i < levels ? row.color : '#e5e7eb' }}
            >
              <span style={{ fontSize: 7, fontWeight: 900, color: i < levels ? 'white' : '#9ca3af' }}>
                {i < levels ? i + 1 : '–'}
              </span>
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  background: i < levels ? row.color : '#d1d5db',
                  width: `${maxCount > 0 ? Math.round(row.count / maxCount * 100) : 0}%`,
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-gray-500 w-4 text-right">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── MiniHeatmap ────────────────────────────────────────────────────────── */

function MiniHeatmap({ logs }: { logs: HabitLog[] | undefined }) {
  const today = todayString()
  const WEEKS = 8

  // Build a map of date → level.
  const logMap = new Map<string, number>()
  if (logs) {
    for (const l of logs) logMap.set(l.date, l.level)
  }

  // Start from Monday 8 weeks ago.
  const startMonday = shiftDay(getMondayOf(today), -(WEEKS - 1) * 7)

  const rows = Array.from({ length: WEEKS }, (_, w) => {
    const weekMon = shiftDay(startMonday, w * 7)
    const weekDate = new Date(weekMon + 'T00:00:00')
    const monthLabel = w === 0 || weekDate.getDate() <= 7
      ? weekDate.toLocaleDateString('en-US', { month: 'short' })
      : ''
    const cells = Array.from({ length: 7 }, (_, d) => {
      const date = shiftDay(weekMon, d)
      const isFut = date > today
      const lvl = isFut ? -1 : (logMap.get(date) ?? 0)
      return { date, lvl }
    })
    return { monthLabel, cells }
  })

  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Last 8 weeks</p>
      <div className="space-y-1">
        {rows.map(({ monthLabel, cells }, w) => (
          <div key={w} className="flex gap-1">
            <div className="text-[8px] text-gray-300 w-5 text-right flex items-center justify-end flex-shrink-0">
              {monthLabel}
            </div>
            {cells.map(({ date, lvl }) => (
              <div
                key={date}
                className="flex-1 h-3.5 rounded-sm"
                style={{ background: lvl < 0 ? '#f3f4f6' : LEVEL_COLORS[lvl] }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
