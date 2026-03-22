// UpcomingView — renders the Upcoming tab of the Tasks module.
//
// Fetches tasks due in the next 7 days (server view=upcoming).
// Groups tasks by due_date with a date label for each group.
// Within each group: sorted by due_time ASC NULLS LAST, then created_at ASC.
// Empty state: "Nothing scheduled in the next 7 days."

import { useState, useCallback } from 'react'
import { useTasks } from '../../hooks/useTasks'
import { updateTask, deleteTask } from '../../api'
import type { Task, UpdateTaskInput } from '../../types'
import TaskRow from './TaskRow'
import { Toast } from '../Toast'
import { useTaskMutation } from './TaskMutationContext'

/* ─── Helpers ────────────────────────────────────────────────────────── */

// Returns "Tomorrow" if date is today+1, otherwise "Wednesday, Mar 25".
function dateGroupLabel(date: string, today: string): string {
  const tomorrow = offsetDate(today, 1)
  if (date === tomorrow) return 'Tomorrow'
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

// Adds `days` to a YYYY-MM-DD string and returns a new YYYY-MM-DD.
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Sorts by due_time ASC (nulls last), then created_at ASC.
function sortWithinDay(a: Task, b: Task): number {
  if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time)
  if (a.due_time)  return -1 // a has time, b doesn't → a first
  if (b.due_time)  return 1
  return a.created_at.localeCompare(b.created_at)
}

// Groups a flat sorted task list by due_date, preserving date order.
function groupByDate(tasks: Task[]): { date: string; tasks: Task[] }[] {
  const map = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.due_date ?? 'none'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(task)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ts]) => ({ date, tasks: [...ts].sort(sortWithinDay) }))
}

/* ─── Props ──────────────────────────────────────────────────────────── */

interface Props {
  today: string
  onEdit: (task: Task) => void
}

/* ─── UpcomingView ───────────────────────────────────────────────────── */

export default function UpcomingView({ today, onEdit }: Props) {
  const { tasks, loading, error, reload } = useTasks({ view: 'upcoming', today })
  const { notifyMutation } = useTaskMutation()
  const [toast, setToast] = useState<{ message: string; undoFn: () => void } | null>(null)

  const handleReload = useCallback(() => {
    reload()
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

  const handleDelete = useCallback(async (id: number) => {
    if (!window.confirm('Delete this task?')) return
    try {
      await deleteTask(id)
      handleReload()
    } catch { /* TODO: error toast */ }
  }, [handleReload])

  if (loading) return <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
  if (error)   return <p className="py-4 text-sm text-red-600">{error}</p>

  if (tasks.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
          </svg>
        </div>
        <p className="text-gray-500 font-medium text-sm">Nothing scheduled in the next 7 days.</p>
      </div>
    )
  }

  const groups = groupByDate(tasks)

  return (
    <div className="space-y-6">
      {groups.map(({ date, tasks: dayTasks }) => (
        <section key={date}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            {dateGroupLabel(date, today)}
          </h3>
          <div className="space-y-2">
            {dayTasks.map(task => (
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
        </section>
      ))}

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
