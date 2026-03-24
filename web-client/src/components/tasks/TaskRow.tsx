/* TaskRow — the core visual unit rendered in all three task views.
 *
 * Layout (left → right):
 *   [4px priority bar] [20px status circle] [task name + due date] [··· menu]
 *                                           [tags + description preview]
 *
 * Priority bar colors:  urgent=red, high=orange, medium=indigo, low=gray
 * Status circle:        todo=white+border, in_progress=half-indigo, completed=green✓, canceled=gray×
 * Due date chip:        overdue=red "N days overdue", today=amber "Today", future=gray "Mar 25"
 * ··· menu:             always visible on mobile, hover-only on desktop (group pattern)
 */

import { useState, useRef } from 'react'
import type { Task } from '../../types'

/* ─── Priority color map ─────────────────────────────────────────────── */

const PRIORITY = {
  urgent: { bar: 'bg-red-500',    hex: '#ef4444' },
  high:   { bar: 'bg-orange-400', hex: '#fb923c' },
  medium: { bar: 'bg-indigo-500', hex: '#6366f1' },
  low:    { bar: 'bg-gray-300',   hex: '#d1d5db' },
} as const

/* ─── Helpers ────────────────────────────────────────────────────────── */

// Converts "HH:MM" (24h) to "h:MM AM/PM" for display.
function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${mStr} ${ampm}`
}

interface DueChip {
  text: string
  color: string
}

// Returns the due date chip label and color, or null if no due date.
// `today` and `dueDate` are both YYYY-MM-DD strings.
function getDueChip(dueDate: string | null, dueTime: string | null, today: string): DueChip | null {
  if (!dueDate) return null

  // Compare calendar dates as strings — no timezone conversion needed
  // because both values are local calendar dates, never timestamps.
  const timeStr = dueTime ? ` · ${formatTime(dueTime)}` : ''

  if (dueDate < today) {
    // Overdue — compute number of days using UTC timestamps to avoid DST drift
    const todayMs = new Date(today + 'T00:00:00').getTime()
    const dueDateMs = new Date(dueDate + 'T00:00:00').getTime()
    const days = Math.floor((todayMs - dueDateMs) / 86400000)
    return {
      text: days === 1 ? '1 day overdue' : `${days} days overdue`,
      color: 'text-red-500',
    }
  }

  if (dueDate === today) {
    return { text: `Today${timeStr}`, color: 'text-amber-500' }
  }

  // Future date
  const formatted = new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return { text: `${formatted}${timeStr}`, color: 'text-gray-400' }
}

/* ─── Status popover config ──────────────────────────────────────────── */

// Options shown in the status popover (long-press / hover on the circle).
const STATUS_OPTIONS = [
  { value: 'todo',        label: 'Todo',        symbol: '○' },
  { value: 'in_progress', label: 'In Progress', symbol: '◑' },
  { value: 'completed',   label: 'Done',        symbol: '✓' },
  { value: 'canceled',    label: 'Canceled',    symbol: '×' },
] as const

/* ─── Status circle ─────────────────────────────────────────────────── */

interface CircleProps {
  status: Task['status']
  priority: Task['priority']
  onClick: () => void
  onHoverStart: () => void   // mouse enter — starts 400ms timer
  onHoverEnd: () => void     // mouse leave — cancels timer / closes
  onTouchStart: () => void   // touch pointerdown — starts 500ms long-press timer
  onTouchEnd: () => void     // touch pointerup / leave — cancels long-press timer
}

function StatusCircle({ status, priority, onClick, onHoverStart, onHoverEnd, onTouchStart, onTouchEnd }: CircleProps) {
  const priorityHex = PRIORITY[priority]?.hex ?? '#6366f1'

  const baseClass = 'shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors'

  // Hover (mouse) starts a 400ms timer; touch starts a 500ms long-press timer.
  const interactionProps = {
    onMouseEnter: onHoverStart,
    onMouseLeave: onHoverEnd,
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType === 'touch') onTouchStart() },
    onPointerUp: onTouchEnd,
    onPointerLeave: onTouchEnd,
  }

  if (status === 'completed') {
    return (
      <button {...interactionProps} onClick={onClick} className={`${baseClass} bg-green-500 border-green-500`} aria-label="Mark incomplete">
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </button>
    )
  }

  if (status === 'canceled') {
    return (
      <button {...interactionProps} onClick={onClick} className={`${baseClass} bg-gray-300 border-gray-300`} aria-label="Reopen task">
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    )
  }

  if (status === 'in_progress') {
    return (
      <button
        {...interactionProps}
        onClick={onClick}
        className={baseClass}
        style={{ background: 'conic-gradient(#6366f1 180deg, transparent 180deg)', borderColor: '#6366f1' }}
        aria-label="Mark complete"
      />
    )
  }

  // todo — white fill, priority-colored border
  return (
    <button
      {...interactionProps}
      onClick={onClick}
      className={`${baseClass} bg-white hover:bg-gray-50`}
      style={{ borderColor: priorityHex }}
      aria-label="Mark complete"
    />
  )
}

/* ─── TaskRow ────────────────────────────────────────────────────────── */

interface Props {
  task: Task
  today: string
  onStatusChange: (id: number, status: string) => void
  onEdit: (task: Task) => void
  onDelete: (id: number) => void
  // When provided (backlog view), shows a calendar icon button to quickly schedule the task.
  onSchedule?: (task: Task) => void
}

export default function TaskRow({ task, today, onStatusChange, onEdit, onDelete, onSchedule }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)

  // Desktop: show popover after 400ms hover. Mobile: show after 500ms long-press.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Prevents the single-tap onClick from firing when a long-press was detected.
  const longPressActive = useRef(false)

  const openPopover = () => {
    hoverTimer.current = setTimeout(() => setPopoverOpen(true), 400)
  }
  const closePopover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    // Don't close on mouse-leave if the popover was opened via long-press —
    // touch devices fire a synthetic mouseleave when the finger lifts, which
    // would immediately dismiss the popover before the user can select an option.
    if (!longPressActive.current) setPopoverOpen(false)
  }
  // Long-press (mobile): separate timer with 500ms delay.
  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      longPressActive.current = true
      setPopoverOpen(true)
    }, 500)
  }
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  const priorityColors = PRIORITY[task.priority] ?? PRIORITY.medium
  const isInactive = task.status === 'completed' || task.status === 'canceled'
  const chip = getDueChip(task.due_date, task.due_time, today)

  const handleCircleClick = () => {
    // If a long-press just fired, swallow the synthetic click that follows.
    if (longPressActive.current) { longPressActive.current = false; return }
    // Single tap completes the task; undo is handled by the parent via toast.
    if (task.status === 'todo' || task.status === 'in_progress') {
      onStatusChange(task.id, 'completed')
    }
  }

  const handlePopoverSelect = (status: string) => {
    longPressActive.current = false
    setPopoverOpen(false)
    onStatusChange(task.id, status)
  }

  return (
    // group — enables the hover-opacity pattern for the ··· menu on desktop
    <div data-testid="task-row" className="group flex items-stretch bg-white rounded-lg border border-gray-100 shadow-sm">

      {/* Priority border bar */}
      <div
        className={`w-1 rounded-l-lg shrink-0 ${priorityColors.bar}`}
        data-testid="priority-bar"
        data-priority={task.priority}
      />

      {/* Row content */}
      <div className="flex flex-1 items-start gap-3 px-3 py-2.5 min-w-0">

        {/* Status circle + popover */}
        <div className="relative mt-0.5">
          <StatusCircle
            status={task.status}
            priority={task.priority}
            onClick={handleCircleClick}
            onHoverStart={openPopover}
            onHoverEnd={closePopover}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
          />
          {popoverOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => { longPressActive.current = false; setPopoverOpen(false) }} />
              <div className="absolute left-0 top-[calc(100%+4px)] z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-36">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handlePopoverSelect(opt.value)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      task.status === opt.value
                        ? 'text-indigo-700 font-semibold bg-indigo-50'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-base leading-none">{opt.symbol}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0">

          {/* Name + due date */}
          <div className="flex items-start justify-between gap-2">
            <span
              className={`text-sm font-medium leading-snug ${
                isInactive ? 'line-through text-gray-400' : 'text-gray-900'
              }`}
            >
              {task.name}
            </span>
            {chip && (
              <span className={`text-xs shrink-0 mt-0.5 ${chip.color}`}>
                {chip.text}
              </span>
            )}
          </div>

          {/* Second line: tags + description preview */}
          {(task.tags.length > 0 || task.description) && (
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {task.tags.map(tag => (
                <span
                  key={tag}
                  className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
              {task.description && (
                <span className="text-xs text-gray-400 truncate max-w-[200px]">
                  {task.description}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Schedule button — shown in backlog view to quickly set a due date */}
        {onSchedule && (
          <button
            onClick={() => onSchedule(task)}
            className="mt-0.5 p-1 rounded text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            aria-label="Schedule task"
            title="Schedule"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
            </svg>
          </button>
        )}

        {/* ··· overflow menu — always visible on mobile, hover-only on desktop */}
        <div className="relative mt-0.5 shrink-0">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            aria-label="Task actions"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <>
              {/* Click-away backdrop */}
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-[calc(100%+4px)] z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-28">
                <button
                  onClick={() => { setMenuOpen(false); onEdit(task) }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(task.id) }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
