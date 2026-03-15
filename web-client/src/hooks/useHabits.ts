// useHabits manages the list of habits for a given date — fetches on mount and
// date change, supports optimistic level updates with rollback on error.

import { useState, useEffect, useCallback } from 'react'
import type { HabitWithLog } from '../types'
import { fetchHabits, upsertHabitLog } from '../api'

export interface UseHabitsResult {
  habits: HabitWithLog[]
  loading: boolean
  error: string
  reload: () => void
  logLevel: (habitId: number, level: 0 | 1 | 2 | 3) => Promise<void>
}

export function useHabits(date: string): UseHabitsResult {
  const [habits, setHabits] = useState<HabitWithLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Increment to force a refetch without changing date.
  const [reloadCounter, setReloadCounter] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchHabits(date)
      .then(data => { if (!cancelled) { setHabits(data); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load habits'); setLoading(false) } })
    return () => { cancelled = true }
  }, [date, reloadCounter])

  // Expose a function to reset loading before triggering a reload from outside.
  // Called by HabitsPage after CRUD mutations to show a loading state.
  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    setReloadCounter(c => c + 1)
  }, [])

  // logLevel updates the habit's log optimistically, then calls the API.
  // On error it rolls back to the pre-update state and re-throws so the
  // caller can show a toast or other feedback.
  // `habits` is in the dependency array so we can capture a synchronous snapshot
  // for the rollback before the async call.
  const logLevel = useCallback(async (habitId: number, level: 0 | 1 | 2 | 3) => {
    // Snapshot current state for rollback before touching it.
    const rollback = habits

    // Apply optimistic update immediately — update log, week_count, and week_level_sum
    // so weekly slot dots and level headers reflect the change without waiting for reload.
    setHabits(habits.map(h => {
      if (h.id !== habitId) return h
      const prevLevel = h.log?.level ?? 0
      // week_count: +1 when going from unlogged→logged, -1 for logged→unlogged, 0 otherwise.
      const countDelta = (level > 0 ? 1 : 0) - (prevLevel > 0 ? 1 : 0)
      return {
        ...h,
        log: level === 0 ? null : {
          id: h.log?.id ?? 0,
          user_id: h.user_id,
          habit_id: habitId,
          date,
          level: level as 1 | 2 | 3,
        },
        week_count: h.week_count + countDelta,
        week_level_sum: h.week_level_sum + (level - prevLevel),
      }
    }))

    try {
      const result = await upsertHabitLog(habitId, date, level)
      // Sync with server response — assigns the real id if this was a new log.
      setHabits(current => current.map(h => {
        if (h.id !== habitId) return h
        return { ...h, log: result }
      }))
    } catch (e) {
      setHabits(rollback)
      throw e
    }
  }, [habits, date])

  return { habits, loading, error, reload, logLevel }
}
