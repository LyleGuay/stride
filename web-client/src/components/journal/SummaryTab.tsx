// SummaryTab — journal summary with range selector, mental-state bar chart,
// clickable emotion/type frequency bars with drill-down, and stats row.
// onNavigateToDay switches the parent to the Daily tab at the given date.
//
// Range selector: Week | Month | 6M | 1yr
// Sub-navigator (week/month only): ← week/month → with date range label.
// Bar chart: MentalStateBarChart. Clicking a week/month bar shows a dark
//   tooltip; clicking a 6m/1yr bar zooms in to Week view for that week.
// Drill-down: tapping an emotion or entry-type bar fetches and shows matching
//   days lazily (only on first tap per tag).
// Stats row: Days logged + Total entries for the period.

import { useState } from 'react'
import { useJournalSummary } from '../../hooks/useJournalSummary'
import { fetchJournalTagDays } from '../../api'
import { TAG_META, ENTRY_TYPE_EMOJIS, tagLabel } from './journalColors'
import { EMOTION_TAGS } from '../../types'
import type { JournalTag, JournalSummaryRange, JournalMentalStateBar, JournalTagDay } from '../../types'
import MentalStateBarChart from './MentalStateBarChart'
import { todayString } from '../../utils/dates'

interface SummaryTabProps {
  /** Switches the parent to Daily tab at the given YYYY-MM-DD date. */
  onNavigateToDay: (date: string) => void
}

/* ─── Date helpers ───────────────────────────────────────────────────── */

// Formats a Date to YYYY-MM-DD using local date components (avoids UTC issues).
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Shifts a YYYY-MM-DD string by n days.
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toYMD(d)
}

// Returns the Monday of the ISO week containing a YYYY-MM-DD string.
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay()  // 0=Sun, 1=Mon, …, 6=Sat
  const back = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - back)
  return toYMD(d)
}

// Returns "Mar 30 – Apr 5, 2026" for the week containing refDate.
function weekRangeLabel(refDate: string): string {
  const mon = new Date(mondayOf(refDate) + 'T00:00:00')
  const sun = new Date(mon)
  sun.setDate(sun.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(mon)} – ${fmt(sun)}, ${sun.getFullYear()}`
}

// Returns the YYYY-MM-DD of the 1st of the month delta months from refDate.
function shiftMonthFirst(refDate: string, delta: number): string {
  const [y, m] = refDate.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return toYMD(d)
}

// Returns "April 2026" for the month of refDate.
function monthRangeLabel(refDate: string): string {
  return new Date(refDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })
}

/* ─── Score color helper ─────────────────────────────────────────────── */

function scoreColor(score: number): string {
  if (score >= 4) return '#4ade80'  // green-400
  if (score >= 2) return '#a78bfa'  // violet-400
  return '#f87171'                   // red-400
}

/* ─── HBar — horizontal frequency bar row ───────────────────────────── */

// Renders a single labeled bar for the emotion/type frequency charts.
// onClick makes the bar tappable for drill-down; cursor-pointer is applied
// and a right-chevron appears on hover to signal it's interactive.
function HBar({
  label, emoji, count, maxCount, color, onClick, active,
}: {
  label: string
  emoji?: string
  count: number
  maxCount: number
  color: string
  onClick?: () => void
  active?: boolean
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
  return (
    <div
      className={`flex items-center gap-2 mb-2 group ${onClick ? 'cursor-pointer' : ''} ${active ? 'opacity-100' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <span className="text-xs text-gray-600 w-28 shrink-0 truncate flex items-center gap-1">
        {emoji && <span>{emoji}</span>}
        {label}
      </span>
      <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-gray-500 w-5 text-right shrink-0">{count}</span>
      {onClick && (
        <svg
          className="w-3 h-3 text-gray-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      )}
    </div>
  )
}

/* ─── DrillPanel — day list shown when an emotion/type bar is tapped ── */

function DrillPanel({
  tag, totalCount, days, loading, onNavigateToDay, onClose,
}: {
  tag: string
  totalCount: number
  days: JournalTagDay[]
  loading: boolean
  onNavigateToDay: (date: string) => void
  onClose: () => void
}) {
  const isEmotion = EMOTION_TAGS.has(tag as JournalTag)
  const emoji = isEmotion ? TAG_META[tag as JournalTag]?.emoji : ENTRY_TYPE_EMOJIS[tag as JournalTag]
  const label = tagLabel(tag as JournalTag)

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mt-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-xs text-gray-600">
          <span className="font-semibold text-gray-800">
            {emoji} {label}
          </span>
          {' — '}
          {totalCount} {totalCount === 1 ? 'entry' : 'entries'} across {days.length} {days.length === 1 ? 'day' : 'days'}
        </p>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="py-4 flex justify-center">
          <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      )}

      {/* Day rows */}
      {!loading && days.length === 0 && (
        <p className="text-xs text-gray-400">No days found in this range.</p>
      )}
      {!loading && days.map((day, i) => (
        <div key={i} className="flex items-start justify-between gap-2 py-2 border-t border-gray-200 first:border-t-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* day.date is YYYY-MM-DD; format for display only */}
              <span className="text-xs font-medium text-gray-700">
                {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span className="text-[10px] text-gray-400">{day.entry_count} {day.entry_count === 1 ? 'entry' : 'entries'}</span>
            </div>
            {day.preview && (
              <p className="text-[11px] text-gray-500 mt-0.5 truncate">{day.preview}</p>
            )}
          </div>
          <button
            onClick={() => onNavigateToDay(day.date)}
            className="text-[11px] font-medium text-blue-500 hover:text-blue-600 shrink-0 whitespace-nowrap"
          >
            View →
          </button>
        </div>
      ))}
    </div>
  )
}

