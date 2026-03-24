// AllView — renders the All tab of the Tasks module.
//
// Filter pills: all | backlog | completed | canceled
//   - "all"       → active tasks (todo/in_progress), grouped by priority
//   - "backlog"   → active tasks with no due date, grouped by priority + Schedule btn
//   - "completed" → completed tasks sorted by completed_at DESC, no grouping
//   - "canceled"  → canceled tasks sorted by canceled_at DESC, no grouping
//
// Search bar: debounced 300ms, server-side filtering, clears on filter change.
// Infinite scroll: IntersectionObserver triggers loadMore() near list bottom.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTasks } from '../../hooks/useTasks'
import { updateTask, deleteTask } from '../../api'
import type { Task, UpdateTaskInput } from '../../types'
import TaskRow from './TaskRow'
import { Toast } from '../Toast'
import { useTaskMutation } from './TaskMutationContext'

/* ─── Types ──────────────────────────────────────────────────────────── */

type Filter = 'all' | 'backlog' | 'completed' | 'canceled'

const FILTER_LABELS: Record<Filter, string> = {
  all:       'All',
  backlog:   'Backlog',
  completed: 'Completed',
  canceled:  'Canceled',
}

// Priority display order for grouped views (all, backlog).
const PRIORITY_GROUPS = ['urgent', 'high', 'medium', 'low'] as const
const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low',
}

/* ─── Props ──────────────────────────────────────────────────────────── */

interface Props {
  today: string
  onEdit: (task: Task) => void
  onSchedule?: (task: Task) => void
  refreshKey?: number
}

/* ─── AllView ────────────────────────────────────────────────────────── */

export default function AllView({ today, onEdit, onSchedule, refreshKey }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [toast, setToast] = useState<{ message: string; undoFn: () => void } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { notifyMutation } = useTaskMutation()

  // Each filter maps directly to a useTasks view param.
  const { tasks, loading, loadingMore, hasMore, error, loadMore, reload } = useTasks({
    view: filter,
    today,
    search: debouncedSearch,
  })

  /* ─── Search debounce ────────────────────────────────────────────── */

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  /* ─── Filter change — clears search ─────────────────────────────── */

  const handleFilterChange = (f: Filter) => {
    setFilter(f)
    setSearch('')
    setDebouncedSearch('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }

  /* ─── Infinite scroll ────────────────────────────────────────────── */

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) loadMore()
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadMore])

  /* ─── Mutations ──────────────────────────────────────────────────── */

  const handleReload = useCallback(() => {
    reload()
    notifyMutation()
  }, [reload, notifyMutation])

  useEffect(() => { if (refreshKey) handleReload() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = useCallback(async (id: number, newStatus: string) => {
    const prev = tasks.find(t => t.id === id)?.status
    try {
      await updateTask(id, { status: newStatus as UpdateTaskInput['status'] })
      handleReload()
      if (prev && (newStatus === 'completed' || newStatus === 'canceled')) {
        setToast({
          message: newStatus === 'completed' ? 'Task completed' : 'Task canceled',
          undoFn: async () => {
            await updateTask(id, { status: prev as UpdateTaskInput['status'] })
            handleReload()
            setToast(null)
          },
        })
      }
    } catch { /* TODO: error toast */ }
  }, [tasks, handleReload])

  const handleDelete = useCallback(async (id: number) => {
    if (!window.confirm('Delete this task?')) return
    try {
      await deleteTask(id)
      handleReload()
    } catch { /* TODO: error toast */ }
  }, [handleReload])

  // Schedule button — opens edit sheet pre-focused on the date field.
  const handleSchedule = useCallback((task: Task) => {
    (onSchedule ?? onEdit)(task)
  }, [onSchedule, onEdit])

  /* ─── Grouped rendering (all / backlog filters) ──────────────────── */

  function renderGrouped(showSchedule: boolean) {
    const grouped = PRIORITY_GROUPS.map(p => ({
      priority: p,
      tasks: tasks.filter(t => t.priority === p),
    })).filter(g => g.tasks.length > 0)

    if (grouped.length === 0 && !loading) return renderEmpty()

    return (
      <div className="space-y-6">
        {grouped.map(({ priority, tasks: groupTasks }) => (
          <section key={priority}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {PRIORITY_LABELS[priority]}
            </h3>
            <div className="space-y-2">
              {groupTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={today}
                  onStatusChange={handleStatusChange}
                  onEdit={onEdit}
                  onDelete={handleDelete}
                  onSchedule={showSchedule ? handleSchedule : undefined}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  /* ─── Flat rendering (completed / canceled filters) ─────────────── */

  function renderFlat() {
    if (tasks.length === 0 && !loading) return renderEmpty()
    return (
      <div className="space-y-2">
        {tasks.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            today={today}
            onStatusChange={handleStatusChange}
            onEdit={onEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    )
  }

  function renderEmpty() {
    const msgs: Record<Filter, string> = {
      all:       'No active tasks.',
      backlog:   'No tasks in the backlog.',
      completed: 'No completed tasks.',
      canceled:  'No canceled tasks.',
    }
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-400">{msgs[filter]}</p>
      </div>
    )
  }

  /* ─── Render ─────────────────────────────────────────────────────── */

  return (
    <div>
      {/* ── Filter pills ─────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap mb-4">
        {(Object.keys(FILTER_LABELS) as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => handleFilterChange(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* ── Search bar ───────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search tasks…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {search && (
          <button
            onClick={() => handleSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Task list ────────────────────────────────────────────────── */}
      {loading && <div className="py-8 text-center text-sm text-gray-400">Loading…</div>}
      {error && <p className="py-4 text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          {(filter === 'all' || filter === 'backlog')
            ? renderGrouped(filter === 'backlog')
            : renderFlat()
          }

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />

          {loadingMore && (
            <div className="py-4 text-center text-sm text-gray-400">Loading more…</div>
          )}
        </>
      )}

      {toast && (
        <Toast
          message={toast.message}
          action={{ label: 'Undo', onClick: toast.undoFn }}
          duration={5000}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
