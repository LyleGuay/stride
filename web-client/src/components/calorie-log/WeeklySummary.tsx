// WeeklySummary — the Weekly tab content for the CalorieLog page.
// Shows a week navigator, aggregate stats cards, a net-calories SVG bar chart,
// an estimated weight impact card, and a scrollable day summaries table.
// Clicking a table row navigates to that day in the Daily tab via onNavigateToDay.
// Data is fetched by the parent (CalorieLog) and passed as props.

import { useState } from 'react'
import type { WeekDaySummary } from '../../types'
import { todayString, getMondayOf, shiftWeek, formatWeekRange, dayLabel, dayNumber } from '../../utils/dates'

interface WeeklySummaryProps {
  days: WeekDaySummary[]
  loading: boolean
  error: string | null
  weekStart: string
  onWeekChange: (weekStart: string) => void
  onNavigateToDay: (date: string) => void
}

/* ─── SVG chart layout constants ───────────────────────────────────── */

// Chart viewBox is 430×170. Bars occupy x 30–415, y 15–130. Labels below.
const X_START = 30
const X_END   = 415
const BAR_W   = 30
const Y_TOP   = 15
const Y_BOT   = 130
const BAR_H   = Y_BOT - Y_TOP   // 115 usable pixels for bars
const LBL_Y   = 144             // weekday name y
const DATE_Y  = 156             // date number y
const VB_H    = 170             // total viewBox height
const SLOT_W  = (X_END - X_START) / 7  // ≈55.7 px per day slot

// barX returns the left x of bar i (0=Mon, 6=Sun), centered in its slot.
const barX = (i: number) => X_START + i * SLOT_W + (SLOT_W - BAR_W) / 2
// slotCenter returns the center x of slot i for labels and tooltips.
const slotCenter = (i: number) => X_START + (i + 0.5) * SLOT_W

