// useRecipes fetches the list of all recipes for the current user.
// Returns recipes, loading, error, and a reload callback for after mutations.

import { useState, useEffect, useCallback } from 'react'
import { fetchRecipes } from '../api'
import type { RecipeListItem } from '../types'

export function useRecipes() {
  const [recipes, setRecipes] = useState<RecipeListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchRecipes()
      setRecipes(data)
    } catch {
      setError('Failed to load recipes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  return { recipes, loading, error, reload }
}
