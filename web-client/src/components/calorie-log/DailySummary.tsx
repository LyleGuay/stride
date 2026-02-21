// DailySummary — compact horizontal layout with calorie ring, stats grid,
// macro row, and per-meal budget table (desktop only).

import type { DailySummary as DailySummaryData, CalorieLogItem } from '../../api'

interface Props {
  summary: DailySummaryData
}

// Compute per-meal calorie totals from items.
function mealCalories(items: CalorieLogItem[]): Record<string, number> {
  const totals: Record<string, number> = {
    breakfast: 0, lunch: 0, dinner: 0, snack: 0, exercise: 0,
  }
  for (const item of items) {
    totals[item.type] = (totals[item.type] || 0) + item.calories
  }
  return totals
}

export default function DailySummary({ summary }: Props) {
  const {
    net_calories, calories_left, calories_food, calories_exercise,
    calorie_budget, protein_g, carbs_g, fat_g, items, settings,
  } = summary

  // Ring SVG calculations — r=52, circumference = 2*PI*52
  const circumference = 2 * Math.PI * 52
  const ratio = calorie_budget > 0 ? Math.min(net_calories / calorie_budget, 1) : 0
  const offset = circumference * (1 - Math.max(ratio, 0))
  const ringColor = net_calories <= calorie_budget ? '#22c55e' : '#ef4444'

  const meals = mealCalories(items)

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
          <span className="text-lg font-bold">{calories_left.toLocaleString()}</span>
          <span className="text-[10px] text-gray-400">left</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="flex-1 min-w-0">
        {/* Calorie row */}
        <div className="grid grid-cols-3 gap-x-4 text-xs mb-2">
          <div>
            <span className="text-gray-400">Eaten</span><br />
            <span className="font-semibold text-sm">{calories_food.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-400">Exercise</span><br />
            <span className="font-semibold text-sm text-emerald-600">
              {calories_exercise > 0 ? `-${calories_exercise.toLocaleString()}` : '0'}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Budget</span><br />
            <span className="font-semibold text-sm">{calorie_budget.toLocaleString()}</span>
          </div>
        </div>

        {/* Macro row */}
        <div className="grid grid-cols-3 gap-x-4 text-xs border-t border-gray-100 pt-2">
          <div>
            <span className="text-blue-500 font-medium">Protein</span><br />
            <span className="font-semibold">{Math.round(protein_g)}</span>
            <span className="text-gray-400"> / {settings.protein_target_g}g</span>
          </div>
          <div>
            <span className="text-amber-500 font-medium">Carbs</span><br />
            <span className="font-semibold">{Math.round(carbs_g)}</span>
            <span className="text-gray-400"> / {settings.carbs_target_g}g</span>
          </div>
          <div>
            <span className="text-pink-500 font-medium">Fat</span><br />
            <span className="font-semibold">{Math.round(fat_g)}</span>
            <span className="text-gray-400"> / {settings.fat_target_g}g</span>
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
            <tr className="text-emerald-600">
              <td className="pr-3 py-0.5">Exercise</td>
              <td className="text-right pr-3 font-medium">
                {(meals.exercise || 0) > 0 ? `-${meals.exercise}` : '0'}
              </td>
              <td className="text-right text-gray-400">&mdash;</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
