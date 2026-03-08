// AddHabitSheet — create or edit a habit.
// Mobile: slides up as a bottom sheet. Desktop (sm+): centered modal.
// Same animation pattern as AddItemSheet.

import { useState, useEffect, useCallback, type FormEvent } from 'react'
import type { Habit, CreateHabitInput } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (input: CreateHabitInput) => void
  /** Pre-fill fields when editing an existing habit. */
  editHabit?: Habit | null
  /** Called when the user confirms deletion (edit mode only). */
  onDelete?: () => void
}

// Curated set of common habit emojis shown in the picker grid.
const EMOJI_PRESETS = [
  '🏃', '💪', '🧘', '🚴', '🏊', '🥗', '💧', '😴',
  '📚', '✍️', '🧹', '🌿', '☀️', '🎯', '🎨', '🎵',
  '🧠', '❤️', '🌱', '⭐',
]

export default function AddHabitSheet({ open, onClose, onSave, editHabit, onDelete }: Props) {
  const isEditMode = !!editHabit

  const [emoji, setEmoji] = useState<string>('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily')
  const [weeklyTarget, setWeeklyTarget] = useState(3)
  const [level1, setLevel1] = useState('')
  const [level2, setLevel2] = useState('')
  const [showLevel2, setShowLevel2] = useState(false)
  const [level3, setLevel3] = useState('')
  const [showLevel3, setShowLevel3] = useState(false)
  const [sortOrder, setSortOrder] = useState(0)

  // Validation error messages.
  const [nameError, setNameError] = useState('')
  const [level1Error, setLevel1Error] = useState('')

  // Stable callback that populates form state when the sheet opens.
  // Using useCallback avoids direct setState calls in useEffect body, satisfying
  // the react-hooks/set-state-in-effect lint rule.
  const initForm = useCallback(() => {
    setNameError('')
    setLevel1Error('')
    setShowEmojiPicker(false)
    if (editHabit) {
      setEmoji(editHabit.emoji ?? '')
      setName(editHabit.name)
      setFrequency(editHabit.frequency)
      setWeeklyTarget(editHabit.weekly_target ?? 3)
      setLevel1(editHabit.level1_label)
      setLevel2(editHabit.level2_label ?? '')
      setShowLevel2(!!editHabit.level2_label)
      setLevel3(editHabit.level3_label ?? '')
      setShowLevel3(!!editHabit.level3_label)
      setSortOrder(editHabit.sort_order)
    } else {
      setEmoji('')
      setName('')
      setFrequency('daily')
      setWeeklyTarget(3)
      setLevel1('')
      setLevel2('')
      setShowLevel2(false)
      setLevel3('')
      setShowLevel3(false)
      setSortOrder(0)
    }
  }, [editHabit])

  // Reset or pre-fill when the sheet opens.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initForm()
  }, [open, initForm])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    let valid = true

    if (!name.trim()) { setNameError('Habit name is required'); valid = false }
    else setNameError('')

    if (!level1.trim()) { setLevel1Error('Level 1 label is required'); valid = false }
    else setLevel1Error('')

    if (!valid) return

    onSave({
      name: name.trim(),
      emoji: emoji || null,
      color: null,
      frequency,
      weekly_target: frequency === 'weekly' ? weeklyTarget : null,
      level1_label: level1.trim(),
      level2_label: showLevel2 && level2.trim() ? level2.trim() : null,
      level3_label: showLevel3 && level3.trim() ? level3.trim() : null,
      sort_order: sortOrder,
    })
  }

  const handleDeleteClick = () => {
    if (window.confirm('Delete this habit and all its history? This cannot be undone.')) {
      onDelete?.()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300
          sm:flex sm:items-center sm:justify-center sm:p-4
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      >
        {/* Sheet / modal */}
        <div
          className={`bg-white shadow-2xl overflow-hidden transition-all duration-300
            fixed bottom-0 left-0 right-0 rounded-t-2xl
            ${open ? 'translate-y-0' : 'translate-y-full'}
            sm:static sm:rounded-xl sm:w-full sm:max-w-lg sm:translate-y-0
            ${open ? 'sm:scale-100 sm:opacity-100' : 'sm:scale-95 sm:opacity-0'}`}
          style={{ maxHeight: '90vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <form onSubmit={handleSubmit} className="px-5 pt-4 pb-6 sm:pt-5 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 2rem)' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">{isEditMode ? 'Edit Habit' : 'New Habit'}</h2>
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

            {/* Emoji + Name row */}
            <div className="flex gap-3 mb-4">
              {/* Emoji picker button */}
              <div className="relative">
                <button
                  type="button"
                  className="w-12 h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-2xl hover:border-gray-300 transition-colors"
                  onClick={() => setShowEmojiPicker(s => !s)}
                  aria-label="Pick emoji"
                >
                  {emoji || '✨'}
                </button>
                {showEmojiPicker && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
                    <div className="absolute left-0 top-14 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2 grid grid-cols-5 gap-1 w-44">
                      {EMOJI_PRESETS.map(e => (
                        <button
                          key={e}
                          type="button"
                          className="w-7 h-7 flex items-center justify-center text-lg rounded hover:bg-gray-100 transition-colors"
                          onClick={() => { setEmoji(e); setShowEmojiPicker(false) }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Name input */}
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Habit name"
                  value={name}
                  onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 ${
                    nameError ? 'border-red-400' : 'border-gray-300'
                  }`}
                  aria-label="Habit name"
                />
                {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
              </div>
            </div>

            {/* Frequency switcher */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {(['daily', 'weekly'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                      frequency === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    onClick={() => setFrequency(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Weekly target stepper */}
              {frequency === 'weekly' && (
                <div className="flex items-center gap-3 mt-3">
                  <button
                    type="button"
                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    onClick={() => setWeeklyTarget(t => Math.max(1, t - 1))}
                    disabled={weeklyTarget <= 1}
                    aria-label="Decrease target"
                  >
                    −
                  </button>
                  <span className="text-sm text-gray-700">
                    <span className="font-bold text-gray-900">{weeklyTarget}</span>× per week
                  </span>
                  <button
                    type="button"
                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    onClick={() => setWeeklyTarget(t => Math.min(7, t + 1))}
                    disabled={weeklyTarget >= 7}
                    aria-label="Increase target"
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            {/* Levels */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Levels</label>

              {/* L1 — always shown */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-xs font-semibold text-gray-500 w-5 shrink-0">L1</span>
                <input
                  type="text"
                  placeholder="Minimum — e.g. Go outside"
                  value={level1}
                  onChange={e => { setLevel1(e.target.value); if (level1Error) setLevel1Error('') }}
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500 ${
                    level1Error ? 'border-red-400' : 'border-gray-300'
                  }`}
                  aria-label="Level 1 label"
                />
              </div>
              {level1Error && <p className="text-xs text-red-500 mb-2">{level1Error}</p>}

              {/* L2 toggle + input */}
              {!showLevel2 ? (
                <button
                  type="button"
                  className="text-xs text-stride-600 hover:text-stride-700 font-medium mb-2"
                  onClick={() => setShowLevel2(true)}
                >
                  + Add Level 2
                </button>
              ) : (
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-xs font-semibold text-gray-500 w-5 shrink-0">L2</span>
                  <input
                    type="text"
                    placeholder="Stretch — e.g. Go outside 15+ min"
                    value={level2}
                    onChange={e => setLevel2(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500"
                    aria-label="Level 2 label"
                  />
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600"
                    onClick={() => { setShowLevel2(false); setLevel2(''); setShowLevel3(false); setLevel3('') }}
                    aria-label="Remove level 2"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* L3 toggle + input — only shown once L2 is shown */}
              {showLevel2 && !showLevel3 ? (
                <button
                  type="button"
                  className="text-xs text-stride-600 hover:text-stride-700 font-medium"
                  onClick={() => setShowLevel3(true)}
                >
                  + Add Level 3
                </button>
              ) : showLevel2 && showLevel3 ? (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-xs font-semibold text-gray-500 w-5 shrink-0">L3</span>
                  <input
                    type="text"
                    placeholder="Max — e.g. Go outside 30+ min"
                    value={level3}
                    onChange={e => setLevel3(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stride-500"
                    aria-label="Level 3 label"
                  />
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600"
                    onClick={() => { setShowLevel3(false); setLevel3('') }}
                    aria-label="Remove level 3"
                  >
                    ×
                  </button>
                </div>
              ) : null}
            </div>

            {/* Save button */}
            <button
              type="submit"
              className="w-full bg-stride-600 hover:bg-stride-700 text-white font-medium py-3 rounded-xl transition-colors"
            >
              {isEditMode ? 'Save Changes' : 'Create Habit'}
            </button>

            {/* Delete button — edit mode only */}
            {isEditMode && onDelete && (
              <button
                type="button"
                className="w-full mt-3 text-red-600 hover:text-red-700 font-medium py-2 text-sm transition-colors"
                onClick={handleDeleteClick}
                data-testid="delete-habit-button"
              >
                Delete Habit
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  )
}
