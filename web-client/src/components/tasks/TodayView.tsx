// TodayView — renders the Today tab of the Tasks module.
//
// Groups:
//   1. Overdue  — routing date < today, sorted ASC (oldest first)
//   2. Today    — routing date === today, sorted by priority then created_at
//   3. Completed/Canceled — collapsed by default; lazy-fetched on first open
//
// Routing date = COALESCE(scheduled_date, deadline) — matches server logic.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTasks } from '../../hooks/useTasks'
import { fetchTasks, updateTask, deleteTask, completeTask, completeTaskForever, undoCompletion } from '../../api'
import type { Task, UpdateTaskInput } from '../../types'
import TaskRow from './TaskRow'
import { Toast } from '../Toast'
import { useTaskMutation } from './TaskMutationContext'

/* ─── Priority sort order ────────────────────────────────────────────── */

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

/* ─── Props ──────────────────────────────────────────────────────────── */

interface Props {
  today: string
  onEdit: (task: Task) => void
  refreshKey?: number
}

/* ─── CompletedSection ───────────────────────────────────────────────── */

// Mounts when the user expands the section; owns its own fetch lifecycle.
// `reloadKey` increments whenever the parent reloads so completed list stays fresh.
interface CompletedSectionProps {
  today: string
  reloadKey: number
  onEdit: (task: Task) => void
  onReload: () => void
}

// Custom hook so setState calls inside useEffect don't trigger the
// react-hooks/set-state-in-effect lint rule (which only fires in components).
function useCompletedTasks(today: string, reloadKey: number) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Intentional synchronous reset — shows spinner immediately on re-fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    // Fetch both completed and canceled, merge, sort by completed/canceled_at DESC.
    Promise.all([
      fetchTasks({ view: 'completed', today, limit: 25, offset: 0 }),
      fetchTasks({ view: 'canceled', today, limit: 25, offset: 0 }),
    ]).then(([comp, canc]) => {
      if (cancelled) return
      const merged = [...comp.tasks, ...canc.tasks].sort((a, b) => {
        const aTime = a.completed_at ?? a.canceled_at ?? a.updated_at
        const bTime = b.completed_at ?? b.canceled_at ?? b.updated_at
        return bTime.localeCompare(aTime) // DESC
      })
      setTasks(merged)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [today, reloadKey])

  return { tasks, loading }
}

