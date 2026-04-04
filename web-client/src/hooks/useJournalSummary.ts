// useJournalSummary fetches the journal summary for the given date range.
// Re-fetches automatically when range or refDate changes.

import { useState, useEffect, useCallback } from 'react'
import type { JournalSummaryResponse, JournalSummaryRange } from '../types'
import { fetchJournalSummary } from '../api'

export interface UseJournalSummaryResult {
  summary: JournalSummaryResponse | null
  loading: boolean
  error: string | null
}

// refDate anchors week/month ranges (YYYY-MM-DD). Omit to use today server-side.
export function useJournalSummary(range: JournalSummaryRange, refDate?: string): UseJournalSummaryResult {
  const [summary, setSummary] = useState<JournalSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchJournalSummary(range, refDate)
      setSummary(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load summary')
    } finally {
      setLoading(false)
    }
  }, [range, refDate])

  useEffect(() => { load() }, [load])

  return { summary, loading, error }
}
