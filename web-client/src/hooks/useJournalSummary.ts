// useJournalSummary fetches the journal summary for the given date range.
// Re-fetches automatically when range changes.

import { useState, useEffect, useCallback } from 'react'
import type { JournalSummaryResponse } from '../types'
import { fetchJournalSummary } from '../api'

export interface UseJournalSummaryResult {
  summary: JournalSummaryResponse | null
  loading: boolean
  error: string | null
}

export function useJournalSummary(range: '1m' | '6m' | 'ytd' | 'all'): UseJournalSummaryResult {
  const [summary, setSummary] = useState<JournalSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchJournalSummary(range)
      setSummary(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load summary')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { load() }, [load])

  return { summary, loading, error }
}
