// SummaryTab — journal summary view with range selector and three charts.
// Range state lives locally; useJournalSummary handles fetching and refetches
// automatically when range changes.
//
// Charts:
//   1. Mental State Over Time — SVG polyline, Y=1-5, line colored via linearGradient
//   2. Top Emotions            — horizontal bars colored with EMOTION_COLORS
//   3. Entry Types             — horizontal bars in indigo-600

import { useState } from 'react'
import { useJournalSummary } from '../../hooks/useJournalSummary'
import { EMOTION_COLORS, EMOTION_EMOJIS, ENTRY_TYPE_EMOJIS, tagLabel } from './journalColors'
import type { JournalTag } from '../../types'

type Range = '1m' | '6m' | 'ytd' | 'all'

const RANGES: Range[] = ['1m', '6m', 'ytd', 'all']
const RANGE_LABELS: Record<Range, string> = { '1m': '1M', '6m': '6M', ytd: 'YTD', all: 'All' }

// scoreColor returns the dot/line color for a given mental-state score (1–5).
// Green = good (4-5), violet = neutral-low (2-3), red = distress (1).
function scoreColor(score: number): string {
  if (score >= 4) return '#4ade80'  // green-400
  if (score >= 2) return '#a78bfa'  // violet-400
  return '#f87171'                   // red-400
}

/* ─── Mental State chart ─────────────────────────────────────────────────── */

// SVG coordinate constants — chart area within the full viewBox
const VB_W   = 500
const VB_H   = 140
const PAD_L  = 28   // space for Y-axis labels
const PAD_R  = 12
const PAD_T  = 14
const PAD_B  = 28   // space for X-axis date labels

// MentalStateChart renders a score-over-time polyline.
// The stroke color is applied via a horizontal linearGradient so each segment
// transitions between the colors of its two neighboring data points.
function MentalStateChart({ points }: { points: { date: string; score: number }[] }) {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-sm text-gray-400">
        No entries yet
      </div>
    )
  }

  const chartW = VB_W - PAD_L - PAD_R
  const chartH = VB_H - PAD_T - PAD_B

  // scoreY maps a score (1–5) to a Y pixel — score 5 is at the top, 1 at the bottom.
  const scoreY = (s: number) => PAD_T + chartH - ((s - 1) / 4) * chartH

  // Compute (x, y) for each data point
  const pts = points.map((p, i) => ({
    ...p,
    x: PAD_L + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW),
    y: scoreY(p.score),
  }))

  const polylinePoints = pts.map(p => `${p.x},${p.y}`).join(' ')

  // One gradient stop per data point, placed at its x-position along the line.
  // This gives each segment a color that transitions between its two endpoint scores.
  const gradStops = pts.map(p => ({
    offset: `${((p.x - PAD_L) / chartW) * 100}%`,
    color: scoreColor(p.score),
  }))

  const yLabels = [5, 4, 3, 2, 1]

  // Show date labels at first, middle, and last points only to avoid crowding
  const labelIndices = [...new Set([0, Math.floor(pts.length / 2), pts.length - 1])]

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      className="overflow-visible"
      aria-hidden="true"
    >
      <defs>
        {/* Horizontal gradient — x1=0/x2=1 so offsets map directly to x-position */}
        <linearGradient id="ms-line-grad" x1="0" x2="1" y1="0" y2="0">
          {gradStops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>

      {/* Y-axis grid lines + labels */}
      {yLabels.map(s => {
        const y = scoreY(s)
        return (
          <g key={s}>
            <line
              x1={PAD_L} y1={y} x2={VB_W - PAD_R} y2={y}
              stroke="#f1f5f9" strokeWidth={1}
            />
            <text x={PAD_L - 5} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
              {s}
            </text>
          </g>
        )
      })}

      {/* Data line — colored via the gradient */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="url(#ms-line-grad)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data point dots — colored individually by score */}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x} cy={p.y} r={3.5}
          fill={scoreColor(p.score)}
          stroke="white" strokeWidth={1.5}
        />
      ))}

      {/* X-axis date labels — MM-DD format at first/middle/last */}
      {labelIndices.map(i => (
        <text
          key={i}
          x={pts[i].x} y={VB_H - 4}
          textAnchor="middle" fontSize={9} fill="#94a3b8"
        >
          {pts[i].date.slice(5)}
        </text>
      ))}
    </svg>
  )
}

/* ─── Horizontal bar row ─────────────────────────────────────────────────── */

// HBar renders a single labeled bar for the emotion/type frequency charts.
function HBar({
  label,
  emoji,
  count,
  maxCount,
  color,
}: {
  label: string
  emoji?: string
  count: number
  maxCount: number
  color: string
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
  return (
    <div className="flex items-center gap-2 mb-2">
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
    </div>
  )
}

/* ─── SummaryTab ─────────────────────────────────────────────────────────── */

export default function SummaryTab() {
  const [range, setRange] = useState<Range>('1m')
  const { summary, loading, error } = useJournalSummary(range)

  // Pre-compute max counts so bar widths are relative to the top entry
  const maxEmotionCount = summary?.top_emotions[0]?.count ?? 0
  const maxTypeCount    = summary?.entry_type_counts[0]?.count ?? 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">

      {/* ── Range selector pills ──────────────────────────────────────────── */}
      <div className="flex justify-center">
        <div className="flex items-center bg-gray-100 rounded-full px-1 py-1">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
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

      {loading && (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      )}
      {error && (
        <div className="text-center py-8 text-red-500 text-sm">{error}</div>
      )}

      {!loading && !error && summary && (
        <>
          {/* ── Mental State Over Time ────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Mental State Over Time</h3>
            <MentalStateChart points={summary.mental_state_points} />
          </div>

          {/* ── Top Emotions ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Top Emotions</h3>
            {summary.top_emotions.length === 0 ? (
              <p className="text-sm text-gray-400">No emotion tags in this range.</p>
            ) : (
              summary.top_emotions.map(({ tag, count }: { tag: JournalTag; count: number }) => (
                <HBar
                  key={tag}
                  label={tagLabel(tag)}
                  emoji={EMOTION_EMOJIS[tag]}
                  count={count}
                  maxCount={maxEmotionCount}
                  color={EMOTION_COLORS[tag] ?? '#94a3b8'}
                />
              ))
            )}
          </div>

          {/* ── Entry Types ───────────────────────────────────────────────── */}
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
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
