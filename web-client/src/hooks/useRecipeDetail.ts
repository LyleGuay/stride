// useRecipeDetail fetches the full detail for a single recipe by id.
// Returns recipe, loading, error, and a reload callback for after mutations.

import { useState, useEffect, useCallback } from 'react'
import { fetchRecipe } from '../api'
import type { RecipeDetail } from '../types'

export function useRecipeDetail(id: number) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchRecipe(id)
      setRecipe(data)
    } catch {
      setError('Failed to load recipe')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { reload() }, [reload])

  return { recipe, loading, error, reload }
}
