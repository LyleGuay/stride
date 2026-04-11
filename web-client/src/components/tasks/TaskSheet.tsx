/* TaskSheet — Add / Edit Task modal.
 *
 * Desktop (≥640px): two-column, max-w-3xl.
 *   Left panel: status circle + title + always-visible description.
 *   Right sidebar: priority, scheduled date, repeat, deadline, tags.
 *   Date / repeat pickers open as floating portals (don't shift layout).
 * Mobile (<640px): bottom sheet, single column.
 *
 * Edit mode: auto-saves 1.5 s after any field change — no Save button.
 * Create mode: "Add task" button at footer.
 *
 * Status circle (top-left of title row):
 *   Single click  → toggle todo ↔ completed.
 *   Long press (500 ms) → status picker popup for all four states.
 */

import {
  useState, useEffect, useLayoutEffect, useRef, useCallback,
  type FormEvent, type KeyboardEvent, type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { createTask, updateTask } from '../../api'
import type { Task, CreateTaskInput, UpdateTaskInput } from '../../types'

/* ─── Calendar helpers ───────────────────────────────────────────────── */

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function nextMonday(today: string): string {
  const d = new Date(today + 'T00:00:00')
  const day = d.getDay()
  const daysUntil = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + daysUntil)
  return d.toISOString().slice(0, 10)
}

