// MealPlanGhostRow — a <tr> rendered inside ItemTable's MealSection for each
// planned-but-unlogged meal plan entry. Styled faded with a dashed border to
// signal it is a plan item, not a real log entry. Shows a "Log" button that
// triggers the appropriate logging flow (qty-scale modal for food/recipe,
// AddItemSheet pre-filled for takeout).

import type { MealPlanEntry } from '../../api'

interface Props {
  entry: MealPlanEntry
  onLog: (entry: MealPlanEntry) => void
}

export default function MealPlanGhostRow({ entry, onLog }: Props) {
  // Display name: food/recipe use item_name; takeout uses takeout_name.
  const displayName =
    entry.entry_type === 'takeout'
      ? (entry.takeout_name ?? 'Takeout')
      : (entry.item_name ?? '—')

  const displayCalories =
    entry.calories != null ? `${entry.calories.toLocaleString()} cal` : null

  // Takeout calorie limit display — shown in Cal column instead of calories.
  const takeoutLimit =
    entry.entry_type === 'takeout' && entry.calorie_limit != null
      ? `≤${entry.calorie_limit.toLocaleString()} cal`
      : null

  return (
    <tr
      className="border-t border-dashed border-gray-200 opacity-60 hover:opacity-80 transition-opacity"
      data-testid="meal-plan-ghost-row"
    >
      {/* Name cell — calendar icon + label + takeout constraint icons. colSpan 3 (Item + Qty + Unit) */}
      <td colSpan={3} className="py-1.5 px-3 pl-[18px]">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Calendar icon — signals this is a meal plan entry */}
          <svg
            className="w-3.5 h-3.5 text-gray-400 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <span className="text-xs text-gray-500 truncate">{displayName}</span>

          {/* Takeout constraint icons — each has a tooltip */}
          {entry.entry_type === 'takeout' && entry.no_snacks && (
            <span className="relative group shrink-0 inline-flex">
              {/* No snacks: X over a cookie-ish circle */}
              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6" />
              </svg>
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-gray-800 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                No snacks
              </span>
            </span>
          )}
          {entry.entry_type === 'takeout' && entry.no_sides && (
            <span className="relative group shrink-0 inline-flex">
              {/* No sides: X over a plate */}
              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 12a9 9 0 0118 0" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6" />
              </svg>
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-gray-800 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                No sides
              </span>
            </span>
          )}
        </div>
      </td>

      {/* Cal column — calorie limit for takeout, planned calories otherwise */}
      <td className="py-1.5 px-2 text-right text-xs text-gray-400 whitespace-nowrap">
        {takeoutLimit ?? displayCalories}
      </td>

      {/* Desktop P/C/F columns — empty for ghost rows */}
      <td className="hidden sm:table-cell" />
      <td className="hidden sm:table-cell" />

      {/* Log button — desktop only in last desktop column; mobile in combined column */}
      <td className="py-1 px-2 text-right hidden sm:table-cell">
        <button
          onClick={() => onLog(entry)}
          className="text-[11px] font-medium px-2 py-1 rounded border border-stride-300 text-stride-600 hover:bg-stride-50 transition-colors"
        >
          Log
        </button>
      </td>

      {/* Mobile: combined P/C/F column with Log button */}
      <td className="py-1 px-3 text-right sm:hidden">
        <button
          onClick={() => onLog(entry)}
          className="text-[11px] font-medium px-2 py-1 rounded border border-stride-300 text-stride-600 hover:bg-stride-50 transition-colors"
        >
          Log
        </button>
      </td>
    </tr>
  )
}
