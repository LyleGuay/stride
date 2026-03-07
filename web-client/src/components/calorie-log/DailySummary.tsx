// DailySummary — compact horizontal layout with calorie ring, stats grid,
// macro row, and per-meal budget table (desktop only).

import type { DailySummary as DailySummaryData, CalorieLogItem } from '../../api'

interface Props {
  summary: DailySummaryData
}

// Compute per-meal calorie totals from items.
function mealCalories(items: CalorieLogItem[]): Record<CalorieLogItem['type'], number> {
  const totals: Record<CalorieLogItem['type'], number> = {
    breakfast: 0, lunch: 0, dinner: 0, snack: 0, exercise: 0,
  }
  for (const item of items) {
    totals[item.type] = (totals[item.type] || 0) + item.calories
  }
  return totals
}

// estimatedPace computes today's weight impact vs TDEE.
// Returns the daily lbs impact and weekly-rate equivalent, or null if TDEE unknown.
// deficit > 0 = losing weight, deficit < 0 = gaining weight.
function estimatedPace(netCalories: number, tdee?: number): {
  dailyLabel: string   // e.g. "-0.07 lbs" — actual impact today
  weeklyLabel: string  // e.g. "+0.5 lbs/wk" — projected if every day were like today
  gaining: boolean
  deficit: number
} | null {
  if (!tdee) return null
  const deficit = tdee - netCalories              // positive = losing, negative = gaining
  const dailyImpact = Math.abs(deficit) / 3500   // lbs moved today
  const weeklyRate  = Math.abs(deficit) / 500    // lbs/wk if continued
  const gaining = deficit < 0
  const sign = gaining ? '+' : '-'
  return {
    dailyLabel:  `${sign}${dailyImpact.toFixed(2)} lbs`,
    weeklyLabel: `${sign}${weeklyRate.toFixed(1)} lbs/wk`,
    gaining,
    deficit,
  }
}

// paceColor returns a Tailwind text color based on whether the current pace is
// moving toward or away from the user's target weight.
// Green = toward target, red = away from target, gray = no movement or no target.
function paceColor(gaining: boolean, deficit: number, weightLbs?: number | null, targetWeightLbs?: number | null): string {
  if (deficit === 0 || !weightLbs || !targetWeightLbs) return 'text-gray-400'
  const wantToLose = targetWeightLbs < weightLbs
  const wantToGain = targetWeightLbs > weightLbs
  if ((wantToLose && !gaining) || (wantToGain && gaining)) return 'text-emerald-600'
  if ((wantToLose && gaining) || (wantToGain && !gaining)) return 'text-red-500'
  return 'text-gray-400' // already at target
}

