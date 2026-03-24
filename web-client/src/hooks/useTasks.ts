// useTasks fetches a paginated list of tasks for the given view and exposes
// loadMore() for infinite scroll and reload() to reset after mutations.

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Task } from '../types'
import { fetchTasks } from '../api'

const PAGE_SIZE = 25

export interface UseTasksResult {
  tasks: Task[]
  loading: boolean      // true only on the initial fetch (first page)
  loadingMore: boolean  // true when fetching a subsequent page
  hasMore: boolean      // false when all pages have been loaded
  error: string | null
  loadMore: () => void  // appends the next page; no-op when hasMore is false or already loading
  reload: () => void    // resets to page 0 and re-fetches from scratch
}

interface Params {
  view: string
  today: string
  search?: string
}

export function useTasks({ view, today, search }: Params): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // offset tracks how many items have been fetched so far.
  const offsetRef = useRef(0)
  // reloadCounter lets reload() trigger a fresh fetch without changing params.
  const [reloadCounter, setReloadCounter] = useState(0)

  // Reset and fetch page 0 whenever view, search, today, or reloadCounter changes.
  useEffect(() => {
    let cancelled = false
    offsetRef.current = 0
    // Synchronous resets are intentional: we clear stale data and show a spinner
    // immediately when fetch params change so the UI never shows stale results.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks([])
    setHasMore(false)
    setError(null)
    setLoading(true)

    fetchTasks({ view, today, search, limit: PAGE_SIZE, offset: 0 })
      .then(res => {
        if (cancelled) return
        setTasks(res.tasks)
        setHasMore(res.has_more)
        offsetRef.current = res.tasks.length
      })
      .catch(e => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load tasks')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [view, today, search, reloadCounter])

  // loadMore appends the next page. Guarded so it can't be called concurrently.
  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return
    setLoadingMore(true)

    const offset = offsetRef.current
    fetchTasks({ view, today, search, limit: PAGE_SIZE, offset })
      .then(res => {
        setTasks(prev => [...prev, ...res.tasks])
        setHasMore(res.has_more)
        offsetRef.current = offset + res.tasks.length
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Failed to load more tasks')
      })
      .finally(() => setLoadingMore(false))
  }, [hasMore, loadingMore, loading, view, today, search])

  const reload = useCallback(() => {
    setReloadCounter(c => c + 1)
  }, [])

  return { tasks, loading, loadingMore, hasMore, error, loadMore, reload }
}
