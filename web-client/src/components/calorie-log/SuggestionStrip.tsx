// SuggestionStrip — renders AI nutrition suggestions in different visual states.
// Used by both InlineAddRow (as a column-aligned table row) and AddItemSheet (as a card).
// Pure presentational component — all state management is in the parent.

import type { AISuggestion } from '../../types'
import type { SuggestionState } from '../../hooks/useSuggestion'

interface Props {
  state: SuggestionState
  onApply: (suggestion: AISuggestion) => void
  onDismiss: () => void
  // "inline" renders as a column-aligned table row, "card" renders as a div
  variant: 'inline' | 'card'
  // Merged suggestion for inline display — shows user's dirty field values
  // merged with AI values, giving an accurate preview of what Apply produces.
  // Only used by the inline variant.
  displaySuggestion?: AISuggestion
  // Whether this is an exercise row (hides P/C/F columns in inline variant)
  isExercise?: boolean
}

// Maps confidence level (1-5) to a human-readable label for the tooltip.
const CONFIDENCE_LABELS: Record<number, string> = {
  5: 'Accuracy: Very high — known nutritional data',
  4: 'Accuracy: High — very close estimate',
  3: 'Accuracy: Medium — reasonable estimate',
  2: 'Accuracy: Low — rough guess',
  1: 'Accuracy: Very low — uncertain estimate',
}

function confidenceTooltip(confidence: number): string {
  return CONFIDENCE_LABELS[confidence] || `Accuracy: ${confidence}/5`
}

export default function SuggestionStrip({ state, onApply, onDismiss, variant, displaySuggestion, isExercise }: Props) {
  if (state.status === 'idle' || state.status === 'error') return null

  /* ─── Card variant (AddItemSheet) ──────────────────────────────────── */

  if (variant === 'card') {
    return (
      <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
        {state.status === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-indigo-500">
            <span className="animate-pulse">✦</span>
            <span className="text-indigo-400">Looking up nutrition...</span>
          </div>
        )}

        {state.status === 'unrecognized' && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-amber-600">
              ⚠ Couldn't recognize this food. Enter nutrition manually.
            </span>
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 text-gray-400 hover:text-gray-600 text-xs px-0.5"
              aria-label="Dismiss suggestion"
            >
              ✕
            </button>
          </div>
        )}

        {state.status === 'success' && (() => {
          const s = state.suggestion
          const ex = s.protein_g === 0 && s.carbs_g === 0 && s.fat_g === 0
          return (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-indigo-700 min-w-0">
                <span className="text-indigo-500 shrink-0">✦</span>
                <span className="font-medium truncate">{s.item_name}</span>
                <span className="text-indigo-400 shrink-0">·</span>
                <span className="shrink-0">{s.qty} × {s.uom}</span>
                <span className="text-indigo-400 shrink-0">·</span>
                <span className="shrink-0">{s.calories} cal</span>
                {!ex && (
                  <>
                    <span className="text-indigo-400 shrink-0 hidden sm:inline">·</span>
                    <span className="shrink-0 hidden sm:inline">{s.protein_g}P · {s.carbs_g}C · {s.fat_g}F</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onApply(s)}
                  title={confidenceTooltip(s.confidence)}
                  className="bg-indigo-600 text-white text-[11px] px-2 py-0.5 rounded hover:bg-indigo-700"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="text-gray-400 hover:text-gray-600 text-xs px-0.5"
                  aria-label="Dismiss suggestion"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  /* ─── Inline variant (InlineAddRow) — column-aligned table row ─────── */

  // Loading and unrecognized span all columns.
  // Each <tr> has a unique key so React fully remounts when transitioning
  // between colSpan (loading/unrecognized) and individual cells (success).
  if (state.status === 'loading') {
    return (
      <tr key="suggest-loading" className="bg-indigo-50/60">
        <td colSpan={8} className="py-1 px-[14px]">
          <div className="flex items-center gap-2 text-xs text-indigo-500">
            <span className="animate-pulse">✦</span>
            <span className="text-indigo-400">Looking up nutrition...</span>
          </div>
        </td>
      </tr>
    )
  }

  if (state.status === 'unrecognized') {
    return (
      <tr key="suggest-unrecognized" className="bg-amber-50/60">
        <td colSpan={8} className="py-1 px-[14px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-amber-600">
              ⚠ Couldn't recognize this food. Enter nutrition manually.
            </span>
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 text-gray-400 hover:text-gray-600 text-xs px-0.5"
              aria-label="Dismiss suggestion"
            >
              ✕
            </button>
          </div>
        </td>
      </tr>
    )
  }

  // Success — column-aligned values. Use displaySuggestion (merged with user
  // edits) if provided, otherwise fall back to the raw AI suggestion.
  const s = displaySuggestion ?? state.suggestion

  return (
    <tr key="suggest-success" className="bg-indigo-50/60">
      {/* Name cell: star + name are a single clickable apply button, dismiss ✕ is separate */}
      <td className="py-1 pl-[14px] pr-1">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => onApply(state.suggestion)}
            className="flex items-center gap-1 min-w-0 cursor-pointer text-indigo-600 hover:text-indigo-800 transition-colors"
            title={confidenceTooltip(state.suggestion.confidence)}
          >
            <span className="shrink-0 text-xs">✦</span>
            <span className="text-xs font-medium truncate">{s.item_name}</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-xs px-0.5 ml-auto"
            aria-label="Dismiss suggestion"
          >
            ✕
          </button>
        </div>
      </td>

      {/* Qty */}
      <td className="py-1 px-1 w-14 text-xs text-right text-indigo-600">
        {s.qty}
      </td>

      {/* Unit */}
      <td className="py-1 px-1 w-20 text-xs text-indigo-600">
        {s.uom}
      </td>

      {/* Calories */}
      <td className="py-1 px-1 w-16 text-xs text-right text-indigo-600">
        {s.calories}
      </td>

      {/* P/C/F — match visibility of the input row */}
      <td className={`py-1 px-1 w-12 text-xs text-right text-indigo-600 ${isExercise ? 'hidden' : 'hidden sm:table-cell'}`}>
        {!isExercise && s.protein_g}
      </td>
      <td className={`py-1 px-1 w-12 text-xs text-right text-indigo-600 ${isExercise ? 'hidden' : 'hidden sm:table-cell'}`}>
        {!isExercise && s.carbs_g}
      </td>
      <td className={`py-1 px-1 w-12 text-xs text-right text-indigo-600 ${isExercise ? 'hidden' : 'hidden sm:table-cell'}`}>
        {!isExercise && s.fat_g}
      </td>

      {/* Mobile combined column — empty placeholder */}
      <td className="sm:hidden" />
    </tr>
  )
}
