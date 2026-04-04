// MentalStateBarChart — SVG bar chart for the mental-state-over-time section
// of the Summary tab. Each bar represents one time slot (day for week/month,
// ISO week for 6m/1yr). Bars with no entries show a 4px gray-200 stub so
// the x-axis slot stays visible. The wrapping div is overflow-x-auto so dense
// charts scroll on mobile without scaling the bars down.
//
// onBarClick fires with the bar data and barCenterPct (0–100) — the bar's
// horizontal center as a % of the SVG viewBox width. The parent uses this
// to position the tooltip.

import type { JournalMentalStateBar, JournalSummaryRange } from '../../types'

interface Props {
  bars: JournalMentalStateBar[]
  range: JournalSummaryRange
  onBarClick: (bar: JournalMentalStateBar, barCenterPct: number) => void
}

// Minimum SVG widths per range — sets when the chart starts scrolling on mobile.
const MIN_WIDTHS: Record<JournalSummaryRange, number> = {
  week: 300,
  month: 400,
  '6m': 520,
  '1yr': 720,
}

// SVG coordinate constants
const SVG_H   = 150
const PAD_L   = 22   // wide enough to fit "1"–"5" y-axis labels
const PAD_R   = 8
const PAD_T   = 8
const PAD_B   = 32   // room for x-axis labels
const CHART_H = SVG_H - PAD_T - PAD_B  // 110

// Bar fill color based on mental-state score.
function barColor(score: number | null): string {
  if (score === null) return '#e5e7eb'   // gray-200 — empty stub
  if (score >= 4)     return '#4ade80'   // green-400
  if (score >= 2)     return '#a78bfa'   // violet-400
  return '#f87171'                        // red-400
}

// Whether to show an x-axis label at position i given the range.
function showLabel(i: number, range: JournalSummaryRange): boolean {
  if (range === 'week')  return true        // all 7 labels
  if (range === 'month') return i % 5 === 0 // every 5th (~6 labels for 30 days)
  return i % 4 === 0                        // every 4th (6m: ~7, 1yr: ~13)
}

export default function MentalStateBarChart({ bars, range, onBarClick }: Props) {
  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-sm text-gray-400">
        No entries yet
      </div>
    )
  }

  const svgW   = MIN_WIDTHS[range]
  const chartW = svgW - PAD_L - PAD_R
  const slotW  = chartW / bars.length
  // Gap between bars — at least 1px, at most 15% of slot width on each side
  const barGap = Math.max(1, slotW * 0.12)
  const barW   = Math.max(2, slotW - 2 * barGap)

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgW} ${SVG_H}`}
        width={svgW}
        height={SVG_H}
        aria-hidden="true"
      >
        {/* Y-axis grid lines and score labels at scores 1–5 */}
        {[1, 2, 3, 4, 5].map(s => {
          const y = PAD_T + CHART_H - ((s - 1) / 4) * CHART_H
          return (
            <g key={s}>
              <line
                x1={PAD_L} y1={y}
                x2={svgW - PAD_R} y2={y}
                stroke="#f1f5f9" strokeWidth={1}
              />
              <text
                x={PAD_L - 4} y={y + 3}
                textAnchor="end"
                fontSize={8} fill="#cbd5e1"
              >
                {s}
              </text>
            </g>
          )
        })}

        {bars.map((bar, i) => {
          // Bar height: proportional to score (1–5), or a 4px stub for empty slots.
          const h = bar.score !== null
            ? Math.max(4, ((bar.score - 1) / 4) * CHART_H)
            : 4
          const x       = PAD_L + i * slotW + barGap
          const y       = PAD_T + CHART_H - h
          const centerX = PAD_L + i * slotW + slotW / 2
          // barCenterPct is the bar's center as a percentage of the full SVG width,
          // used by the parent to position the tooltip.
          const pct = (centerX / svgW) * 100

          return (
            <g key={`${bar.date}-${i}`}>
              {/* Visible bar */}
              <rect
                x={x} y={y}
                width={barW} height={h}
                rx={2}
                fill={barColor(bar.score)}
              />
              {/* Transparent full-slot hit area — easier to tap on mobile */}
              <rect
                x={PAD_L + i * slotW} y={PAD_T}
                width={slotW} height={CHART_H}
                fill="transparent"
                className="cursor-pointer"
                data-testid={`bar-${i}`}
                onClick={() => onBarClick(bar, pct)}
              />
              {/* X-axis label — shown based on range density */}
              {showLabel(i, range) && (
                <text
                  x={centerX} y={SVG_H - 6}
                  textAnchor="middle"
                  fontSize={9} fill="#94a3b8"
                >
                  {bar.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