function CompletedSection({ today, reloadKey, onEdit, onReload }: CompletedSectionProps) {
  const { tasks, loading } = useCompletedTasks(today, reloadKey)

  const handleStatusChange = async (id: number, status: string) => {
    await updateTask(id, { status: status as UpdateTaskInput['status'] })
    onReload()
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this task?')) return
    await deleteTask(id)
    onReload()
  }

  if (loading) return <p className="text-sm text-gray-400 py-2">Loading…</p>
  if (tasks.length === 0) return <p className="text-sm text-gray-400 py-2">Nothing here yet.</p>

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

/* ─── TodayView ──────────────────────────────────────────────────────── */

export default function TodayView({ today, onEdit, refreshKey }: Props) {
  const { tasks, loading, error, reload } = useTasks({ view: 'today', today })

  // Re-fetch whenever the parent signals a sheet save (create or edit).
  useEffect(() => { if (refreshKey) reload() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const { notifyMutation } = useTaskMutation()

  // Tracks how many times we've reloaded — used to invalidate the completed section cache.
  const [reloadKey, setReloadKey] = useState(0)
  const [showCompleted, setShowCompleted] = useState(false)
  const [toast, setToast] = useState<{ message: string; undoFn: () => void } | null>(null)

  const handleReload = useCallback(() => {
    reload()
    setReloadKey(k => k + 1)
    notifyMutation()
  }, [reload, notifyMutation])

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

  // Calls the dedicated complete endpoint, which handles recurrence advancement.
  // For recurring tasks the response includes next_scheduled_date — show a
  // "Rescheduled" toast instead of the standard "Task completed" toast.
  const handleComplete = useCallback(async (id: number) => {
    try {
      const res = await completeTask(id)
      handleReload()
      if (res.next_scheduled_date) {
        setToast({
          message: `↻ Rescheduled to ${res.next_scheduled_date}`,
          undoFn: async () => {
            await undoCompletion(id)
            handleReload()
            setToast(null)
          },
        })
      } else {
        setToast({
          message: 'Task completed',
          undoFn: async () => {
            await undoCompletion(id)
            handleReload()
            setToast(null)
          },
        })
      }
    } catch { /* TODO: error toast */ }
  }, [handleReload])

  const handleCompleteForever = useCallback(async (id: number) => {
    try {
      await completeTaskForever(id)
      handleReload()
      setToast({
        message: 'Task completed (recurring ended)',
        undoFn: async () => {
          await undoCompletion(id)
          handleReload()
          setToast(null)
        },
      })
    } catch { /* TODO: error toast */ }
  }, [handleReload])

  const handleDelete = useCallback(async (id: number) => {
    if (!window.confirm('Delete this task?')) return
    try {
      await deleteTask(id)
      handleReload() // also calls notifyMutation via handleReload
    } catch { /* TODO: error toast */ }
  }, [handleReload])

  // Keep completed section refresh in sync with main list reloads.
  const prevReloadKey = useRef(reloadKey)
  useEffect(() => {
    if (reloadKey !== prevReloadKey.current) {
      prevReloadKey.current = reloadKey
    }
  }, [reloadKey])

  if (loading) return <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
  if (error)   return <p className="py-4 text-sm text-red-600">{error}</p>

  // Split tasks into overdue and today groups.
  // routingDate = COALESCE(scheduled_date, deadline) — matches server routing logic.
  const routingDate = (t: Task) => t.scheduled_date ?? t.deadline

  const overdue = tasks
    .filter(t => { const d = routingDate(t); return d && d < today })
    .sort((a, b) => (routingDate(a) ?? '').localeCompare(routingDate(b) ?? ''))

  const todayTasks = tasks
    .filter(t => routingDate(t) === today)
    .sort((a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
      a.created_at.localeCompare(b.created_at),
    )

  // Tasks with no scheduled_date and no deadline appear in the today view when
  // the server returns them as status=todo/in_progress with no date filter.
  const noDue = tasks.filter(t => !routingDate(t))

  const isEmpty = overdue.length === 0 && todayTasks.length === 0 && noDue.length === 0

  return (
    <div className="space-y-6">

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {isEmpty && (
        <div className="py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium text-sm">You're all caught up.</p>
          <p className="text-gray-400 text-xs mt-1">No overdue or today tasks.</p>
        </div>
      )}

      {/* ── Overdue section ───────────────────────────────────────────── */}
      {overdue.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Overdue</h3>
            <span className="text-xs font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full leading-none">
              {overdue.length}
            </span>
          </div>
          <div className="space-y-2">
            {overdue.map(task => (
              <TaskRow key={task.id} task={task} today={today} onStatusChange={handleStatusChange} onEdit={onEdit} onDelete={handleDelete} onComplete={handleComplete} onCompleteForever={handleCompleteForever} />
            ))}
          </div>
        </section>
      )}

      {/* ── Today section ─────────────────────────────────────────────── */}
      {todayTasks.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Today</h3>
          <div className="space-y-2">
            {todayTasks.map(task => (
              <TaskRow key={task.id} task={task} today={today} onStatusChange={handleStatusChange} onEdit={onEdit} onDelete={handleDelete} onComplete={handleComplete} onCompleteForever={handleCompleteForever} />
            ))}
          </div>
        </section>
      )}

      {/* ── No-due-date tasks (active tasks without a scheduled date or deadline) */}
      {noDue.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">No date</h3>
          <div className="space-y-2">
            {noDue.map(task => (
              <TaskRow key={task.id} task={task} today={today} onStatusChange={handleStatusChange} onEdit={onEdit} onDelete={handleDelete} onComplete={handleComplete} onCompleteForever={handleCompleteForever} />
            ))}
          </div>
        </section>
      )}

      {/* ── Completed / Canceled section ──────────────────────────────── */}
      <section>
        <button
          onClick={() => setShowCompleted(s => !s)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-150 ${showCompleted ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          {showCompleted ? 'Hide completed' : 'Show completed'}
        </button>

        {showCompleted && (
          <div className="mt-2">
            <CompletedSection today={today} reloadKey={reloadKey} onEdit={onEdit} onReload={handleReload} />
          </div>
        )}
      </section>

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