export default function WeeklySummary({ days, loading, error, weekStart, onWeekChange, onNavigateToDay }: WeeklySummaryProps) {
  const [tooltipIdx, setTooltipIdx] = useState(-1)

  const currentWeekStart = getMondayOf(todayString())
  const isCurrentWeek = weekStart === currentWeekStart

  /* ─── Aggregate stats (only over days that have data) ─────────────── */

  const dataDays = days.filter(d => d.has_data)
  const totalFood     = dataDays.reduce((s, d) => s + d.calories_food, 0)
  const totalExercise = dataDays.reduce((s, d) => s + d.calories_exercise, 0)
  const budget        = days[0]?.calorie_budget ?? 0
  const weeklyBudget  = budget * 7

  // Weight impact: sum of surplus/deficit across tracked days → lbs (3500 cal/lb)
  const totalLeft    = dataDays.reduce((s, d) => s + d.calories_left, 0)
  const weightImpact = totalLeft / 3500

  // Progress bar: net calories consumed vs period budget (budget × tracked days)
  const netConsumed  = dataDays.reduce((s, d) => s + d.net_calories, 0)
  const periodBudget = budget * dataDays.length
  const barPct       = periodBudget > 0 ? Math.min(100, (netConsumed / periodBudget) * 100) : 0
  const isOverBudget = netConsumed > periodBudget

  /* ─── SVG chart scale ──────────────────────────────────────────────── */

  // Scale bars against a round max value so grid lines land on nice numbers.
  const dataMax = Math.max(budget, 1, ...days.map(d => d.net_calories))
  // Round up to nearest 1000 for a clean grid
  const gridMax = Math.ceil(dataMax / 1000) * 1000
  const scaleY  = (v: number) => BAR_H * (Math.max(0, v) / gridMax)
  const budgetLineY = Y_BOT - scaleY(budget)

  // Y-axis grid lines: 4 evenly spaced steps
  const gridSteps = [1, 0.75, 0.5, 0.25].map(f => ({
    y: Y_BOT - BAR_H * f,
    label: `${Math.round(gridMax * f / 1000)}k`,
  }))

  /* ─── Week date range label for table header ───────────────────────── */
  const weekRangeLabel = days.length === 7
    ? `${new Date(days[0].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(days[6].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : formatWeekRange(weekStart)

  return (
    <div className="space-y-4">

      {/* ── Week navigator ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onWeekChange(shiftWeek(weekStart, -1))}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 active:bg-gray-200"
          aria-label="Previous week"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
        </button>
        <div className="text-center">
          <div className="font-semibold text-gray-900">{formatWeekRange(weekStart)}</div>
          {isCurrentWeek
            ? <div className="text-xs text-blue-600 font-medium">Current week</div>
            : <div className="text-xs text-gray-400">&nbsp;</div>
          }
        </div>
        <button
          onClick={() => onWeekChange(shiftWeek(weekStart, 1))}
          disabled={isCurrentWeek}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:bg-gray-200 disabled:text-gray-200 disabled:cursor-not-allowed"
          aria-label="Next week"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
          </svg>
        </button>
      </div>

      {/* ── Loading spinner ─────────────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────── */}
      {error && (
        <div className="text-center py-8 text-red-500 text-sm">
          <p>Failed to load summary data</p>
          <button
            onClick={() => onWeekChange(shiftWeek(shiftWeek(weekStart, 1), -1))}
            className="mt-2 underline text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── Stats cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
              <div className="text-[11px] text-gray-400 mb-1 font-medium uppercase tracking-wide">Food</div>
              <div className="text-xl font-bold text-gray-900 leading-tight">{totalFood.toLocaleString()}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">cal so far</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
              <div className="text-[11px] text-gray-400 mb-1 font-medium uppercase tracking-wide">Exercise</div>
              <div className="text-xl font-bold text-green-600 leading-tight">{totalExercise.toLocaleString()}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">cal burned</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
              <div className="text-[11px] text-gray-400 mb-1 font-medium uppercase tracking-wide">Budget</div>
              <div className="text-xl font-bold text-gray-900 leading-tight">{weeklyBudget.toLocaleString()}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">cal / week</div>
            </div>
          </div>

          {/* ── Net Calories bar chart ────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Net Calories This Week</h3>
              {dataDays.length > 0 && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap
                  ${totalLeft >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                  {totalLeft >= 0
                    ? `${Math.abs(totalLeft).toLocaleString()} under budget`
                    : `${Math.abs(totalLeft).toLocaleString()} over budget`}
                </span>
              )}
            </div>

            {/* SVG bar chart with Y-axis, grid lines, day labels, date numbers, tooltip */}
            <div className="w-full overflow-x-auto -mx-1 px-1">
              <svg
                viewBox={`0 0 430 ${VB_H}`}
                className="w-full"
                style={{ minWidth: 300 }}
                onClick={() => setTooltipIdx(-1)}
              >
                {/* Horizontal grid lines */}
                {gridSteps.map(({ y, label }) => (
                  <g key={label}>
                    <line x1={X_START} y1={y} x2={X_END} y2={y} stroke="#f3f4f6" strokeWidth={1} />
                    <text x={X_START - 4} y={y + 3} textAnchor="end" fontSize={8.5} fill="#d1d5db">{label}</text>
                  </g>
                ))}
                {/* Baseline */}
                <line x1={X_START} y1={Y_BOT} x2={X_END} y2={Y_BOT} stroke="#f3f4f6" strokeWidth={1} />

                {/* Budget reference line — blue dashed */}
                {budget > 0 && (
                  <>
                    <line
                      x1={X_START} y1={budgetLineY}
                      x2={X_END}   y2={budgetLineY}
                      stroke="#2563eb" strokeWidth={1.5} strokeDasharray="5,3" opacity={0.7}
                    />
                    <text x={X_END + 2} y={budgetLineY + 3} fontSize={8} fill="#2563eb" opacity={0.8}>
                      {budget.toLocaleString()}
                    </text>
                  </>
                )}

                {/* Bars + day labels */}
                {days.map((day, i) => {
                  const isToday = day.date === todayString()
                  const isFuture = day.date > todayString()
                  const cx = slotCenter(i)
                  const bx = barX(i)

                  const barHeight = day.has_data ? Math.max(3, scaleY(day.net_calories)) : 8
                  const barTop    = Y_BOT - barHeight
                  const fill = !day.has_data || isFuture
                    ? '#f3f4f6'
                    : day.net_calories <= budget ? '#22c55e' : '#ef4444'

                  const labelColor = isFuture ? '#d1d5db' : isToday ? '#2563eb' : '#6b7280'

                  return (
                    <g key={day.date} onClick={e => { e.stopPropagation(); setTooltipIdx(i === tooltipIdx ? -1 : i) }}>
                      <rect
                        x={bx} y={barTop} width={BAR_W} height={barHeight}
                        fill={fill} rx={3} opacity={0.85}
                        className={day.has_data && !isFuture ? 'cursor-pointer hover:opacity-100' : ''}
                      />
                      {/* No-data placeholder dash */}
                      {!day.has_data && !isFuture && (
                        <text x={cx} y={Y_BOT - 12} textAnchor="middle" fontSize={9} fill="#d1d5db">—</text>
                      )}
                      {/* Today indicator dot above bar */}
                      {isToday && <circle cx={cx} cy={barTop - 5} r={3} fill="#2563eb" />}

                      {/* Weekday name */}
                      <text
                        x={cx} y={LBL_Y}
                        textAnchor="middle" fontSize={9.5}
                        fill={labelColor}
                        fontWeight={isToday ? '600' : undefined}
                      >
                        {dayLabel(day.date)}
                      </text>
                      {/* Date number */}
                      <text
                        x={cx} y={DATE_Y}
                        textAnchor="middle" fontSize={8}
                        fill={isToday ? '#2563eb' : '#9ca3af'}
                        fontWeight={isToday ? '600' : undefined}
                      >
                        {dayNumber(day.date)}
                      </text>
                    </g>
                  )
                })}

                {/* Tooltip — dark callout above clicked bar */}
                {tooltipIdx >= 0 && days[tooltipIdx] && (() => {
                  const day = days[tooltipIdx]
                  const cx = slotCenter(tooltipIdx)
                  const barH = day.has_data ? Math.max(3, scaleY(day.net_calories)) : 8
                  const tipY = Math.max(10, Y_BOT - barH - 56)
                  // Clamp x so tooltip doesn't overflow chart
                  const tx = Math.min(Math.max(cx, X_START + 55), X_END - 55)
                  const delta = day.calories_left
                  return (
                    <g>
                      <rect x={tx - 55} y={tipY} width={110} height={48} rx={5} fill="#1f2937" />
                      <text x={tx - 47} y={tipY + 15} fontSize={9} fill="#9ca3af">
                        {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </text>
                      <text x={tx - 47} y={tipY + 28} fontSize={9} fill="#9ca3af">Net calories</text>
                      <text x={tx + 47} y={tipY + 28} fontSize={9} fill="white" textAnchor="end" fontWeight="600">
                        {day.net_calories.toLocaleString()}
                      </text>
                      <text x={tx - 47} y={tipY + 41} fontSize={9} fill="#9ca3af">vs. budget</text>
                      <text x={tx + 47} y={tipY + 41} fontSize={9} textAnchor="end" fontWeight="600"
                        fill={delta >= 0 ? '#22c55e' : '#ef4444'}>
                        {delta >= 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}
                      </text>
                    </g>
                  )
                })()}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-green-500 opacity-85" />Under budget
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-red-500 opacity-85" />Over budget
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="16" height="8" viewBox="0 0 16 8">
                  <line x1={0} y1={4} x2={16} y2={4} stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4,2" opacity={0.7} />
                </svg>
                Budget ({budget.toLocaleString()})
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-gray-200" />No data
              </div>
            </div>
          </div>

          {/* ── Estimated Weight Impact ───────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              {/* Left: heading, tracked days count, progress bar */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-700">Estimated Weight Impact</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Based on {dataDays.length} of 7 days tracked this week
                </p>
                {dataDays.length > 0 && (
                  <div className="mt-2.5">
                    <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                      <span>{netConsumed.toLocaleString()} net cal consumed</span>
                      <span>{periodBudget.toLocaleString()} budget ({dataDays.length} days)</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isOverBudget ? 'bg-red-400' : 'bg-green-400'}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              {/* Right: big impact number */}
              {dataDays.length > 0 && (
                <div className="text-right flex-shrink-0">
                  <div className={`text-2xl font-bold leading-tight ${weightImpact >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {weightImpact >= 0 ? '+' : ''}{weightImpact.toFixed(2)} lbs
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {weightImpact >= 0 ? 'ahead of goal pace' : 'behind goal pace'}
                  </div>
                </div>
              )}
            </div>

            {/* Info note */}
            {dataDays.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-start gap-2 text-[11px] text-gray-400">
                <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>
                </svg>
                <span>
                  {Math.abs(totalLeft).toLocaleString()} cal {totalLeft >= 0 ? 'under' : 'over'} {dataDays.length}-day budget ÷ 3,500 cal/lb ≈ {Math.abs(weightImpact).toFixed(2)} lbs. Your budget already targets your desired loss rate — staying at budget = on pace.
                </span>
              </div>
            )}
          </div>

          {/* ── Day Summaries table ───────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Table header row */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Day Summaries</h3>
              <span className="text-[11px] text-gray-400">{weekRangeLabel}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wide">
                    <th className="sticky left-0 bg-gray-50 z-10 px-3 py-2 text-left font-medium border-r border-gray-100">Date</th>
                    <th className="px-2 py-2 text-right font-medium">Budget</th>
                    <th className="px-2 py-2 text-right font-medium">Food</th>
                    <th className="px-2 py-2 text-right font-medium">Exer.</th>
                    <th className="px-2 py-2 text-right font-medium">Net</th>
                    <th className="px-2 py-2 text-right font-medium pr-3">Left</th>
                    {/* Separator before macros */}
                    <th className="px-2 py-2 text-right font-medium border-l border-gray-100">Pro. g</th>
                    <th className="px-2 py-2 text-right font-medium">Carbs g</th>
                    <th className="px-2 py-2 text-right font-medium pr-3">Fat g</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {days.map(day => {
                    const isToday  = day.date === todayString()
                    const isFuture = day.date > todayString()
                    const stickyBg = isToday ? 'bg-blue-50/40' : 'bg-white'

                    return (
                      <tr
                        key={day.date}
                        onClick={() => !isFuture && day.has_data && onNavigateToDay(day.date)}
                        className={`
                          ${isToday ? 'bg-blue-50/40' : ''}
                          ${isFuture ? 'opacity-35' : day.has_data ? 'hover:bg-gray-50 transition-colors cursor-pointer' : ''}
                        `}
                      >
                        {/* Two-line date cell: weekday name + date, "today" badge */}
                        <td className={`sticky left-0 z-10 ${stickyBg} px-3 py-2.5 border-r ${isToday ? 'border-blue-100' : 'border-gray-100'}`}>
                          <div className={`font-semibold flex items-center gap-1 ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                            {dayLabel(day.date)}
                            {isToday && (
                              <span className="text-[9px] font-medium text-blue-600 bg-blue-100 px-1 py-0.5 rounded">today</span>
                            )}
                          </div>
                          <div className={`font-normal ${isToday ? 'text-blue-400' : 'text-gray-400'}`}>
                            {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        </td>

                        {isFuture ? (
                          <>
                            <td className="px-2 py-2.5 text-right text-gray-400">{day.calorie_budget.toLocaleString()}</td>
                            <td colSpan={7} className="px-2 py-2.5 text-center text-gray-300 italic text-[11px]">No entries yet</td>
                          </>
                        ) : !day.has_data ? (
                          <td colSpan={8} className="px-2 py-2.5 text-center text-gray-300">—</td>
                        ) : (
                          <>
                            <td className="px-2 py-2.5 text-right text-gray-500">{day.calorie_budget.toLocaleString()}</td>
                            <td className="px-2 py-2.5 text-right text-gray-700">{day.calories_food.toLocaleString()}</td>
                            {/* Exercise: show "—" when none */}
                            <td className={`px-2 py-2.5 text-right ${day.calories_exercise > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                              {day.calories_exercise > 0 ? day.calories_exercise.toLocaleString() : '—'}
                            </td>
                            <td className="px-2 py-2.5 text-right font-semibold text-gray-800">{day.net_calories.toLocaleString()}</td>
                            <td className={`px-2 py-2.5 text-right font-semibold pr-3 ${day.calories_left >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {day.calories_left >= 0 ? `+${day.calories_left.toLocaleString()}` : day.calories_left.toLocaleString()}
                            </td>
                            <td className="px-2 py-2.5 text-right text-gray-500 border-l border-gray-100">{Math.round(day.protein_g)}</td>
                            <td className="px-2 py-2.5 text-right text-gray-500">{Math.round(day.carbs_g)}</td>
                            <td className="px-2 py-2.5 text-right text-gray-500 pr-3">{Math.round(day.fat_g)}</td>
                          </>
                        )}
                      </tr>
                    )
                  })}

                  {/* Totals row — sums across days that have data */}
                  {dataDays.length > 0 && (
                    <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                      <td className="sticky left-0 bg-gray-50 z-10 px-3 py-2.5 border-r border-gray-100">
                        <div className="text-gray-600">Total</div>
                        <div className="text-[10px] font-normal text-gray-400">{dataDays.length} days</div>
                      </td>
                      <td className="px-2 py-2.5 text-right text-gray-500">{(budget * dataDays.length).toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right text-gray-700">{totalFood.toLocaleString()}</td>
                      <td className={`px-2 py-2.5 text-right ${totalExercise > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                        {totalExercise > 0 ? totalExercise.toLocaleString() : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right text-gray-800">{netConsumed.toLocaleString()}</td>
                      <td className={`px-2 py-2.5 text-right pr-3 ${totalLeft >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {totalLeft >= 0 ? `+${totalLeft.toLocaleString()}` : totalLeft.toLocaleString()}
                      </td>
                      <td className="px-2 py-2.5 text-right text-gray-500 border-l border-gray-100">
                        {Math.round(dataDays.reduce((s, d) => s + d.protein_g, 0))}
                      </td>
                      <td className="px-2 py-2.5 text-right text-gray-500">
                        {Math.round(dataDays.reduce((s, d) => s + d.carbs_g, 0))}
                      </td>
                      <td className="px-2 py-2.5 text-right text-gray-500 pr-3">
                        {Math.round(dataDays.reduce((s, d) => s + d.fat_g, 0))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