/* ─── BarTooltip — dark tooltip shown on week/month bar click ────────── */

function BarTooltip({
  bar, pct, onNavigateToDay, onClose,
}: {
  bar: JournalMentalStateBar
  pct: number
  onNavigateToDay: (date: string) => void
  onClose: () => void
}) {
  const dateLabel = new Date(bar.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  // Show up to 4 emotion emojis; if there are more, add a "+N" pill.
  const MAX_EMOJIS = 4
  const visibleEmojis = bar.emotions.slice(0, MAX_EMOJIS)
  const extraCount = bar.emotions.length - MAX_EMOJIS

  return (
    <>
      {/* Click-outside overlay — transparent, behind tooltip */}
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
      {/* Tooltip — positioned at the top of the chart area, centered on the bar */}
      <div
        className="absolute top-1 z-20 bg-gray-800 rounded-lg p-2.5 shadow-lg w-40"
        style={{ left: `clamp(14%, ${pct}%, 86%)`, transform: 'translateX(-50%)' }}
      >
        {/* Date */}
        <p className="text-[10px] text-gray-400 mb-1.5">{dateLabel}</p>

        {/* Entries count */}
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-gray-400">Entries</span>
          <span className="text-white font-medium">{bar.entry_count}</span>
        </div>

        {/* Mental state score */}
        <div className="flex justify-between text-[10px] mb-2">
          <span className="text-gray-400">Score</span>
          {bar.score !== null ? (
            <span className="font-medium" style={{ color: scoreColor(bar.score) }}>
              {bar.score.toFixed(1)}
            </span>
          ) : (
            <span className="text-gray-500">—</span>
          )}
        </div>

        {/* Emotion emoji pills */}
        {bar.emotions.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {visibleEmojis.map(tag => (
              <span
                key={tag}
                className="bg-gray-700 rounded-md w-7 h-7 flex items-center justify-center text-sm"
                title={tagLabel(tag as JournalTag)}
              >
                {TAG_META[tag as JournalTag]?.emoji ?? tag}
              </span>
            ))}
            {extraCount > 0 && (
              <span className="bg-gray-700 rounded-md w-7 h-7 flex items-center justify-center text-[10px] text-gray-300 font-medium">
                +{extraCount}
              </span>
            )}
          </div>
        )}

        {/* Go to day button */}
        <button
          onClick={() => { onNavigateToDay(bar.date); onClose() }}
          className="w-full text-[10px] text-blue-400 hover:text-blue-300 border-t border-gray-700 pt-1.5 mt-0.5 text-center"
        >
          Go to day →
        </button>
      </div>
    </>
  )
}

/* ─── SubNavigator — week/month date range navigator ─────────────────── */

