// LogFromRecipeSheet — bottom sheet for logging a recipe to the calorie log.
// Shows a serving-count spinner with live macro scaling. Mobile: bottom sheet.
// Desktop: centered modal.

import { useState, useEffect, type FormEvent } from 'react'
import { logFromRecipe } from '../../api'
import type { RecipeDetail } from '../../types'
import { todayString } from '../../utils/dates'

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch',     label: 'Lunch'     },
  { value: 'dinner',    label: 'Dinner'    },
  { value: 'snack',     label: 'Snack'     },
]

interface Props {
  open: boolean
  onClose: () => void
  recipe: RecipeDetail
  // Called after a successful save so the parent can refresh the calorie log
  onSaved?: () => void
}

// scaleNutrition scales a nullable nutrient value by the given factor,
// rounding to 1 decimal place.
function scaleNutrition(value: number | null, scale: number): number | null {
  if (value == null) return null
  return Math.round(value * scale * 10) / 10
}

export default function LogFromRecipeSheet({ open, onClose, recipe, onSaved }: Props) {
  const [servings, setServings] = useState(recipe.servings)
  const [mealType, setMealType] = useState('dinner')
  const [date,     setDate]     = useState(todayString())
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  // Reset form each time the sheet opens
  useEffect(() => {
    if (!open) return
    setServings(recipe.servings)
    setMealType('dinner')
    setDate(todayString())
    setSaving(false)
    setError('')
  }, [open, recipe.servings])

  // Compute scaled nutrition for the preview
  const scale = servings / recipe.servings
  const scaledCalories  = recipe.calories  != null ? Math.round(recipe.calories * scale) : null
  const scaledProtein   = scaleNutrition(recipe.protein_g, scale)
  const scaledCarbs     = scaleNutrition(recipe.carbs_g, scale)
  const scaledFat       = scaleNutrition(recipe.fat_g, scale)

  const handleServingsChange = (delta: number) => {
    setServings(prev => Math.max(0.5, Math.round((prev + delta) * 2) / 2))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await logFromRecipe(recipe, servings, mealType, date)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300
        sm:flex sm:items-center sm:justify-center sm:p-4
        ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={onClose}
    >
      {open && (
        <div
          className="bg-white shadow-2xl overflow-hidden
            fixed bottom-0 left-0 right-0 rounded-t-2xl
            sm:static sm:rounded-xl sm:w-full sm:max-w-sm"
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <form onSubmit={handleSubmit} className="px-5 pt-4 pb-6 sm:pt-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Log to Calorie Log</h2>
              <button
                type="button"
                onClick={onClose}
                className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Recipe name */}
            <p className="text-sm text-gray-500 mb-4">{recipe.name}</p>

            {/* Serving spinner */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Servings</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleServingsChange(-0.5)}
                  disabled={servings <= 0.5}
                  className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  aria-label="Decrease servings"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                  </svg>
                </button>
                <span className="text-lg font-semibold w-12 text-center" data-testid="servings-display">
                  {servings % 1 === 0 ? servings.toString() : servings.toFixed(1)}
                </span>
                <button
                  type="button"
                  onClick={() => handleServingsChange(0.5)}
                  className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
                  aria-label="Increase servings"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                  </svg>
                </button>
                <span className="text-sm text-gray-400 ml-1">
                  of {recipe.servings % 1 === 0 ? recipe.servings : recipe.servings.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Scaled nutrition preview */}
            {scaledCalories != null && (
              <div className="flex gap-4 mb-4 p-3 bg-gray-50 rounded-lg text-center">
                <div className="flex-1">
                  <div className="text-base font-semibold" data-testid="scaled-calories">{scaledCalories}</div>
                  <div className="text-xs text-gray-500">Cal</div>
                </div>
                {scaledProtein != null && (
                  <div className="flex-1">
                    <div className="text-base font-semibold">{scaledProtein}g</div>
                    <div className="text-xs text-gray-500">Protein</div>
                  </div>
                )}
                {scaledCarbs != null && (
                  <div className="flex-1">
                    <div className="text-base font-semibold">{scaledCarbs}g</div>
                    <div className="text-xs text-gray-500">Carbs</div>
                  </div>
                )}
                {scaledFat != null && (
                  <div className="flex-1">
                    <div className="text-base font-semibold">{scaledFat}g</div>
                    <div className="text-xs text-gray-500">Fat</div>
                  </div>
                )}
              </div>
            )}

            {/* Meal type selector */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Meal</label>
              <div className="flex gap-2 flex-wrap">
                {MEAL_TYPES.map(mt => (
                  <button
                    key={mt.value}
                    type="button"
                    onClick={() => setMealType(mt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      mealType === mt.value
                        ? 'bg-stride-600 text-white border-stride-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 focus:border-transparent"
              />
            </div>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-stride-600 hover:bg-stride-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-3 rounded-xl transition-colors"
            >
              {saving ? 'Saving…' : 'Save to Log'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