function buildCalendarGrid(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startPad = (first.getDay() + 6) % 7
  const cells: Array<string | null> = Array(startPad).fill(null)
  for (let d = 1; d <= lastDay; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function formatDateLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === shiftDate(today, 1)) return 'Tomorrow'
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatTimeLabel(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  return `${h % 12 || 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/* ─── Popup portal ───────────────────────────────────────────────────── */

// Renders children in a fixed-position panel attached to document.body so it
// floats above the modal (bypasses overflow:hidden on any ancestor).
interface PopupProps {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: React.ReactNode
  align?: 'left' | 'right'  // which edge of the anchor to align to
}

function Popup({ anchorRef, open, onClose, children, align = 'left' }: PopupProps) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' })
  const panelRef = useRef<HTMLDivElement>(null)

  // Measure the anchor's bounding rect and update the portal position.
  // useLayoutEffect fires synchronously after commit (before paint) which
  // ensures tests can query popup content immediately after fireEvent.click,
  // and ensures the position is measured after the latest DOM update.
  // Any auto-opened popup (initialFocusScheduledDate) is delayed 350 ms by the
  // caller so the modal's CSS open transition has settled before we measure.
  // setState in a layout effect is intentional — this is pure DOM measurement
  // syncing, the canonical case that justifies it.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (!open) {
      setStyle({ visibility: 'hidden' })
      return
    }
    if (!anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const panelW = panelRef.current?.offsetWidth ?? 300
    const left = align === 'right' ? r.right - panelW : r.left
    setStyle({
      position: 'fixed',
      top: r.bottom + 6,
      left: Math.max(8, Math.min(left, window.innerWidth - panelW - 8)),
      zIndex: 9999,
      visibility: 'visible',
    })
  }, [open, anchorRef, align])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Close on outside click/touch.
  useEffect(() => {
    if (!open) return
    const handleDown = (e: globalThis.MouseEvent | globalThis.TouchEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('touchstart', handleDown)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('touchstart', handleDown)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null
  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className="bg-white border border-gray-200 rounded-xl shadow-2xl w-max"
    >
      {children}
    </div>,
    document.body,
  )
}

/* ─── Recurrence types and helpers ──────────────────────────────────── */

interface RecurrenceRuleValue {
  frequency: string
  interval: number
  unit: string        // days | weeks | months | years
  days_of_week: number[]
  anchor: string      // schedule | completion
}

const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DOW_FULL   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isoDayOfWeek(date: string): number {
  const d = new Date(date + 'T00:00:00')
  return ((d.getDay() + 6) % 7) + 1
}

function defaultRule(frequency: string, scheduledDate: string | null): RecurrenceRuleValue {
  const dow = scheduledDate ? isoDayOfWeek(scheduledDate) : 1
  const unitMap: Record<string, string> = {
    daily: 'days', weekdays: 'days', weekly: 'weeks',
    monthly: 'months', yearly: 'years', custom: 'days',
  }
  return {
    frequency,
    interval: 1,
    unit: unitMap[frequency] ?? 'days',
    days_of_week: frequency === 'weekly' ? [dow] : [],
    anchor: 'schedule',
  }
}

function recurrenceSummary(rule: RecurrenceRuleValue | null): string {
  if (!rule) return 'None'
  const anchor = rule.anchor === 'completion' ? ', after completion' : ''
  switch (rule.frequency) {
    case 'daily':    return `Every day${anchor}`
    case 'weekdays': return `Every weekday${anchor}`
    case 'weekly': {
      const days = rule.days_of_week.map(d => DOW_FULL[d - 1]).join(', ')
      return `Every week${days ? ` on ${days}` : ''}${anchor}`
    }
    case 'monthly':  return `Every month${anchor}`
    case 'yearly':   return `Every year${anchor}`
    case 'custom': {
      const u = rule.interval === 1 ? rule.unit.replace(/s$/, '') : rule.unit
      return `Every ${rule.interval} ${u}${anchor}`
    }
    default: return 'Custom'
  }
}

function rulePreset(rule: RecurrenceRuleValue | null): string {
  if (!rule) return 'none'
  const known = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly']
  return known.includes(rule.frequency) ? rule.frequency : 'custom'
}

/* ─── Priority / status config ───────────────────────────────────────── */

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent',  dot: 'bg-red-500',    text: 'text-red-600',    ring: 'ring-red-500' },
  { value: 'high',   label: 'High',    dot: 'bg-orange-400', text: 'text-orange-600', ring: 'ring-orange-400' },
  { value: 'medium', label: 'Medium',  dot: 'bg-indigo-500', text: 'text-indigo-600', ring: 'ring-indigo-500' },
  { value: 'low',    label: 'Low',     dot: 'bg-gray-300',   text: 'text-gray-500',   ring: 'ring-gray-300' },
] as const

const STATUSES = [
  { value: 'todo',        label: 'Todo',        symbol: '○' },
  { value: 'in_progress', label: 'In Progress', symbol: '◑' },
  { value: 'completed',   label: 'Done',        symbol: '✓' },
  { value: 'canceled',    label: 'Canceled',    symbol: '×' },
] as const

// Priority hex colors for the marching-ants SVG on in_progress tasks.
const PRIORITY_HEX: Record<string, string> = {
  urgent: '#ef4444', high: '#fb923c', medium: '#6366f1', low: '#d1d5db',
}

/* ─── Props ──────────────────────────────────────────────────────────── */

interface Props {
  task?: Task | null
  open: boolean
  onClose: () => void
  onSave: (task: Task) => void
  today: string
  initialFocusScheduledDate?: boolean
}

/* ─── CalendarPanel ──────────────────────────────────────────────────── */

// Inline calendar grid. Rendered inside a Popup portal.
interface CalendarPanelProps {
  selected: string | null
  onSelect: (date: string | null) => void
  showTime?: boolean
  time?: string | null
  onTimeChange?: (t: string | null) => void
  today: string
}

function CalendarPanel({ selected, onSelect, showTime, time, onTimeChange, today }: CalendarPanelProps) {
  const [calYear, setCalYear] = useState(() => {
    const a = selected ?? today
    return new Date(a + 'T00:00:00').getFullYear()
  })
  const [calMonth, setCalMonth] = useState(() => {
    const a = selected ?? today
    return new Date(a + 'T00:00:00').getMonth()
  })

  const cells = buildCalendarGrid(calYear, calMonth)
  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  return (
    <div data-testid="calendar-panel" className="p-3 w-72">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-700">{MONTH_NAMES[calMonth]} {calYear}</span>
        <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />
          const isSel = cell === selected
          const isToday = cell === today
          return (
            <button
              key={cell}
              type="button"
              onClick={() => onSelect(isSel ? null : cell)}
              className={`aspect-square flex items-center justify-center text-sm rounded-full transition-colors mx-0.5 ${
                isSel
                  ? 'bg-indigo-600 text-white font-semibold'
                  : isToday
                    ? 'ring-2 ring-indigo-400 text-indigo-700 font-medium hover:bg-indigo-50'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {parseInt(cell.slice(8), 10)}
            </button>
          )
        })}
      </div>

      {/* Quick shortcuts */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
        {[
          { label: 'Today',     date: today },
          { label: 'Tomorrow',  date: shiftDate(today, 1) },
          { label: 'Next week', date: nextMonday(today) },
        ].map(({ label, date }) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(date)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              selected === date
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
        >
          No date
        </button>
      </div>

      {/* Time row (scheduled date only) */}
      {showTime && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">Time</span>
          <input
            type="time"
            value={time ?? ''}
            onChange={e => onTimeChange?.(e.target.value || null)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {time && (
            <button
              type="button"
              onClick={() => onTimeChange?.(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Clear time"
            >×</button>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── RecurrencePanel ────────────────────────────────────────────────── */

interface RecurrencePanelProps {
  rule: RecurrenceRuleValue | null
  onChange: (rule: RecurrenceRuleValue | null) => void
  scheduledDate: string | null
}

function RecurrencePanel({ rule, onChange, scheduledDate }: RecurrencePanelProps) {
  const preset = rulePreset(rule)

  const handlePreset = (p: string) => {
    if (p === 'none') { onChange(null); return }
    const newRule = defaultRule(p, scheduledDate)
    if (rule) newRule.anchor = rule.anchor
    onChange(newRule)
  }

  const update = (patch: Partial<RecurrenceRuleValue>) => {
    if (!rule) return
    onChange({ ...rule, ...patch })
  }

  const toggleDow = (d: number) => {
    if (!rule) return
    const next = rule.days_of_week.includes(d)
      ? rule.days_of_week.filter(x => x !== d)
      : [...rule.days_of_week, d].sort()
    if (next.length > 0) update({ days_of_week: next })
  }

  const presets = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom']

  return (
    <div className="p-3 w-72 space-y-3">
      {/* Preset chips */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => handlePreset(p)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize transition-colors ${
              preset === p
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {p === 'none' ? 'None' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Custom interval */}
      {preset === 'custom' && rule && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Every</span>
            <input
              type="number"
              min={1}
              max={999}
              value={rule.interval}
              onChange={e => update({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-14 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-center"
            />
            <select
              value={rule.unit}
              onChange={e => update({ unit: e.target.value, days_of_week: [] })}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </div>
          {rule.unit === 'weeks' && (
            <div data-testid="dow-toggles" className="flex gap-1">
              {DOW_LABELS.map((label, i) => {
                const dow = i + 1
                const active = rule.days_of_week.includes(dow)
                return (
                  <button key={dow} type="button" onClick={() => toggleDow(dow)}
                    className={`w-8 h-8 rounded-full text-xs font-medium border transition-colors ${
                      active ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >{label}</button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Weekly DOW toggles */}
      {preset === 'weekly' && rule && (
        <div data-testid="dow-toggles" className="flex gap-1">
          {DOW_LABELS.map((label, i) => {
            const dow = i + 1
            const active = rule.days_of_week.includes(dow)
            return (
              <button key={dow} type="button" onClick={() => toggleDow(dow)}
                className={`w-8 h-8 rounded-full text-xs font-medium border transition-colors ${
                  active ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >{label}</button>
            )
          })}
        </div>
      )}

      {/* Anchor toggle */}
      {rule && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            {(['schedule', 'completion'] as const).map(a => (
              <button
                key={a}
                type="button"
                onClick={() => update({ anchor: a })}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  rule.anchor === a
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {a === 'schedule' ? 'On schedule' : 'After completion'}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400">
            {rule.anchor === 'completion'
              ? 'Next date calculated from when you complete the task.'
              : 'Next date calculated from the scheduled date.'}
          </p>
        </div>
      )}

      {/* Live summary */}
      {rule && <p className="text-xs text-indigo-600 font-medium">{recurrenceSummary(rule)}</p>}
    </div>
  )
}

/* ─── TaskSheet ──────────────────────────────────────────────────────── */

export default function TaskSheet({ task, open, onClose, onSave, today, initialFocusScheduledDate }: Props) {
  const isEdit = !!task

  // ── Form state ────────────────────────────────────────────────────────
  const [name, setName]                   = useState('')
  const [description, setDescription]     = useState('')
  const [descEditing, setDescEditing]     = useState(false)
  const [scheduledDate, setScheduledDate] = useState<string | null>(null)
  const [scheduledTime, setScheduledTime] = useState<string | null>(null)
  const [deadline, setDeadline]           = useState<string | null>(null)
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRuleValue | null>(null)
  const [priority, setPriority]           = useState<'urgent' | 'high' | 'medium' | 'low'>('medium')
  const [status, setStatus]               = useState<'todo' | 'in_progress' | 'completed' | 'canceled'>('todo')
  const [tags, setTags]                   = useState<string[]>([])
  const [tagInput, setTagInput]           = useState('')

  // ── Popup state ───────────────────────────────────────────────────────
  const [activePopup, setActivePopup] = useState<'scheduled' | 'deadline' | 'repeat' | 'priority' | 'status' | null>(null)

  // ── Auto-save (edit mode) ─────────────────────────────────────────────
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const formInitialized   = useRef(false)
  const saveTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── UI ────────────────────────────────────────────────────────────────
  const [saving, setSaving]   = useState(false)   // create-mode spinner
  const [error, setError]     = useState<string | null>(null)
  const nameRef               = useRef<HTMLInputElement>(null)

  // Refs for popup anchors
  const scheduledBtnRef  = useRef<HTMLButtonElement>(null)
  const deadlineBtnRef   = useRef<HTMLButtonElement>(null)
  const repeatBtnRef     = useRef<HTMLButtonElement>(null)
  const priorityBtnRef   = useRef<HTMLButtonElement>(null)
  const statusBtnRef     = useRef<HTMLButtonElement>(null)

  // Long-press timer for status circle
  const statusLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Reset form on open ────────────────────────────────────────────────
  const initForm = useCallback(() => {
    formInitialized.current = false
    setError(null)
    setDescEditing(false)
    setTagInput('')
    setActivePopup(null)
    setSaveState('idle')
    if (task) {
      setName(task.name)
      setDescription(task.description ?? '')
      setScheduledDate(task.scheduled_date)
      setScheduledTime(task.scheduled_time)
      setDeadline(task.deadline)
      setRecurrenceRule(task.recurrence_rule as RecurrenceRuleValue | null)
      setPriority(task.priority)
      setStatus(task.status)
      setTags([...task.tags])
    } else {
      setName('')
      setDescription('')
      setScheduledDate(null)
      setScheduledTime(null)
      setDeadline(null)
      setRecurrenceRule(null)
      setPriority('medium')
      setStatus('todo')
      setTags([])
    }
    setActivePopup(null) // popup is opened via a delayed timeout below, not here
  }, [task])

  useEffect(() => {
    if (!open) {
      // Ensure no popup remains visible after the modal closes.
      setActivePopup(null)
      return
    }
    initForm()
    if (!initialFocusScheduledDate) {
      setTimeout(() => nameRef.current?.focus(), 50)
    } else {
      // Delay popup until after the modal's 300 ms CSS open transition so that
      // getBoundingClientRect() on the anchor sees its final position.
      setTimeout(() => setActivePopup('scheduled'), 350)
    }
    // Mark form as initialized after React flushes the state updates above.
    const t = setTimeout(() => { formInitialized.current = true }, 100)
    return () => clearTimeout(t)
  }, [open, initForm, initialFocusScheduledDate])

  // ── Auto-save for edit mode ───────────────────────────────────────────
  // Fires 1.5 s after any field change when editing an existing task.
  const buildUpdateInput = useCallback((): UpdateTaskInput => ({
    name: name.trim(),
    description: description.trim() || undefined,
    scheduled_date: scheduledDate ?? '',
    scheduled_time: scheduledTime ?? '',
    deadline: deadline ?? undefined,
    recurrence_rule: recurrenceRule ?? null,
    priority,
    status,
    tags,
  }), [name, description, scheduledDate, scheduledTime, deadline, recurrenceRule, priority, status, tags])

  useEffect(() => {
    if (!isEdit || !open || !formInitialized.current) return
    if (!name.trim()) return

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveState('saving')
      try {
        const saved = await updateTask(task!.id, buildUpdateInput())
        onSave(saved)
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2000)
      } catch {
        setSaveState('idle')
      }
    }, 1500)

    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  }, [name, description, scheduledDate, scheduledTime, deadline, recurrenceRule, priority, status, tags]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Status circle interactions ────────────────────────────────────────

  const handleStatusMouseDown = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    statusLongPressRef.current = setTimeout(() => {
      statusLongPressRef.current = null
      setActivePopup(p => p === 'status' ? null : 'status')
    }, 500)
  }

  const handleStatusMouseUp = () => {
    if (statusLongPressRef.current) {
      clearTimeout(statusLongPressRef.current)
      statusLongPressRef.current = null
      // Quick click: toggle todo ↔ completed
      setStatus(prev => prev === 'completed' ? 'todo' : 'completed')
    }
  }

  const handleStatusMouseLeave = () => {
    if (statusLongPressRef.current) {
      clearTimeout(statusLongPressRef.current)
      statusLongPressRef.current = null
    }
  }

  // ── Tag input ─────────────────────────────────────────────────────────
  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/,/g, '')
    if (tag && !tags.includes(tag)) setTags(prev => [...prev, tag])
    setTagInput('')
  }

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
    else if (e.key === 'Backspace' && !tagInput && tags.length > 0) setTags(prev => prev.slice(0, -1))
  }

  // ── Create mode submit ────────────────────────────────────────────────
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const finalTags = tagInput.trim() ? [...tags, tagInput.trim().toLowerCase()] : tags
      const input: CreateTaskInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        scheduled_date: scheduledDate ?? undefined,
        scheduled_time: scheduledTime ?? undefined,
        deadline: deadline ?? undefined,
        recurrence_rule: recurrenceRule ?? undefined,
        priority,
        tags: finalTags,
      }
      const saved = await createTask(input)
      onSave(saved)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Status circle visual ─────────────────────────────────────────── */

  const priorityHex = PRIORITY_HEX[priority] ?? '#6366f1'

  function StatusCircle() {
    if (status === 'completed') {
      return (
        <div className={`w-5 h-5 rounded-full flex items-center justify-center bg-indigo-600`}>
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      )
    }
    if (status === 'canceled') {
      return (
        <div className="w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-gray-300">
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      )
    }
    if (status === 'in_progress') {
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke={priorityHex} strokeWidth="2"
            strokeDasharray="5 3.5"
            style={{ animation: 'march 0.6s linear infinite' }} />
        </svg>
      )
    }
    // todo
    return (
      <div className="w-5 h-5 rounded-full ring-2 ring-gray-300 hover:ring-indigo-400 transition-colors" />
    )
  }

  /* ─── Derived values ───────────────────────────────────────────────── */

  const activePriority = PRIORITIES.find(p => p.value === priority)!

  /* ─── Render ──────────────────────────────────────────────────────────*/

  return (
    <div
      className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300
        sm:flex sm:items-center sm:justify-center sm:p-4
        ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={onClose}
    >
      {/* Modal panel.
          Mobile  (<sm): fixed bottom-0 — slides up from bottom. fixed is also a
                         positioning context, so the absolute X button is anchored
                         to the panel without needing `relative`.
          Desktop (≥sm): sm:relative puts it in the flex-center flow and creates
                         the positioning context for the absolute X button.
                         Do NOT use sm:static here — static is not a positioning
                         context and the X would end up at the viewport corner. */}
      <div
        className={`bg-white shadow-2xl transition-all duration-300
          fixed bottom-0 left-0 right-0 rounded-t-2xl min-h-[70vh]
          ${open ? 'translate-y-0' : 'translate-y-full'}
          sm:relative sm:rounded-2xl sm:w-full sm:max-w-3xl sm:translate-y-0 sm:min-h-[640px]
          ${open ? 'sm:scale-100 sm:opacity-100' : 'sm:scale-95 sm:opacity-0'}`}
        style={{ maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* X close button — always top-right of modal */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Form */}
        <form
          onSubmit={handleCreate}
          className="flex flex-col"
          style={{ maxHeight: 'calc(92vh - 1rem)' }}
        >
          {/* ── Modal heading — visible label, also targeted by Playwright tests */}
          <div className="px-5 pt-3 sm:pt-4 pb-1 pr-12">
            <h2 className="text-xs font-semibold text-gray-400 tracking-wide">
              {isEdit ? 'Edit Task' : 'New Task'}
            </h2>
          </div>

          {/* ── Content: stacks mobile, flex-row desktop ───────────── */}
          <div className="flex flex-col sm:flex-row flex-1 overflow-y-auto sm:overflow-hidden">

            {/* Left panel — status + title + description */}
            <div className="flex-1 min-w-0 px-5 pt-4 pb-0 sm:pt-5 sm:pb-5 sm:overflow-y-auto">

              {/* Title row: status circle | name input | auto-save indicator */}
              {/* pr-8 gives clearance for the absolute X button at top-right */}
              <div className="flex items-center gap-3 mb-3 pr-8">
                {/* Status circle (edit mode) */}
                {isEdit ? (
                  <div className="relative flex-shrink-0">
                    <button
                      ref={statusBtnRef}
                      type="button"
                      onMouseDown={handleStatusMouseDown}
                      onMouseUp={handleStatusMouseUp}
                      onMouseLeave={handleStatusMouseLeave}
                      onTouchStart={() => handleStatusMouseDown({ preventDefault: () => {} } as MouseEvent<HTMLButtonElement>)}
                      onTouchEnd={handleStatusMouseUp}
                      className="flex items-center justify-center"
                      aria-label="Set status"
                    >
                      <StatusCircle />
                    </button>
                    {/* Status picker popup */}
                    <Popup
                      anchorRef={statusBtnRef}
                      open={activePopup === 'status'}
                      onClose={() => setActivePopup(null)}
                      align="left"
                    >
                      <div className="py-1 min-w-[140px]">
                        {STATUSES.map(s => (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => { setStatus(s.value); setActivePopup(null) }}
                            className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                              status === s.value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                            }`}
                          >
                            <span className="text-base">{s.symbol}</span>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </Popup>
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full ring-2 ring-gray-200 flex-shrink-0" />
                )}

                {/* Name */}
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Task name"
                  required
                  className="flex-1 min-w-0 text-base font-medium border-0 focus:outline-none placeholder:text-gray-400 bg-transparent"
                />

                {/* Auto-save indicator */}
                {isEdit && saveState !== 'idle' && (
                  <span className={`flex-shrink-0 text-xs ${saveState === 'saving' ? 'text-gray-400' : 'text-green-600'}`}>
                    {saveState === 'saving' ? 'Saving…' : 'Saved'}
                  </span>
                )}
              </div>

              {/* Separator */}
              <div className="border-b border-gray-100 mb-3" />

              {/* Description — always visible, click to edit */}
              <div className="mb-4">
                {descEditing ? (
                  <textarea
                    autoFocus
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    onBlur={() => setDescEditing(false)}
                    placeholder="Add notes… Markdown supported."
                    rows={5}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  />
                ) : (
                  <div
                    onClick={() => setDescEditing(true)}
                    className="min-h-[80px] rounded-xl px-3 py-2.5 border border-transparent hover:border-gray-200 cursor-text transition-colors text-sm"
                  >
                    {description.trim() ? (
                      <div className="text-gray-700 leading-relaxed prose prose-sm max-w-none [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_p]:mb-1 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
                        <ReactMarkdown>{description}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="text-gray-400">Add notes… Markdown supported.</span>
                    )}
                  </div>
                )}
              </div>

              {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            </div>

            {/* Right sidebar — properties */}
            <div className="border-t sm:border-t-0 sm:border-l border-gray-100 sm:bg-gray-50/50 px-5 sm:px-4 pt-4 sm:pt-5 pb-4 sm:pb-5 sm:w-64 sm:flex-shrink-0 sm:overflow-y-auto space-y-4">

              {/* ── Priority ─────────────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Priority</label>
                <div className="relative">
                  <button
                    ref={priorityBtnRef}
                    type="button"
                    onClick={() => setActivePopup(p => p === 'priority' ? null : 'priority')}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:border-gray-300 transition-colors"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${activePriority.dot}`} />
                    <span className={`flex-1 text-left font-medium ${activePriority.text}`}>{activePriority.label}</span>
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  <Popup
                    anchorRef={priorityBtnRef}
                    open={activePopup === 'priority'}
                    onClose={() => setActivePopup(null)}
                    align="right"
                  >
                    <div className="py-1 min-w-[160px]">
                      {PRIORITIES.map(p => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => { setPriority(p.value); setActivePopup(null) }}
                          className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                            priority === p.value ? 'bg-indigo-50' : ''
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.dot}`} />
                          <span className={`font-medium ${p.text}`}>{p.label}</span>
                          {priority === p.value && (
                            <svg className="w-4 h-4 text-indigo-600 ml-auto" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </Popup>
                </div>
              </div>

              {/* ── Scheduled Date ──────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Scheduled Date</label>
                <button
                  ref={scheduledBtnRef}
                  type="button"
                  onClick={() => setActivePopup(p => p === 'scheduled' ? null : 'scheduled')}
                  className={`flex items-center gap-1.5 w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                    scheduledDate
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
                  </svg>
                  <span className="flex-1 text-left">
                    {scheduledDate
                      ? `${formatDateLabel(scheduledDate, today)}${scheduledTime ? ` · ${formatTimeLabel(scheduledTime)}` : ''}`
                      : 'No date'}
                  </span>
                </button>
                <Popup
                  anchorRef={scheduledBtnRef}
                  open={activePopup === 'scheduled'}
                  onClose={() => setActivePopup(null)}
                  align="right"
                >
                  <CalendarPanel
                    selected={scheduledDate}
                    onSelect={d => {
                      setScheduledDate(d)
                      if (!d) setScheduledTime(null)
                      setActivePopup(null)
                    }}
                    showTime
                    time={scheduledTime}
                    onTimeChange={setScheduledTime}
                    today={today}
                  />
                </Popup>
              </div>

              {/* ── Repeat ───────────────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Repeat</label>
                <button
                  ref={repeatBtnRef}
                  type="button"
                  onClick={() => setActivePopup(p => p === 'repeat' ? null : 'repeat')}
                  className={`flex items-center gap-1.5 w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                    recurrenceRule
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  <span className="flex-1 text-left">{recurrenceSummary(recurrenceRule)}</span>
                </button>
                <Popup
                  anchorRef={repeatBtnRef}
                  open={activePopup === 'repeat'}
                  onClose={() => setActivePopup(null)}
                  align="right"
                >
                  <RecurrencePanel
                    rule={recurrenceRule}
                    onChange={setRecurrenceRule}
                    scheduledDate={scheduledDate}
                  />
                </Popup>
              </div>

              {/* ── Deadline ─────────────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Deadline</label>
                <button
                  ref={deadlineBtnRef}
                  type="button"
                  onClick={() => setActivePopup(p => p === 'deadline' ? null : 'deadline')}
                  className={`flex items-center gap-1.5 w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                    deadline
                      ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                  </svg>
                  <span className="flex-1 text-left">
                    {deadline ? formatDateLabel(deadline, today) : 'No deadline'}
                  </span>
                </button>
                <Popup
                  anchorRef={deadlineBtnRef}
                  open={activePopup === 'deadline'}
                  onClose={() => setActivePopup(null)}
                  align="right"
                >
                  <CalendarPanel
                    selected={deadline}
                    onSelect={d => { setDeadline(d); setActivePopup(null) }}
                    today={today}
                  />
                </Popup>
              </div>

              {/* ── Tags ─────────────────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Tags</label>
                <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 rounded-xl min-h-[40px] bg-white">
                  {tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5">
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTags(prev => prev.filter(t => t !== tag))}
                        className="text-indigo-400 hover:text-indigo-700 leading-none"
                        aria-label={`Remove ${tag}`}
                      >×</button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={() => { if (tagInput.trim()) addTag(tagInput) }}
                    placeholder={tags.length === 0 ? 'Add tags…' : ''}
                    className="flex-1 min-w-20 text-xs outline-none bg-transparent placeholder:text-gray-400"
                  />
                </div>
                <p className="mt-1 text-[10px] text-gray-400">Press Enter or comma to add</p>
              </div>

            </div>
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          {/* Edit mode: just close button (auto-save handles saving). */}
          {/* Create mode: "Add task" primary action.                    */}
          {!isEdit && (
            <div className="border-t border-gray-100 px-5 py-4 flex justify-end gap-3">
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
