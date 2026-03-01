// ProgressView — the Progress tab content for the CalorieLog page.
// Layout order (top to bottom):
//   1. Period Summary card — range selector lives in its header; calorie stats
//      row; weight stats row (start/end/delta); estimated weight impact footer.
//   2. Weight card — line chart or table, with Graph/Table toggle and + Log button.
//   3. Calories card — net-calorie bar chart grouped by day/week/month.
//   4. FAB (fixed) + LogWeightSheet modal.
//
// Period Summary always renders so the range selector stays accessible during
// loading. The stats body is hidden until data is ready.

import { useState } from 'react'
import type { ProgressResponse, WeightEntry } from '../../types'
import { groupDays, type ProgressRange } from '../../utils/progressGrouping'
import LogWeightSheet from './LogWeightSheet'

/* ─── Props ─────────────────────────────────────────────────────────────── */

export interface ProgressViewProps {
  range: ProgressRange
  onRangeChange: (r: ProgressRange) => void
  progressData: ProgressResponse | null
  weightEntries: WeightEntry[]
  loading: boolean
  error: string | null
  // start/end used to bucket chart bars; provided by the parent CalorieLog
  rangeStart: string
  rangeEnd: string
  onLogWeight: (date: string, lbs: number) => Promise<void>
  onUpdateWeight: (id: number, date: string, lbs: number) => Promise<void>
  onDeleteWeight: (id: number) => Promise<void>
  // User unit preference ('imperial' or 'metric') — drives weight display
  units: string
}

/* ─── SVG chart constants ────────────────────────────────────────────────── */

// Chart Y-axis occupies x=0..X_START, bars occupy x=X_START..(X_START + N*slotW).
const X_START = 30
const Y_TOP   = 15
const Y_BOT   = 115
const BAR_H   = Y_BOT - Y_TOP   // 100 usable pixels
const LBL_Y   = 129             // bar label below baseline
const VB_H    = 142             // total viewBox height

// slotMetrics computes bar/slot widths and total chart width for N bars.
// Uses a target ~500px content width; slot never goes below 9px.
function slotMetrics(n: number) {
  const slotW = Math.max(9, Math.min(28, Math.ceil(520 / Math.max(n, 1))))
  const barW  = Math.max(4, Math.floor(slotW * 0.62))
  return { slotW, barW, totalW: X_START + n * slotW + 15 }
}

// barX: left x of bar i (0-indexed), centered in its slot.
const barX = (i: number, slotW: number, barW: number) =>
  X_START + i * slotW + (slotW - barW) / 2

// slotCenter: center x of slot i for label alignment.
const slotCenter = (i: number, slotW: number) =>
  X_START + (i + 0.5) * slotW

/* ─── Weight unit helpers ────────────────────────────────────────────────── */

// lbsForDisplay converts stored lbs to the user's display unit.
function lbsForDisplay(lbs: number, units: string): number {
  return units === 'metric' ? Math.round(lbs * 0.453592 * 10) / 10 : lbs
}

function weightUnitLabel(units: string): string {
  return units === 'metric' ? 'kg' : 'lbs'
}

/* ─── Range labels ───────────────────────────────────────────────────────── */

