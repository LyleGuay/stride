// useJournalCalendar manages a per-month cache of journal calendar data.
// The cache is a stable Map (via useRef) keyed by "YYYY-MM", so data persists
// across re-renders without causing them. Loading state is tracked in a Set
// held in useState so components re-render when a month finishes loading.
//
// Usage:
//   const { loadMonth, getMonthData, isLoading, invalidate } = useJournalCalendar()
//
//   // Trigger a fetch (no-op if already cached or in-flight):
//   useEffect(() => { loadMonth('2026-04') }, [])
//
//   // Read cached data synchronously:
//   const days = getMonthData('2026-04') // null until loaded

import { useRef, useState, useCallback } from 'react'
import type { JournalCalendarDay } from '../types'
import { fetchJournalCalendar } from '../api'

export interface UseJournalCalendarResult {
  /** Triggers a fetch for the given month if it is not already cached or loading. */
  loadMonth: (month: string) => void
  /** Returns the cached calendar data for a month, or null if not yet loaded. */
  getMonthData: (month: string) => JournalCalendarDay[] | null
  /** Returns true while a fetch is in-flight for the given month. */
  isLoading: (month: string) => boolean
  /** Clears the cache entry for a month so the next loadMonth refetches from the server. */
  invalidate: (month: string) => void
}

export function useJournalCalendar(): UseJournalCalendarResult {
  // cache stores fetched data. Ref so writes don't trigger re-renders.
  const cache = useRef<Map<string, JournalCalendarDay[]>>(new Map())
  // inFlight is a ref (not state) so the dedup check is synchronous — two consecutive
  // loadMonth calls in the same tick both see the correct in-flight set.
  const inFlight = useRef<Set<string>>(new Set())
  // loadingMonths is state so that components re-render when loading starts/ends.
  const [loadingMonths, setLoadingMonths] = useState<Set<string>>(new Set())

  const loadMonth = useCallback((month: string) => {
    // Skip if already cached or a fetch is already in-flight.
    if (cache.current.has(month) || inFlight.current.has(month)) return

    inFlight.current.add(month)
    setLoadingMonths(prev => new Set(prev).add(month))

    fetchJournalCalendar(month)
      .then(data => {
        cache.current.set(month, data)
      })
      .catch(() => {
        // On error the month stays uncached; next loadMonth will retry.
      })
      .finally(() => {
        inFlight.current.delete(month)
        setLoadingMonths(prev => {
          const next = new Set(prev)
          next.delete(month)
          return next
        })
      })
  }, []) // stable — all mutable state accessed via refs or state setters

  const getMonthData = useCallback(
    (month: string): JournalCalendarDay[] | null => cache.current.get(month) ?? null,
    [],
  )

  const isLoading = useCallback(
    (month: string): boolean => loadingMonths.has(month),
    [loadingMonths],
  )

  const invalidate = useCallback((month: string) => {
    cache.current.delete(month)
    // inFlight is not cleared — an in-flight request will still resolve and re-cache the month.
    // No state update needed; the next loadMonth will trigger the re-render via setLoadingMonths.
  }, [])

  return { loadMonth, getMonthData, isLoading, invalidate }
}
