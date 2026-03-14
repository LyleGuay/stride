// AddEntrySheet — bottom sheet (mobile) / centered modal (desktop) for creating
// or editing a journal entry. Body supports markdown with a live preview toggle.
// Tags are chosen via toggle chips, grouped into entry-type and mood sections.
// Saves via API directly; calls onSaved() after a successful write so the parent
// can reload the entry list.

import { useState, useEffect, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import type { JournalEntry, JournalTag, CreateJournalEntryInput, UpdateJournalEntryInput } from '../../types'
import { tagLabel, EMOTION_COLORS, EMOTION_EMOJIS, ENTRY_TYPE_EMOJIS } from './journalColors'
import { createJournalEntry, updateJournalEntry } from '../../api'

// Ordered lists for consistent chip display order in the UI
const EMOTION_TAG_LIST: JournalTag[] = [
  'excited', 'happy', 'motivated', 'energized', 'calm', 'content', 'grateful',
  'neutral', 'bored', 'unmotivated', 'anxious', 'overwhelmed', 'low', 'sad',
  'angry', 'frustrated', 'depressed',
]
const ENTRY_TYPE_TAG_LIST: JournalTag[] = [
  'thoughts', 'idea', 'venting', 'open_loop', 'reminder', 'life_update', 'feelings',
]


interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  date: string                    // YYYY-MM-DD — the day being logged
  editEntry?: JournalEntry | null
}

export default function AddEntrySheet({ open, onClose, onSaved, date, editEntry }: Props) {
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<JournalTag[]>([])
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditMode = !!editEntry

  // Reset or pre-fill form when the sheet opens or the edit target changes.
  // Synchronous setState calls here are safe — none of body/tags/preview/error
  // are in the dependency array, so there is no risk of cascading re-renders.
  useEffect(() => {
    if (!open) return
    setPreview(false)
    setError(null)
    if (editEntry) {
      setBody(editEntry.body)
      setTags(editEntry.tags)
    } else {
      setBody('')
      setTags([])
    }
  }, [open, editEntry])

  // Toggle a tag on/off in the selection
  const toggleTag = (tag: JournalTag) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    setError(null)
    try {
      if (isEditMode) {
        const input: UpdateJournalEntryInput = { body: body.trim(), tags }
        await updateJournalEntry(editEntry.id, input)
      } else {
        const input: CreateJournalEntryInput = { entry_date: date, body: body.trim(), tags }
        await createJournalEntry(input)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop — also acts as flex centering container on desktop */}
      <div
        className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300
          sm:flex sm:items-center sm:justify-center sm:p-4
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      >
        {/* Mobile: bottom sheet (slide up). Desktop: centered modal (scale in). */}
        <div
          className={`bg-white shadow-2xl overflow-hidden transition-all duration-300
            fixed bottom-0 left-0 right-0 rounded-t-2xl
            ${open ? 'translate-y-0' : 'translate-y-full'}
            sm:static sm:rounded-xl sm:w-full sm:max-w-lg sm:translate-y-0
            ${open ? 'sm:scale-100 sm:opacity-100' : 'sm:scale-95 sm:opacity-0'}`}
          style={{ maxHeight: '90vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <form
            onSubmit={handleSubmit}
            className="px-5 pt-4 pb-6 sm:pt-5 overflow-y-auto"
            style={{ maxHeight: 'calc(90vh - 2rem)' }}
          >
            {/* Header: title + close button */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {isEditMode ? 'Edit Entry' : 'New Entry'}
              </h2>
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

            {/* Body textarea with markdown preview toggle */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">Entry</label>
                <button
                  type="button"
                  onClick={() => setPreview(p => !p)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  {preview ? 'Edit' : 'Preview'}
                </button>
              </div>
              {preview ? (
                // Markdown preview — mirrors textarea height
                <div className="min-h-36 border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 text-sm text-gray-700 leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500">
                  {body.trim()
                    ? <ReactMarkdown>{body}</ReactMarkdown>
                    : <span className="text-gray-400 italic">Nothing to preview.</span>
                  }
                </div>
              ) : (
                <textarea
                  placeholder="What's on your mind? Markdown is supported."
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={6}
                  autoFocus={open && !isEditMode}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              )}
            </div>

            {/* Entry-type tag chips */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {ENTRY_TYPE_TAG_LIST.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                      tags.includes(tag)
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {ENTRY_TYPE_EMOJIS[tag] && <span>{ENTRY_TYPE_EMOJIS[tag]}</span>}
                    {tagLabel(tag)}
                  </button>
                ))}
              </div>
            </div>

            {/* Emotion/mood tag chips — selected chip uses the tag's accent color */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Mood</label>
              <div className="flex flex-wrap gap-1.5">
                {EMOTION_TAG_LIST.map(tag => {
                  const selected = tags.includes(tag)
                  const color = EMOTION_COLORS[tag]
                  const emoji = EMOTION_EMOJIS[tag]
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        selected ? 'text-white border-transparent' : 'border-gray-200 text-gray-600'
                      }`}
                      style={selected && color
                        ? { backgroundColor: color, borderColor: color }
                        : color ? { backgroundColor: `${color}18` } : undefined}
                    >
                      {emoji && <span>{emoji}</span>}
                      {tagLabel(tag)}
                    </button>
                  )
                })}
              </div>
            </div>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <button
              type="submit"
              disabled={!body.trim() || saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
            >
              {saving ? 'Saving…' : isEditMode ? 'Save Changes' : 'Save Entry'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
