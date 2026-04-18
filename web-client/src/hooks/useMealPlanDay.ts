// useMealPlanDay — fetches meal plan entries for a single date.
// Used by CalorieLog to render ghost rows for planned-but-unlogged entries.

import { useState, useEffect, useCallback } from 'react'
import { fetchMealPlanEntries } from '../api'
import type { MealPlanEntry } from '../api'

export function useMealPlanDay(date: string) {
  const [entries, setEntries] = useState<MealPlanEntry[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchMealPlanEntries({ date })
      setEntries(data)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    reload()
  }, [reload])

  return { entries, loading, reload }
}
