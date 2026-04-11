/* TaskRow — the core visual unit rendered in all three task views.
 *
 * Layout (left → right):
 *   [4px priority bar] [20px status circle] [task name + date chips] [··· menu]
 *                                           [tags + description preview]
 *
 * Priority bar colors:  urgent=red, high=orange, medium=indigo, low=gray
 * Status circle:        todo=white+border, in_progress=marching-ants in priority color,
 *                       completed=green✓, canceled=gray×
 * Scheduled date chip:  overdue=red, today=amber, future=gray
 * Deadline chip:        past/today=red, ≤2 days=orange, >2 days=gray (⚑ icon)
 * Recurring indicator:  ↻ icon with hover tooltip showing recurrence pattern
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

interface DateChip {
  text: string
  color: string
}

// Returns the scheduled date chip label and color, or null if no scheduled date.
// `today` and `scheduledDate` are both YYYY-MM-DD strings.
function getScheduledChip(scheduledDate: string | null, scheduledTime: string | null, today: string): DateChip | null {
  if (!scheduledDate) return null

  const timeStr = scheduledTime ? ` · ${formatTime(scheduledTime)}` : ''

  if (scheduledDate < today) {
    const todayMs = new Date(today + 'T00:00:00').getTime()
    const dateMs = new Date(scheduledDate + 'T00:00:00').getTime()
    const days = Math.floor((todayMs - dateMs) / 86400000)
    return {
      text: days === 1 ? '1 day overdue' : `${days} days overdue`,
      color: 'text-red-500',
    }
  }

  if (scheduledDate === today) {
    return { text: `Today${timeStr}`, color: 'text-amber-500' }
  }

  const formatted = new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return { text: `${formatted}${timeStr}`, color: 'text-gray-400' }
}

// Returns the deadline chip label and color, or null if no deadline or deadline === scheduledDate.
// Color logic: past/today = red, ≤2 days away = orange, >2 days = gray.
function getDeadlineChip(deadline: string | null, scheduledDate: string | null, today: string): DateChip | null {
  if (!deadline) return null
  // Don't show a separate deadline chip when it's the same as the scheduled date.
  if (deadline === scheduledDate) return null

  const formatted = new Date(deadline + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  if (deadline <= today) {
    return { text: formatted, color: 'text-red-500' }
  }

  const todayMs = new Date(today + 'T00:00:00').getTime()
  const deadlineMs = new Date(deadline + 'T00:00:00').getTime()
  const daysAway = Math.floor((deadlineMs - todayMs) / 86400000)

  if (daysAway <= 2) {
    return { text: formatted, color: 'text-orange-400' }
  }

  return { text: formatted, color: 'text-gray-400' }
}

// Returns a human-readable summary of a recurrence rule for the tooltip.
// Falls back to "Recurring" if the rule can't be parsed.
function recurrenceLabel(rule: object | null): string {
  if (!rule) return ''
  const r = rule as Record<string, unknown>
  switch (r.frequency) {
    case 'daily':    return 'Every day'
    case 'weekdays': return 'Every weekday'
    case 'weekly':   return 'Every week'
    case 'monthly':  return 'Every month'
    case 'yearly':   return 'Every year'
    case 'custom': {
      const n = r.interval ?? 1
      const unit = r.unit ?? 'days'
      return `Every ${n} ${unit}`
    }
    default: return 'Recurring'
  }
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
    // Marching-ants dashed circle in the task's priority color.
    // The animation is defined in index.css as @keyframes march.
    return (
      <button
        {...interactionProps}
        onClick={onClick}
        className="shrink-0 w-5 h-5 flex items-center justify-center bg-transparent border-none p-0"
        aria-label="Mark complete"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle
            cx="10" cy="10" r="8"
            stroke={priorityHex}
            strokeWidth="2"
            strokeDasharray="5 3.5"
            style={{ animation: 'march 0.6s linear infinite' }}
          />
        </svg>
      </button>
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
  // Called on single-tap of the status circle (instead of onStatusChange for 'completed').
  // The parent handles showing the appropriate toast (rescheduled vs completed).
  // If not provided, falls back to onStatusChange(id, 'completed').
  onComplete?: (id: number) => void
  // Called from the ··· menu "Complete forever" option (recurring tasks only).
  onCompleteForever?: (id: number) => void
  // When provided (backlog view), shows a calendar icon button to quickly schedule the task.
  onSchedule?: (task: Task) => void
}

export default function TaskRow({ task, today, onStatusChange, onEdit, onDelete, onComplete, onCompleteForever, onSchedule }: Props) {
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
  const scheduledChip = getScheduledChip(task.scheduled_date, task.scheduled_time, today)
  const deadlineChip = getDeadlineChip(task.deadline, task.scheduled_date, today)
  const isRecurring = task.recurrence_rule != null

  const handleCircleClick = () => {
    // If a long-press just fired, swallow the synthetic click that follows.
    if (longPressActive.current) { longPressActive.current = false; return }
    if (task.status === 'todo' || task.status === 'in_progress') {
      if (onComplete) {
        onComplete(task.id)
      } else {
        onStatusChange(task.id, 'completed')
      }
    } else if (task.status === 'completed' || task.status === 'canceled') {
      // Click again to reopen the task.
      onStatusChange(task.id, 'todo')
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

          {/* Name + date chips */}
          <div className="flex items-start justify-between gap-2">
            {/* Clicking the name opens the edit sheet */}
            <button
              type="button"
              onClick={() => onEdit(task)}
              className={`text-sm font-medium leading-snug text-left hover:underline ${
                isInactive ? 'line-through text-gray-400' : 'text-gray-900'
              }`}
            >
              {task.name}
            </button>

            {/* Date chips: recurring indicator + scheduled date + deadline */}
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">

              {/* Recurring indicator — ↻ icon with hover tooltip */}
              {isRecurring && (
                <span className="relative group/recur" data-testid="recurring-indicator">
                  <span className="text-xs text-gray-400 cursor-default select-none">↻</span>
                  {/* Tooltip shown on hover */}
                  <span className="pointer-events-none absolute bottom-[calc(100%+4px)] right-0 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover/recur:opacity-100 z-30">
                    {recurrenceLabel(task.recurrence_rule)}
                  </span>
                </span>
              )}

              {scheduledChip && (
                <span className={`text-xs ${scheduledChip.color}`} data-testid="scheduled-chip">
                  {scheduledChip.text}
                </span>
              )}

              {/* Deadline chip — only shown when deadline differs from scheduled_date */}
              {deadlineChip && (
                <span className={`text-xs flex items-center gap-0.5 ${deadlineChip.color}`} data-testid="deadline-chip">
                  {/* Flag icon (⚑) */}
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M2 1.5a.5.5 0 011 0V2h5.5a.5.5 0 01.354.854L7.207 4.5l1.647 1.646A.5.5 0 018.5 7H3v3.5a.5.5 0 01-1 0V1.5z" />
                  </svg>
                  {deadlineChip.text}
                </span>
              )}
            </div>
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

        {/* Schedule button — shown in backlog view to quickly set a scheduled date */}
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
              <div className="absolute right-0 top-[calc(100%+4px)] z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-36">
                <button
                  onClick={() => { setMenuOpen(false); onEdit(task) }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                  Edit
                </button>

                {/* "Complete forever" only shown for recurring tasks when callback is provided */}
                {isRecurring && onCompleteForever && (
                  <button
                    onClick={() => { setMenuOpen(false); onCompleteForever(task.id) }}
                    className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Complete forever
                  </button>
                )}

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
