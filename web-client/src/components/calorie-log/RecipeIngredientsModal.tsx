// RecipeIngredientsModal — modal that shows the ingredient list for a recipe-sourced
// calorie log item. Fetches the recipe by ID on mount and renders name + ingredients.
// Modal structure mirrors ManageFavoritesModal (fixed backdrop, white card, X button).

import { useEffect, useState } from 'react'
import { fetchRecipe } from '../../api'
import type { RecipeDetail } from '../../api'

interface Props {
  recipeId: number
  onClose: () => void
}

export default function RecipeIngredientsModal({ recipeId, onClose }: Props) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    fetchRecipe(recipeId)
      .then(r => { setRecipe(r); setLoading(false) })
      .catch(() => { setError('Failed to load recipe'); setLoading(false) })
  }, [recipeId])

  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        style={{ maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {recipe ? recipe.name : 'Recipe Ingredients'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 72px)' }}>
          {loading && (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Loading...</div>
          )}

          {error && (
            <div className="px-5 py-8 text-sm text-red-500 text-center">{error}</div>
          )}

          {recipe && recipe.ingredients.length === 0 && (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">
              No ingredients listed for this recipe.
            </div>
          )}

          {recipe && recipe.ingredients.length > 0 && (
            <ul className="py-2">
              {recipe.ingredients.map(ing => (
                <li key={ing.id} className="flex items-baseline gap-2 px-5 py-2 border-b border-gray-50 last:border-0 text-sm">
                  {/* qty + uom prefix — omitted if not set */}
                  {(ing.qty != null || ing.uom != null) && (
                    <span className="text-gray-400 whitespace-nowrap shrink-0">
                      {ing.qty != null ? ing.qty : ''}{ing.uom ? ` ${ing.uom}` : ''}
                    </span>
                  )}
                  <span className="text-gray-800">{ing.name}</span>
                  {ing.note && (
                    <span className="text-gray-400 text-xs ml-auto shrink-0">{ing.note}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