export default function DailySummary({ summary }: Props) {
  const {
    net_calories, calories_food, calories_exercise,
    calorie_budget, protein_g, carbs_g, fat_g, items, settings,
  } = summary

  // Ring SVG calculations — r=52, circumference = 2*PI*52
  const circumference = 2 * Math.PI * 52
  const ratio = calorie_budget > 0 ? Math.min(net_calories / calorie_budget, 1) : 0
  const offset = circumference * (1 - Math.max(ratio, 0))
  const ringColor = net_calories <= calorie_budget ? '#22c55e' : '#ef4444'

  const meals = mealCalories(items)
  const pace = estimatedPace(net_calories, settings.computed_tdee)
  const exerciseTarget = settings.exercise_target_calories ?? 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex items-center gap-6">
      {/* Calorie ring */}
      <div className="relative w-24 h-24 shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" strokeWidth={10} stroke="#e5e7eb" />
          <circle
            cx="60" cy="60" r="52" fill="none" strokeWidth={10} stroke={ringColor}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold">{net_calories.toLocaleString()}</span>
          <span className="text-[10px] text-gray-400">net</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="flex-1 min-w-0">
        {/* Calorie row — shows eaten, exercise (actual/target), and net budget */}
        <div className="grid grid-cols-3 gap-x-4 text-xs mb-2">
          <div>
            <div className="text-gray-400 mb-0.5">Eaten</div>
            <span className="font-semibold text-sm">{calories_food.toLocaleString()}</span>
          </div>
          <div>
            <div className="text-gray-400 mb-0.5">Exercise</div>
            {exerciseTarget > 0 ? (
              // Show actual/target when a target is configured
              <span className="font-semibold text-sm text-emerald-600">
                {calories_exercise.toLocaleString()} / {exerciseTarget.toLocaleString()}
              </span>
            ) : (
              <span className="font-semibold text-sm text-emerald-600">
                {calories_exercise > 0 ? calories_exercise.toLocaleString() : '0'}
              </span>
            )}
          </div>
          <div>
            <div className="text-gray-400 mb-0.5">Budget</div>
            <span className="font-semibold text-sm">{calorie_budget.toLocaleString()}</span>
          </div>
        </div>

        {/* Macro row — protein is a minimum to reach (amber → green), carbs/fat are budgets (red if over) */}
        <div className="grid grid-cols-3 gap-x-4 text-xs border-t border-gray-100 pt-2">
          <div>
            <span className="text-blue-500 font-medium">Protein</span><br />
            <span className="font-semibold">{Math.round(protein_g)}</span>
            <span className="text-gray-400"> / {settings.protein_target_g}g</span>
            {protein_g >= settings.protein_target_g
              ? <span className="ml-1 text-green-500 text-[10px]">✓</span>
              : <span className="ml-1 text-amber-400 text-[10px]">↑</span>}
          </div>
          <div>
            <span className="text-amber-500 font-medium">Carbs</span><br />
            <span className="font-semibold">{Math.round(carbs_g)}</span>
            <span className="text-gray-400"> / {settings.carbs_target_g}g</span>
            {carbs_g > settings.carbs_target_g &&
              <span className="ml-1 text-red-500 text-[10px]">!</span>}
          </div>
          <div>
            <span className="text-pink-500 font-medium">Fat</span><br />
            <span className="font-semibold">{Math.round(fat_g)}</span>
            <span className="text-gray-400"> / {settings.fat_target_g}g</span>
            {fat_g > settings.fat_target_g &&
              <span className="ml-1 text-red-500 text-[10px]">!</span>}
          </div>
        </div>
      </div>

      {/* Per-meal budget table — hidden on mobile */}
      <div className="hidden sm:block shrink-0 border-l border-gray-100 pl-4">
        <table className="text-xs">
          <thead>
            <tr className="text-gray-400">
              <th className="text-left pr-3 font-normal">Type</th>
              <th className="text-right pr-3 font-normal">Cur</th>
              <th className="text-right font-normal">Budg</th>
            </tr>
          </thead>
          <tbody>
            {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(type => {
              const actual = meals[type] || 0
              const budget = settings[`${type}_budget` as keyof typeof settings] as number
              const over = actual > budget
              return (
                <tr key={type}>
                  <td className="pr-3 py-0.5 capitalize">{type}</td>
                  <td className={`text-right pr-3 font-medium ${over ? 'text-red-500' : ''}`}>
                    {actual.toLocaleString()}
                  </td>
                  <td className="text-right text-gray-400">{budget.toLocaleString()}</td>
                </tr>
              )
            })}
            {/* Total row — sum of all meal budgets vs food eaten */}
            {(() => {
              const totalBudget = settings.breakfast_budget + settings.lunch_budget +
                settings.dinner_budget + settings.snack_budget
              const over = calories_food > totalBudget
              return (
                <tr className="border-t border-gray-100 font-semibold">
                  <td className="pr-3 pt-1.5 pb-0.5">Total</td>
                  <td className={`text-right pr-3 pt-1.5 pb-0.5 ${over ? 'text-red-500' : ''}`}>
                    {calories_food.toLocaleString()}
                  </td>
                  <td className="text-right text-gray-500 pt-1.5 pb-0.5">{totalBudget.toLocaleString()}</td>
                </tr>
              )
            })()}
          </tbody>
        </table>

        {/* Estimated weight impact — daily lbs with weekly-rate tooltip */}
        {pace && (
          <div className={`mt-2 pt-2 border-t border-gray-100 text-xs font-medium flex items-center gap-1 ${paceColor(pace.gaining, pace.deficit, settings.weight_lbs, settings.target_weight_lbs)}`}>
            {pace.dailyLabel} Estimated
            {/* Info icon — hover reveals the weekly-rate equivalent */}
            <span className="relative group cursor-default">
              <svg className="w-3.5 h-3.5 opacity-50" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd"/>
              </svg>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-gray-800 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                ≈ {pace.weeklyLabel} if continued all week
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
