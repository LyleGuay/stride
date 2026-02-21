// ItemTable — main calorie log table with sticky header, items grouped by meal
// type, colored section headers, inline add rows, and a net total footer.
// Responsive: P/C/F are separate columns on desktop, combined on mobile.

import type { CalorieLogItem } from '../../api'
import InlineAddRow from './InlineAddRow'

// Meal types in display order.
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'exercise'] as const

// Colored left-border classes per meal type.
const MEAL_BORDER_COLORS: Record<string, string> = {
  breakfast: 'border-l-orange-400',
  lunch: 'border-l-yellow-400',
  dinner: 'border-l-indigo-400',
  snack: 'border-l-green-400',
  exercise: 'border-l-emerald-500',
}

interface Props {
  items: CalorieLogItem[]
  onInlineAdd: (type: string, name: string, calories: number) => void
  onOpenSheet: (type: string) => void
}

export default function ItemTable({ items, onInlineAdd, onOpenSheet }: Props) {
  // Group items by meal type
  const grouped: Record<string, CalorieLogItem[]> = Object.fromEntries(
    MEAL_TYPES.map(t => [t, items.filter(i => i.type === t)])
  )

  // Compute net totals (exercise subtracts from the net)
  const netCalories = items.reduce(
    (sum, i) => sum + (i.type === 'exercise' ? -i.calories : i.calories), 0
  )
  const netProtein = items.reduce((sum, i) => sum + (i.protein_g ?? 0), 0)
  const netCarbs = items.reduce((sum, i) => sum + (i.carbs_g ?? 0), 0)
  const netFat = items.reduce((sum, i) => sum + (i.fat_g ?? 0), 0)

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wide">
            <th className="text-left py-2 px-3 font-medium sticky top-0 bg-gray-50">Item</th>
            <th className="text-right py-2 px-2 font-medium w-10 sticky top-0 bg-gray-50">Qty</th>
            <th className="text-left py-2 px-2 font-medium w-12 sticky top-0 bg-gray-50">Unit</th>
            <th className="text-right py-2 px-2 font-medium w-14 sticky top-0 bg-gray-50">Cal</th>
            <th className="text-right py-2 px-2 font-medium w-10 hidden sm:table-cell sticky top-0 bg-gray-50">P</th>
            <th className="text-right py-2 px-2 font-medium w-10 hidden sm:table-cell sticky top-0 bg-gray-50">C</th>
            <th className="text-right py-2 px-2 font-medium w-10 hidden sm:table-cell sticky top-0 bg-gray-50">F</th>
            <th className="text-right py-2 px-3 font-medium sm:hidden sticky top-0 bg-gray-50">P / C / F</th>
          </tr>
        </thead>
        <tbody>
          {MEAL_TYPES.map(type => (
            <MealSection
              key={type}
              type={type}
              items={grouped[type]}
              onInlineAdd={(name, cal) => onInlineAdd(type, name, cal)}
              onOpenSheet={() => onOpenSheet(type)}
            />
          ))}

          {/* Net totals row */}
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-xs">
            <td className="py-2 px-3 text-gray-700">Net Total</td>
            <td className="py-2 px-2" />
            <td className="py-2 px-2" />
            <td className="py-2 px-2 text-right">{netCalories.toLocaleString()}</td>
            <td className="py-2 px-2 text-right text-blue-600 hidden sm:table-cell">{Math.round(netProtein)}</td>
            <td className="py-2 px-2 text-right text-amber-600 hidden sm:table-cell">{Math.round(netCarbs)}</td>
            <td className="py-2 px-2 text-right text-pink-600 hidden sm:table-cell">{Math.round(netFat)}</td>
            <td className="py-2 px-3 text-right text-gray-500 sm:hidden">
              {Math.round(netProtein)} / {Math.round(netCarbs)} / {Math.round(netFat)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// MealSection renders a meal header row, its item rows, and an inline-add row.
function MealSection({ type, items, onInlineAdd, onOpenSheet }: {
  type: string
  items: CalorieLogItem[]
  onInlineAdd: (name: string, calories: number) => void
  onOpenSheet: () => void
}) {
  const borderColor = MEAL_BORDER_COLORS[type] || 'border-l-gray-400'
  const isExercise = type === 'exercise'
  const sectionTotal = items.reduce((sum, i) => sum + i.calories, 0)
  const displayTotal = isExercise && sectionTotal > 0 ? `-${sectionTotal}` : sectionTotal.toLocaleString()
  const totalColor = isExercise ? 'text-emerald-600' : (sectionTotal > 0 ? 'text-gray-600' : 'text-gray-400')

  return (
    <>
      {/* Section header — colored left border, darker bg */}
      <tr className="border-t border-gray-200 bg-[#f0f0f4]">
        <td colSpan={4} className={`py-1.5 px-3 font-semibold text-xs text-gray-700 border-l-[3px] ${borderColor}`}>
          <span className="capitalize">{type}</span>
        </td>
        <td colSpan={3} className={`py-1.5 px-2 text-right font-semibold ${totalColor} hidden sm:table-cell`}>
          {displayTotal}
        </td>
        <td className={`py-1.5 px-3 text-right font-semibold ${totalColor} sm:hidden`}>
          {displayTotal}
        </td>
      </tr>

      {/* Item rows — indented under headers */}
      {items.map(item => (
        <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
          <td className="py-1.5 px-3 pl-[18px] font-medium text-gray-800 whitespace-nowrap">{item.item_name}</td>
          <td className="py-1.5 px-2 text-right text-gray-500 whitespace-nowrap">{item.qty ?? ''}</td>
          <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap capitalize">{item.uom ?? ''}</td>
          <td className={`py-1.5 px-2 text-right font-medium whitespace-nowrap ${isExercise ? 'text-emerald-600' : ''}`}>
            {isExercise ? `-${item.calories}` : item.calories.toLocaleString()}
          </td>
          {/* Desktop: separate P/C/F columns */}
          <td className="py-1.5 px-2 text-right text-blue-500 hidden sm:table-cell">
            {item.protein_g != null ? Math.round(item.protein_g) : ''}
          </td>
          <td className="py-1.5 px-2 text-right text-amber-500 hidden sm:table-cell">
            {item.carbs_g != null ? Math.round(item.carbs_g) : ''}
          </td>
          <td className="py-1.5 px-2 text-right text-pink-500 hidden sm:table-cell">
            {item.fat_g != null ? Math.round(item.fat_g) : ''}
          </td>
          {/* Mobile: combined P/C/F column */}
          <td className="py-1.5 px-3 text-right text-gray-400 sm:hidden">
            {item.protein_g != null || item.carbs_g != null || item.fat_g != null
              ? `${Math.round(item.protein_g ?? 0)} / ${Math.round(item.carbs_g ?? 0)} / ${Math.round(item.fat_g ?? 0)}`
              : ''}
          </td>
        </tr>
      ))}

      {/* Inline quick-add row */}
      <InlineAddRow mealType={type} onAdd={onInlineAdd} onOpenSheet={onOpenSheet} />
    </>
  )
}