function SubNavigator({
  range, refDate, onPrev, onNext, canGoNext, label,
}: {
  range: JournalSummaryRange
  refDate: string
  onPrev: () => void
  onNext: () => void
  canGoNext: boolean
  label: string
}) {
  void range; void refDate  // consumed by caller to compute label + canGoNext
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="flex items-center bg-gray-100 rounded-full px-1 py-1">
        <button
          onClick={onPrev}
          className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center"
          aria-label="Previous period"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-xs font-medium text-gray-700 px-3 min-w-[160px] text-center">
          {label}
        </span>
        <button
          onClick={onNext}
          disabled={!canGoNext}
          className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center disabled:opacity-30 disabled:cursor-default"
          aria-label="Next period"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/* ─── Range config ───────────────────────────────────────────────────── */

const RANGES: JournalSummaryRange[] = ['week', 'month', '6m', '1yr']
const RANGE_LABELS: Record<JournalSummaryRange, string> = {
  week: 'Week', month: 'Month', '6m': '6M', '1yr': '1yr',
}

/* ─── SummaryTab ─────────────────────────────────────────────────────── */

export default function SummaryTab({ onNavigateToDay }: SummaryTabProps) {
  const [range, setRange] = useState<JournalSummaryRange>('week')
  const [refDate, setRefDate] = useState(todayString)

  // Bar chart tooltip state
  const [tooltipBar, setTooltipBar] = useState<JournalMentalStateBar | null>(null)
  const [tooltipPct, setTooltipPct] = useState(50)

  // Drill-down state — tag currently expanded, plus the fetched days list
  const [activeDrillTag, setActiveDrillTag] = useState<string | null>(null)
  const [drillDays, setDrillDays] = useState<JournalTagDay[]>([])
  const [drillLoading, setDrillLoading] = useState(false)

  const { summary, loading, error } = useJournalSummary(range, refDate)

  /* ── Event handlers ─────────────────────────────────────────────────── */

  const handleRangeChange = (r: JournalSummaryRange) => {
    setRange(r)
    setTooltipBar(null)
    setActiveDrillTag(null)
  }

  const handleRefDateChange = (d: string) => {
    setRefDate(d)
    setTooltipBar(null)
    setActiveDrillTag(null)
  }

  // Bar click: week/month shows tooltip; 6m/1yr zooms to Week view for that week.
  const handleBarClick = (bar: JournalMentalStateBar, pct: number) => {
    if (range === '6m' || range === '1yr') {
      // bar.date is the ISO week-start Monday — switch to that week
      handleRangeChange('week')
      setRefDate(bar.date)
    } else {
      setTooltipBar(bar)
      setTooltipPct(pct)
    }
  }

  // Drill-down: tap again to toggle closed; tap a different tag to switch.
  const handleDrillTag = async (tag: string) => {
    if (activeDrillTag === tag) {
      setActiveDrillTag(null)
      return
    }
    setActiveDrillTag(tag)
    setDrillLoading(true)
    try {
      const days = await fetchJournalTagDays(tag, range, refDate)
      setDrillDays(days)
    } finally {
      setDrillLoading(false)
    }
  }

  /* ── Sub-navigator helpers ──────────────────────────────────────────── */

  const today = todayString()
  const currentMonthFirst = today.slice(0, 7) + '-01'

  // Week navigation: shift refDate ±7 days
  const prevWeek = () => handleRefDateChange(addDays(refDate, -7))
  const nextWeek = () => handleRefDateChange(addDays(refDate, 7))
  const canNextWeek = mondayOf(addDays(refDate, 7)) <= mondayOf(today)

  // Month navigation: move to 1st of prev/next month
  const prevMonth = () => handleRefDateChange(shiftMonthFirst(refDate, -1))
  const nextMonth = () => handleRefDateChange(shiftMonthFirst(refDate, +1))
  const canNextMonth = shiftMonthFirst(refDate, +1) <= currentMonthFirst

  // Sub-navigator label and callbacks for the current range
  const subNav = range === 'week'
    ? { label: weekRangeLabel(refDate), onPrev: prevWeek, onNext: nextWeek, canGoNext: canNextWeek }
    : { label: monthRangeLabel(refDate), onPrev: prevMonth, onNext: nextMonth, canGoNext: canNextMonth }

  /* ── Drill-down totals (from summary frequency lists) ───────────────── */

  const drillTotal = activeDrillTag
    ? (summary?.top_emotions.find(e => e.tag === activeDrillTag)?.count
      ?? summary?.entry_type_counts.find(e => e.tag === activeDrillTag)?.count
      ?? 0)
    : 0

  const drillIsEmotion = activeDrillTag !== null && EMOTION_TAGS.has(activeDrillTag as JournalTag)

  /* ── Render ─────────────────────────────────────────────────────────── */

  const maxEmotionCount = summary?.top_emotions[0]?.count ?? 0
  const maxTypeCount    = summary?.entry_type_counts[0]?.count ?? 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

      {/* ── Range selector pills ────────────────────────────────────────── */}
      <div className="flex justify-center">
        <div className="flex items-center bg-gray-100 rounded-full px-1 py-1">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => handleRangeChange(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                range === r
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sub-navigator (week / month only) ───────────────────────────── */}
      {(range === 'week' || range === 'month') && (
        <SubNavigator
          range={range}
          refDate={refDate}
          label={subNav.label}
          onPrev={subNav.onPrev}
          onNext={subNav.onNext}
          canGoNext={subNav.canGoNext}
        />
      )}

      {loading && (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      )}
      {error && (
        <div className="text-center py-8 text-red-500 text-sm">{error}</div>
      )}

      {!loading && !error && summary && (
        <>
          {/* ── Mental State Over Time ──────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Mental State Over Time</h3>
            {/* Relative wrapper so tooltip is positioned within this card */}
            <div className="relative">
              <MentalStateBarChart
                bars={summary.mental_state_bars}
                range={range}
                onBarClick={handleBarClick}
              />
              {tooltipBar && (
                <BarTooltip
                  bar={tooltipBar}
                  pct={tooltipPct}
                  onNavigateToDay={onNavigateToDay}
                  onClose={() => setTooltipBar(null)}
                />
              )}
            </div>
          </div>

          {/* ── Top Emotions ────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Top Emotions</h3>
            {summary.top_emotions.length === 0 ? (
              <p className="text-sm text-gray-400">No emotion tags in this range.</p>
            ) : (
              summary.top_emotions.map(({ tag, count }: { tag: JournalTag; count: number }) => (
                <HBar
                  key={tag}
                  label={tagLabel(tag)}
                  emoji={TAG_META[tag]?.emoji}
                  count={count}
                  maxCount={maxEmotionCount}
                  color={TAG_META[tag]?.color ?? '#94a3b8'}
                  onClick={() => handleDrillTag(tag)}
                  active={activeDrillTag === tag}
                />
              ))
            )}
            {/* Drill-down panel — renders after this card when an emotion bar is active */}
            {activeDrillTag !== null && drillIsEmotion && (
              <DrillPanel
                tag={activeDrillTag}
                totalCount={drillTotal}
                days={drillDays}
                loading={drillLoading}
                onNavigateToDay={onNavigateToDay}
                onClose={() => setActiveDrillTag(null)}
              />
            )}
          </div>

          {/* ── Entry Types ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Entry Types</h3>
            {summary.entry_type_counts.length === 0 ? (
              <p className="text-sm text-gray-400">No entry type tags in this range.</p>
            ) : (
              summary.entry_type_counts.map(({ tag, count }: { tag: JournalTag; count: number }) => (
                <HBar
                  key={tag}
                  label={tagLabel(tag)}
                  emoji={ENTRY_TYPE_EMOJIS[tag]}
                  count={count}
                  maxCount={maxTypeCount}
                  color="#4f46e5"
                  onClick={() => handleDrillTag(tag)}
                  active={activeDrillTag === tag}
                />
              ))
            )}
            {/* Drill-down panel — renders after this card when an entry-type bar is active */}
            {activeDrillTag !== null && !drillIsEmotion && (
              <DrillPanel
                tag={activeDrillTag}
                totalCount={drillTotal}
                days={drillDays}
                loading={drillLoading}
                onNavigateToDay={onNavigateToDay}
                onClose={() => setActiveDrillTag(null)}
              />
            )}
          </div>

          {/* ── Stats row ───────────────────────────────────────────────── */}
          {(() => {
            // Compute average score across all bars that have a non-null score.
            const scoredBars = summary.mental_state_bars.filter(b => b.score !== null)
            const avgScore = scoredBars.length > 0
              ? scoredBars.reduce((sum, b) => sum + b.score!, 0) / scoredBars.length
              : null
            return (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{summary.days_logged}</p>
                  <p className="text-xs text-gray-500 mt-1">Days logged</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{summary.total_entries}</p>
                  <p className="text-xs text-gray-500 mt-1">Total entries</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
                  <p
                    className="text-2xl font-bold"
                    style={{ color: avgScore !== null ? scoreColor(avgScore) : '#9ca3af' }}
                  >
                    {avgScore !== null ? avgScore.toFixed(1) : '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Avg score</p>
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
