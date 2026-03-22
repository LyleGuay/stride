/* TaskSheet — Add / Edit Task bottom sheet (mobile) or centered modal (desktop).
 *
 * Fields: name (autofocus), description (collapsible markdown), due date + time
 * (inline calendar panel), priority pills, status (edit mode only), tags chip input.
 *
 * Props:
 *   task?               — null/undefined = create mode, Task = edit mode
 *   open                — controls visibility
 *   onClose             — called when the sheet should close
 *   onSave              — called with the saved Task after API success
 *   today               — YYYY-MM-DD (client's local date)
 *   initialFocusDueDate — when true, opens the calendar panel on mount (Schedule btn)
 */

import { useState, useEffect, useRef, useCallback, type FormEvent, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { createTask, updateTask } from '../../api'
import type { Task, CreateTaskInput, UpdateTaskInput } from '../../types'

/* ─── Calendar helpers ───────────────────────────────────────────────── */

// Shifts a YYYY-MM-DD string by `days` days.
function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Returns the coming Monday (next week start).
function nextMonday(today: string): string {
  const d = new Date(today + 'T00:00:00')
  const day = d.getDay() // 0=Sun
  const daysUntil = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + daysUntil)
  return d.toISOString().slice(0, 10)
}

// Builds the calendar day cells for a given year/month.
// Returns YYYY-MM-DD strings for real days and null for padding cells.
// Grid starts on Monday (European convention common in productivity apps).
function buildCalendarGrid(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startPad = (first.getDay() + 6) % 7 // Mon=0, Tue=1, … Sun=6
  const cells: Array<string | null> = Array(startPad).fill(null)
  for (let d = 1; d <= lastDay; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

// Formats a YYYY-MM-DD for the date button label.
function formatDateLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === shiftDate(today, 1)) return 'Tomorrow'
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

// Converts "HH:MM" (24h) to "h:MM AM/PM" for the time button.
function formatTimeLabel(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  return `${h % 12 || 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/* ─── Priority / status config ───────────────────────────────────────── */

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent',   color: 'border-red-400 text-red-600',     active: 'bg-red-500 border-red-500 text-white' },
  { value: 'high',   label: 'High',     color: 'border-orange-300 text-orange-600', active: 'bg-orange-400 border-orange-400 text-white' },
  { value: 'medium', label: 'Medium',   color: 'border-indigo-300 text-indigo-600', active: 'bg-indigo-500 border-indigo-500 text-white' },
  { value: 'low',    label: 'Low',      color: 'border-gray-300 text-gray-500',   active: 'bg-gray-400 border-gray-400 text-white' },
] as const

const STATUSES = [
  { value: 'todo',        label: 'Todo',        symbol: '○' },
  { value: 'in_progress', label: 'In Progress', symbol: '◑' },
  { value: 'completed',   label: 'Done',        symbol: '✓' },
  { value: 'canceled',    label: 'Canceled',    symbol: '×' },
] as const

/* ─── Props ──────────────────────────────────────────────────────────── */

interface Props {
  task?: Task | null
  open: boolean
  onClose: () => void
  onSave: (task: Task) => void
  today: string
  initialFocusDueDate?: boolean
}

/* ─── TaskSheet ──────────────────────────────────────────────────────── */

export default function TaskSheet({ task, open, onClose, onSave, today, initialFocusDueDate }: Props) {
  const isEdit = !!task

  // ── Form state ────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [showDescription, setShowDescription] = useState(false)
  const [descPreview, setDescPreview] = useState(false)
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [dueTime, setDueTime] = useState<string | null>(null)
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>('medium')
  const [status, setStatus] = useState<'todo' | 'in_progress' | 'completed' | 'canceled'>('todo')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // ── Calendar state ────────────────────────────────────────────────────
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())

  // ── UI state ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const timeInputRef = useRef<HTMLInputElement>(null)

  // ── Reset / pre-fill on open ──────────────────────────────────────────
  const initForm = useCallback(() => {
    setError(null)
    setDescPreview(false)
    setTagInput('')
    if (task) {
      setName(task.name)
      setDescription(task.description ?? '')
      setShowDescription(!!task.description)
      setDueDate(task.due_date)
      setDueTime(task.due_time)
      setPriority(task.priority)
      setStatus(task.status)
      setTags([...task.tags])
    } else {
      setName('')
      setDescription('')
      setShowDescription(false)
      setDueDate(null)
      setDueTime(null)
      setPriority('medium')
      setStatus('todo')
      setTags([])
    }
    // Calendar starts at the selected due date's month, or current month.
    const anchor = task?.due_date ?? today
    const d = new Date(anchor + 'T00:00:00')
    setCalYear(d.getFullYear())
    setCalMonth(d.getMonth())
    setCalendarOpen(!!initialFocusDueDate)
  }, [task, today, initialFocusDueDate])

  useEffect(() => {
    if (!open) return
    initForm()
    // Focus name unless we're opening the calendar directly.
    if (!initialFocusDueDate) {
      setTimeout(() => nameRef.current?.focus(), 50)
    }
  }, [open, initForm, initialFocusDueDate])

  // ── Date helpers ──────────────────────────────────────────────────────
  const pickDate = (date: string | null) => {
    setDueDate(date)
    if (!date) setDueTime(null)
    if (date) setCalendarOpen(false) // auto-close after picking
  }

  const openCalendar = () => {
    const anchor = dueDate ?? today
    const d = new Date(anchor + 'T00:00:00')
    setCalYear(d.getFullYear())
    setCalMonth(d.getMonth())
    setCalendarOpen(true)
  }

  // ── Tag input ─────────────────────────────────────────────────────────
  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/,/g, '')
    if (tag && !tags.includes(tag)) setTags(prev => [...prev, tag])
    setTagInput('')
  }

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      // Flush any pending tag input
      const finalTags = tagInput.trim()
        ? [...tags, tagInput.trim().toLowerCase()]
        : tags

      let saved: Task
      if (isEdit) {
        const input: UpdateTaskInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          due_date: dueDate ?? '',
          due_time: dueTime ?? '',
          priority,
          status,
          tags: finalTags,
        }
        saved = await updateTask(task.id, input)
      } else {
        const input: CreateTaskInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          due_date: dueDate ?? undefined,
          due_time: dueTime ?? undefined,
          priority,
          tags: finalTags,
        }
        saved = await createTask(input)
      }
      onSave(saved)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  // ── Calendar grid ─────────────────────────────────────────────────────
  const calendarCells = buildCalendarGrid(calYear, calMonth)
  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  /* ─── Render ──────────────────────────────────────────────────────── */

  return (
    <>
      {/* Backdrop + centering container */}
      <div
        className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300
          sm:flex sm:items-center sm:justify-center sm:p-4
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      >
        {/* Sheet (mobile) / Modal (desktop) */}
        <div
          className={`bg-white shadow-2xl overflow-hidden transition-all duration-300
            fixed bottom-0 left-0 right-0 rounded-t-2xl
            ${open ? 'translate-y-0' : 'translate-y-full'}
            sm:static sm:rounded-2xl sm:w-full sm:max-w-lg sm:translate-y-0
            ${open ? 'sm:scale-100 sm:opacity-100' : 'sm:scale-95 sm:opacity-0'}`}
          style={{ maxHeight: '92vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col overflow-y-auto"
            style={{ maxHeight: 'calc(92vh - 1rem)' }}
          >
            <div className="px-5 pt-4 pb-2 sm:pt-5">
              {/* ── Header ────────────────────────────────────────────── */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">{isEdit ? 'Edit Task' : 'New Task'}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* ── Name ──────────────────────────────────────────────── */}
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Task name"
                required
                className="w-full text-base font-medium border-0 border-b border-gray-200 pb-2 mb-4 focus:outline-none focus:border-indigo-500 placeholder:text-gray-400"
              />

              {/* ── Description (collapsible) ──────────────────────────── */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setShowDescription(s => !s)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${showDescription ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  {showDescription ? 'Hide notes' : 'Add notes'}
                </button>

                {showDescription && (
                  <div>
                    <div className="flex justify-end mb-1">
                      <button
                        type="button"
                        onClick={() => setDescPreview(p => !p)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        {descPreview ? 'Edit' : 'Preview'}
                      </button>
                    </div>
                    {descPreview ? (
                      <div className="min-h-24 border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 text-sm text-gray-700 leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_p]:mb-1 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
                        {description.trim()
                          ? <ReactMarkdown>{description}</ReactMarkdown>
                          : <span className="text-gray-400 italic">Nothing to preview.</span>
                        }
                      </div>
                    ) : (
                      <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Add notes… Markdown supported."
                        rows={4}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ── Due Date + Time ────────────────────────────────────── */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Due</label>
                <div className="flex gap-2">
                  {/* Date button */}
                  <button
                    type="button"
                    onClick={calendarOpen ? () => setCalendarOpen(false) : openCalendar}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                      dueDate
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
                    </svg>
                    {dueDate ? formatDateLabel(dueDate, today) : 'No date'}
                  </button>

                  {/* Time button */}
                  <button
                    type="button"
                    onClick={() => {
                      openCalendar()
                      setTimeout(() => timeInputRef.current?.focus(), 200)
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                      dueTime
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {dueTime ? formatTimeLabel(dueTime) : 'Add time'}
                  </button>
                </div>

                {/* ── Inline calendar panel ─────────────────────────── */}
                {calendarOpen && (
                  <div className="mt-2 border border-gray-200 rounded-xl p-3 bg-white">

                    {/* Month navigator */}
                    <div className="flex items-center justify-between mb-3">
                      <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                        </svg>
                      </button>
                      <span className="text-sm font-semibold text-gray-700">
                        {MONTH_NAMES[calMonth]} {calYear}
                      </span>
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
                      {calendarCells.map((cell, i) => {
                        if (!cell) return <div key={i} />
                        const isSelected = cell === dueDate
                        const isToday = cell === today
                        return (
                          <button
                            key={cell}
                            type="button"
                            onClick={() => pickDate(isSelected ? null : cell)}
                            className={`aspect-square flex items-center justify-center text-sm rounded-full transition-colors mx-0.5 ${
                              isSelected
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
                          onClick={() => pickDate(date)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            dueDate === date
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { pickDate(null); setCalendarOpen(false) }}
                        className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      >
                        No date
                      </button>
                    </div>

                    {/* Time row */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                      <span className="text-xs text-gray-500 shrink-0">Time</span>
                      <input
                        ref={timeInputRef}
                        type="time"
                        value={dueTime ?? ''}
                        onChange={e => setDueTime(e.target.value || null)}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      {dueTime && (
                        <button
                          type="button"
                          onClick={() => setDueTime(null)}
                          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                          aria-label="Clear time"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Priority ───────────────────────────────────────────── */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Priority</label>
                <div className="flex gap-2">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                        priority === p.value ? p.active : `${p.color} hover:bg-gray-50`
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Status (edit mode only) ────────────────────────────── */}
              {isEdit && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Status</label>
                  <div className="flex gap-2">
                    {STATUSES.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setStatus(s.value)}
                        className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          status === s.value
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-base leading-tight">{s.symbol}</span>
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Tags ──────────────────────────────────────────────── */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Tags</label>
                <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 rounded-xl min-h-[40px]">
                  {tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5">
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTags(prev => prev.filter(t => t !== tag))}
                        className="text-indigo-400 hover:text-indigo-700 leading-none"
                        aria-label={`Remove ${tag}`}
                      >
                        ×
                      </button>
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

              {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            </div>

            {/* ── Footer ────────────────────────────────────────────────── */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
