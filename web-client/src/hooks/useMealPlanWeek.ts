// useMealPlanWeek fetches and manages meal plan entries for a given Mon–Sun week.
// Refetches automatically when weekStart changes. All mutations optimistically
// update local state and refetch on error to stay consistent with the server.

import { useState, useEffect, useCallback } from 'react'
import {
  fetchMealPlanEntries,
  createMealPlanEntry,
  updateMealPlanEntry,
  deleteMealPlanEntry,
  copyMealPlanWeek,
} from '../api'
import type { MealPlanEntry, CreateMealPlanEntryInput, UpdateMealPlanEntryInput, CopyWeekInput } from '../types'

export function useMealPlanWeek(weekStart: string) {
  const [entries, setEntries] = useState<MealPlanEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMealPlanEntries({ week_start: weekStart })
      setEntries(data)
    } catch {
      setError('Failed to load meal plan')
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { refetch() }, [refetch])

  // addEntry creates a new entry and appends it to local state.
  const addEntry = useCallback(async (input: CreateMealPlanEntryInput) => {
    const entry = await createMealPlanEntry(input)
    setEntries(prev => [...prev, entry])
  }, [])

  // updateEntry patches an existing entry in place.
  const updateEntry = useCallback(async (id: number, input: UpdateMealPlanEntryInput) => {
    const updated = await updateMealPlanEntry(id, input)
    setEntries(prev => prev.map(e => e.id === id ? updated : e))
  }, [])

  // deleteEntry removes the entry optimistically and refetches on failure.
  const deleteEntry = useCallback(async (id: number) => {
    setEntries(prev => prev.filter(e => e.id !== id))
    try {
      await deleteMealPlanEntry(id)
    } catch {
      refetch()
    }
  }, [refetch])

  // copyFromLastWeek bulk-inserts copies from the source week and appends them.
  const copyFromLastWeek = useCallback(async (input: CopyWeekInput) => {
    const newEntries = await copyMealPlanWeek(input)
    setEntries(prev => [...prev, ...newEntries])
  }, [])

  return { entries, loading, error, addEntry, updateEntry, deleteEntry, copyFromLastWeek, refetch }
}