// Maps each ProgressRange to its compact pill label.
const RANGE_LABELS: Record<ProgressRange, string> = {
  month: '1M',
  '6months': '6M',
  ytd: 'YTD',
  lastyear: '1Y',
  all: 'All',
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function ProgressView({
  range, onRangeChange,
  progressData, weightEntries,
  loading, error,
  rangeStart, rangeEnd,
  onLogWeight, onUpdateWeight, onDeleteWeight,
  units,
}: ProgressViewProps) {
  const [tooltipIdx, setTooltipIdx] = useState(-1)
  const [weightTab, setWeightTab] = useState<'graph' | 'table'>('graph')
  const [weightSheetOpen, setWeightSheetOpen] = useState(false)
  const [editingWeight, setEditingWeight] = useState<WeightEntry | null>(null)

  /* ─── Bar chart data ─────────────────────────────────────────────────── */

  const bars = progressData
    ? groupDays(progressData.days, range, rangeStart, rangeEnd)
    : []

  const { slotW, barW, totalW } = slotMetrics(bars.length)

  // Y scale — round up to nearest 500 for clean grid lines
  const dataMax = Math.max(1, ...bars.map(b => b.netCalories))
  const gridMax = Math.ceil(dataMax / 500) * 500
  const scaleY  = (v: number) => BAR_H * (Math.max(0, v) / gridMax)

  const gridSteps = [1, 0.75, 0.5, 0.25].map(f => ({
    y: Y_BOT - BAR_H * f,
    label: gridMax * f >= 1000 ? `${(gridMax * f / 1000).toFixed(gridMax * f % 1000 === 0 ? 0 : 1)}k` : String(Math.round(gridMax * f)),
  }))

  // Show labels only when bars are wide enough to avoid crowding.
  // For narrow bars, skip every other label (or more).
  const labelStep = slotW >= 14 ? 1 : slotW >= 9 ? 2 : 4

  /* ─── Weight chart data ──────────────────────────────────────────────── */

  const weightInRange = weightEntries.filter(e => e.date >= rangeStart && e.date <= rangeEnd)
  const sortedWeight  = [...weightInRange].sort((a, b) => a.date.localeCompare(b.date))

  /* ─── Weight stats for Period Summary ───────────────────────────────── */

  // First and last entries by date within the visible range — used for delta row.
  const periodWeights = [...weightEntries]
    .filter(e => e.date >= rangeStart && e.date <= rangeEnd)
    .sort((a, b) => a.date.localeCompare(b.date))
  const startEntry = periodWeights[0] ?? null
  const endEntry   = periodWeights[periodWeights.length - 1] ?? null
  const weightDelta = (startEntry && endEntry && startEntry.id !== endEntry.id)
    ? lbsForDisplay(endEntry.weight_lbs, units) - lbsForDisplay(startEntry.weight_lbs, units)
    : null

  /* ─── Weight SVG chart ───────────────────────────────────────────────── */

  const WGT_X_START = 40
  const WGT_X_END   = 410
  const WGT_Y_TOP   = 15
  const WGT_Y_BOT   = 120
  const WGT_H       = WGT_Y_BOT - WGT_Y_TOP
  const WGT_VB_W    = 430
  const WGT_VB_H    = 140

  let weightSvg: React.ReactNode = null
  if (sortedWeight.length >= 2) {
    const weights = sortedWeight.map(e => lbsForDisplay(e.weight_lbs, units))
    const wMin = Math.min(...weights)
    const wMax = Math.max(...weights)
    const wRange = Math.max(wMax - wMin, 1)  // avoid divide-by-zero
    const pad = wRange * 0.15
    const lo = wMin - pad
    const hi = wMax + pad

    const pts = sortedWeight.map((_, i) => {
      const x = WGT_X_START + (i / (sortedWeight.length - 1)) * (WGT_X_END - WGT_X_START)
      const y = WGT_Y_BOT - WGT_H * ((weights[i] - lo) / (hi - lo))
      return { x, y, entry: sortedWeight[i], w: weights[i] }
    })

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${WGT_Y_BOT} L ${pts[0].x.toFixed(1)} ${WGT_Y_BOT} Z`

    weightSvg = (
      <svg viewBox={`0 0 ${WGT_VB_W} ${WGT_VB_H}`} className="w-full" style={{ minWidth: 280 }}>
        {/* Area fill */}
        <path d={areaPath} fill="#3b82f6" opacity={0.08} />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={1.8} />
        {/* Dots — clickable tooltips */}
        {pts.map((p, i) => (
          <g key={sortedWeight[i].id} onClick={e => { e.stopPropagation(); setTooltipIdx(tooltipIdx === 1000 + i ? -1 : 1000 + i) }}>
            <circle cx={p.x} cy={p.y} r={5} fill="white" stroke="#3b82f6" strokeWidth={1.8} className="cursor-pointer" />
            {tooltipIdx === 1000 + i && (() => {
              const tx = Math.min(Math.max(p.x, WGT_X_START + 50), WGT_X_END - 50)
              const ty = Math.max(p.y - 52, WGT_Y_TOP)
              return (
                <g>
                  <rect x={tx - 50} y={ty} width={100} height={42} rx={4} fill="#1f2937" />
                  <text x={tx} y={ty + 14} textAnchor="middle" fontSize={8.5} fill="#9ca3af">
                    {new Date(p.entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </text>
                  <text x={tx} y={ty + 29} textAnchor="middle" fontSize={10} fill="white" fontWeight="600">
                    {p.w.toFixed(1)} {weightUnitLabel(units)}
                  </text>
                </g>
              )
            })()}
          </g>
        ))}
        {/* Y-axis min/max labels */}
        <text x={WGT_X_START - 4} y={WGT_Y_BOT} textAnchor="end" fontSize={8} fill="#d1d5db">{wMin.toFixed(1)}</text>
        <text x={WGT_X_START - 4} y={WGT_Y_TOP + 5} textAnchor="end" fontSize={8} fill="#d1d5db">{wMax.toFixed(1)}</text>
      </svg>
    )
  }

  /* ─── Stats ──────────────────────────────────────────────────────────── */

  const stats = progressData?.stats ?? null
  const weightImpact = stats ? stats.total_calories_left / 3500 : 0

  /* ─── Handlers ───────────────────────────────────────────────────────── */

  const openNewWeight = () => {
    setEditingWeight(null)
    setWeightSheetOpen(true)
  }

  const openEditWeight = (entry: WeightEntry) => {
    setEditingWeight(entry)
    setWeightSheetOpen(true)
  }

  const handleWeightSave = async (date: string, lbs: number) => {
    if (editingWeight) {
      await onUpdateWeight(editingWeight.id, date, lbs)
    } else {
      await onLogWeight(date, lbs)
    }
    setWeightSheetOpen(false)
    setEditingWeight(null)
  }

  const handleWeightDelete = async (id: number) => {
    await onDeleteWeight(id)
  }

  /* ─── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-4" onClick={() => setTooltipIdx(-1)}>

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="text-center py-8 text-red-500 text-sm">
          Failed to load progress data
        </div>
      )}

      {/* ── Period Summary — always rendered so range selector stays accessible */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Card header: title + range pills */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Period Summary</h3>
          <div className="flex items-center gap-1">
            {(Object.keys(RANGE_LABELS) as ProgressRange[]).map(r => (
              <button
                key={r}
                onClick={e => { e.stopPropagation(); onRangeChange(r) }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                  ${range === r ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Stats body — hidden during loading/error */}
        {!loading && !error && (
          <>
            {!stats || stats.days_tracked === 0 ? (
              <div className="py-4 text-center text-gray-400 text-sm">No data for this period</div>
            ) : (
              <>
                {/* Calorie stats row */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                  <div className="px-4 py-3">
                    <div className="text-xs text-gray-500 mb-0.5">Avg Daily Net</div>
                    <div className="text-lg font-semibold text-gray-900">{stats.avg_net_calories.toLocaleString()}</div>
                    <div className="text-xs text-gray-400">cal / day</div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-xs text-gray-500 mb-0.5">Days Tracked</div>
                    <div className="text-lg font-semibold text-gray-900">{stats.days_tracked}</div>
                    <div className="text-xs text-gray-400">days logged</div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-xs text-gray-500 mb-0.5">Days on Budget</div>
                    <div className="text-lg font-semibold text-gray-900">{stats.days_on_budget}</div>
                    <div className="text-xs text-gray-400">
                      {Math.round((stats.days_on_budget / stats.days_tracked) * 100)}% of tracked
                    </div>
                  </div>
                </div>

                {/* Weight stats row */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                  <div className="px-4 py-3">
                    <div className="text-xs text-gray-500 mb-0.5">Weight Change</div>
                    {weightDelta !== null
                      ? <>
                          <div className={`text-lg font-semibold ${weightDelta <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)} {weightUnitLabel(units)}
                          </div>
                          <div className="text-xs text-gray-400">over period</div>
                        </>
                      : <div className="text-sm text-gray-400">—</div>
                    }
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-xs text-gray-500 mb-0.5">Start Weight</div>
                    {startEntry
                      ? <>
                          <div className="text-lg font-semibold text-gray-900">{lbsForDisplay(startEntry.weight_lbs, units).toFixed(1)}</div>
                          <div className="text-xs text-gray-400">
                            {weightUnitLabel(units)} · {new Date(startEntry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        </>
                      : <div className="text-sm text-gray-400">—</div>
                    }
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-xs text-gray-500 mb-0.5">End Weight</div>
                    {endEntry && endEntry.id !== startEntry?.id
                      ? <>
                          <div className="text-lg font-semibold text-gray-900">{lbsForDisplay(endEntry.weight_lbs, units).toFixed(1)}</div>
                          <div className="text-xs text-gray-400">
                            {weightUnitLabel(units)} · {new Date(endEntry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        </>
                      : <div className="text-sm text-gray-400">—</div>
                    }
                  </div>
                </div>

                {/* Estimated weight impact footer */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Estimated weight impact from calorie deficit</span>
                  <span className={`text-sm font-semibold ${weightImpact >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {weightImpact >= 0 ? '+' : ''}{weightImpact.toFixed(2)} lbs
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {!loading && !error && (
        <>
          {/* ── Weight card ───────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Weight</h3>
              <div className="flex gap-1">
                {/* Graph / Table toggle */}
                {(['graph', 'table'] as const).map(t => (
                  <button
                    key={t}
                    onClick={e => { e.stopPropagation(); setWeightTab(t) }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize
                      ${weightTab === t ? 'bg-gray-100 text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    {t}
                  </button>
                ))}
                {/* Log weight button */}
                <button
                  onClick={e => { e.stopPropagation(); openNewWeight() }}
                  className="ml-1 px-2.5 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  + Log
                </button>
              </div>
            </div>

            {weightTab === 'graph' && (
              sortedWeight.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-sm">
                  No weight entries for this period.
                  <button
                    onClick={e => { e.stopPropagation(); openNewWeight() }}
                    className="block mx-auto mt-2 text-blue-500 hover:underline text-xs"
                  >
                    Log your first weight entry
                  </button>
                </div>
              ) : sortedWeight.length === 1 ? (
                <div className="py-6 text-center text-gray-400 text-sm">
                  {lbsForDisplay(sortedWeight[0].weight_lbs, units).toFixed(1)} {weightUnitLabel(units)} on{' '}
                  {new Date(sortedWeight[0].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
                  <div className="text-xs mt-1">Log more entries to see a trend.</div>
                </div>
              ) : (
                <div className="w-full overflow-x-auto -mx-1 px-1">
                  {weightSvg}
                </div>
              )
            )}

            {weightTab === 'table' && (
              sortedWeight.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-sm">No weight entries for this period.</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wide">
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Weight ({weightUnitLabel(units)})</th>
                        <th className="px-3 py-2 w-16" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[...sortedWeight].reverse().map(entry => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-gray-700">
                            {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-800">
                            {lbsForDisplay(entry.weight_lbs, units).toFixed(1)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Edit */}
                              <button
                                onClick={e => { e.stopPropagation(); openEditWeight(entry) }}
                                className="p-1 text-gray-400 hover:text-blue-500 rounded transition-colors"
                                aria-label="Edit weight entry"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
                                </svg>
                              </button>
                              {/* Delete */}
                              <button
                                onClick={e => { e.stopPropagation(); handleWeightDelete(entry.id) }}
                                className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                                aria-label="Delete weight entry"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* ── Calorie bar chart ─────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Calories</h3>
              {stats && stats.days_tracked > 0 && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap
                  ${stats.total_calories_left >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                  {stats.total_calories_left >= 0
                    ? `${Math.abs(stats.total_calories_left).toLocaleString()} under budget`
                    : `${Math.abs(stats.total_calories_left).toLocaleString()} over budget`}
                </span>
              )}
            </div>

            {bars.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No data for this period</div>
            ) : (
              <div className="w-full overflow-x-auto -mx-1 px-1">
                <svg
                  viewBox={`0 0 ${totalW} ${VB_H}`}
                  style={{ width: totalW, display: 'block' }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Horizontal grid lines */}
                  {gridSteps.map(({ y, label }) => (
                    <g key={label}>
                      <line x1={X_START} y1={y} x2={totalW - 15} y2={y} stroke="#f3f4f6" strokeWidth={1} />
                      <text x={X_START - 3} y={y + 3} textAnchor="end" fontSize={8} fill="#d1d5db">{label}</text>
                    </g>
                  ))}
                  {/* Baseline */}
                  <line x1={X_START} y1={Y_BOT} x2={totalW - 15} y2={Y_BOT} stroke="#e5e7eb" strokeWidth={1} />

                  {/* Bars */}
                  {bars.map((bar, i) => {
                    const bx       = barX(i, slotW, barW)
                    const cx       = slotCenter(i, slotW)
                    const hasData  = bar.trackedDays > 0
                    const isOver   = bar.netCalories > bar.budget
                    const barHeight = hasData ? Math.max(3, scaleY(bar.netCalories)) : 6
                    const barTop   = Y_BOT - barHeight
                    const fill     = !hasData ? '#f3f4f6' : isOver ? '#ef4444' : '#22c55e'
                    const showLabel = (i % labelStep === 0)

                    return (
                      <g
                        key={i}
                        onClick={e => { e.stopPropagation(); setTooltipIdx(i === tooltipIdx ? -1 : i) }}
                      >
                        <rect
                          x={bx} y={barTop} width={barW} height={barHeight}
                          fill={fill} rx={2} opacity={0.85}
                          className={hasData ? 'cursor-pointer hover:opacity-100' : ''}
                        />
                        {/* Label below baseline */}
                        {showLabel && (
                          <text x={cx} y={LBL_Y} textAnchor="middle" fontSize={7.5} fill="#9ca3af">
                            {bar.label}
                          </text>
                        )}
                      </g>
                    )
                  })}

                  {/* Tooltip — dark callout above clicked bar */}
                  {tooltipIdx >= 0 && tooltipIdx < bars.length && (() => {
                    const bar = bars[tooltipIdx]
                    const cx  = slotCenter(tooltipIdx, slotW)
                    const barHeight = bar.trackedDays > 0 ? Math.max(3, scaleY(bar.netCalories)) : 6
                    const tipY = Math.max(8, Y_BOT - barHeight - 56)
                    const tx   = Math.min(Math.max(cx, X_START + 55), totalW - 70)
                    const delta = bar.budget - bar.netCalories  // positive = under budget
                    return (
                      <g>
                        <rect x={tx - 55} y={tipY} width={110} height={48} rx={5} fill="#1f2937" />
                        <text x={tx - 47} y={tipY + 14} fontSize={9} fill="#9ca3af">{bar.label}</text>
                        <text x={tx - 47} y={tipY + 27} fontSize={9} fill="#9ca3af">Net calories</text>
                        <text x={tx + 47} y={tipY + 27} fontSize={9} fill="white" textAnchor="end" fontWeight="600">
                          {bar.netCalories.toLocaleString()}
                        </text>
                        <text x={tx - 47} y={tipY + 40} fontSize={9} fill="#9ca3af">vs. budget</text>
                        <text x={tx + 47} y={tipY + 40} fontSize={9} textAnchor="end" fontWeight="600"
                          fill={delta >= 0 ? '#22c55e' : '#ef4444'}>
                          {delta >= 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}
                        </text>
                      </g>
                    )
                  })()}
                </svg>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-green-500 opacity-85" />Under budget
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-red-500 opacity-85" />Over budget
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-gray-200" />No data
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── FAB — log weight (teal + scale icon to distinguish from calorie FAB) ── */}
      {!loading && !error && (
        <button
          onClick={openNewWeight}
          className="fixed bottom-6 right-6 w-14 h-14 bg-teal-500 hover:bg-teal-600 text-white rounded-full shadow-lg flex flex-col items-center justify-center z-30 transition-colors gap-0.5"
          aria-label="Log weight"
        >
          {/* Balance scale icon */}
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/>
          </svg>
          <span className="text-[8px] font-bold uppercase tracking-wide leading-none">Weight</span>
        </button>
      )}

      {/* ── Log Weight modal ──────────────────────────────────────────────── */}
      <LogWeightSheet
        open={weightSheetOpen}
        onClose={() => { setWeightSheetOpen(false); setEditingWeight(null) }}
        onSave={handleWeightSave}
        editEntry={editingWeight}
        units={units}
      />
    </div>
  )
}
