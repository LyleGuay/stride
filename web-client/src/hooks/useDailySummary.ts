// useDailySummary fetches and manages the daily calorie log summary for a given date.
// Refetches automatically when date changes. Returns summary, loading, error, and
// a reload callback for after mutations (add/edit/delete item).

import { useState, useEffect, useCallback } from 'react'
import { fetchDailySummary } from '../api'
import type { DailySummary } from '../types'

export function useDailySummary(date: string) {
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchDailySummary(date)
      setSummary(data)
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { reload() }, [reload])

  return { summary, loading, error, reload }
}
