// useJournalEntries fetches the journal entries for a given date and exposes
// a reload() trigger for use after create/update/delete mutations.

import { useState, useEffect, useCallback } from 'react'
import type { JournalEntry } from '../types'
import { fetchJournalEntries } from '../api'

export interface UseJournalEntriesResult {
  entries: JournalEntry[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useJournalEntries(date: string): UseJournalEntriesResult {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchJournalEntries(date)
      setEntries(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load entries')
    } finally {
      setLoading(false)
    }
  }, [date])

  // Increment to force a refetch without changing date.
  const [reloadCounter, setReloadCounter] = useState(0)
  useEffect(() => { load() }, [load, reloadCounter])

  const reload = useCallback(() => {
    setReloadCounter(c => c + 1)
  }, [])

  return { entries, loading, error, reload }
}
