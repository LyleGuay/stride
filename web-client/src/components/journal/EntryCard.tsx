// EntryCard — a single journal entry card in the daily timeline.
// Shows an emotion-colored left accent bar, body text rendered as markdown,
// tag chips grouped by entry-type (prominent) and emotion (subtle), an optional
// linked habit badge, and a ··· context menu (Edit / Delete).
// On mobile the timestamp appears inside the card header; on desktop it is
// displayed in the timeline gutter by DailyTimeline.

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { JournalEntry, JournalTag } from '../../types'
import { EMOTION_TAGS, ENTRY_TYPE_TAGS } from '../../types'
import { emotionGradient, tagLabel, EMOTION_COLORS, EMOTION_EMOJIS, ENTRY_TYPE_EMOJIS } from './journalColors'

interface Props {
  entry: JournalEntry
  onEdit: (entry: JournalEntry) => void
  onDelete: (id: number) => void
}

export default function EntryCard({ entry, onEdit, onDelete }: Props) {
  const [showMenu, setShowMenu] = useState(false)

  const emotionTagList = entry.tags.filter(t => EMOTION_TAGS.has(t))
  const entryTypeTagList = entry.tags.filter(t => ENTRY_TYPE_TAGS.has(t))
  const accentBg = emotionGradient(entry.tags)

  const handleDelete = () => {
    setShowMenu(false)
    if (window.confirm('Delete this journal entry?')) {
      onDelete(entry.id)
    }
  }

  return (
    <div className="relative bg-white rounded-xl shadow-sm flex" data-testid="entry-card">
      {/* Colored left accent bar — rounded left corners only, matching the card border-radius */}
      <div className="w-1.5 flex-shrink-0 rounded-l-xl" style={{ background: accentBg }} />

      <div className="flex-1 px-4 py-3 min-w-0">
        {/* Card header row: mobile time + tag chips + ··· menu */}
        <div className="flex items-start gap-2 mb-2">
          {/* Time label — mobile only; desktop time lives in DailyTimeline gutter */}
          <span className="sm:hidden text-xs text-gray-400 whitespace-nowrap mt-0.5 flex-shrink-0">
            {entry.entry_time}
          </span>

          {/* Tag chips — entry-type first, then emotion */}
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {entryTypeTagList.map(tag => (
              <EntryTypeChip key={tag} tag={tag} />
            ))}
            {emotionTagList.map(tag => (
              <EmotionChip key={tag} tag={tag} />
            ))}
          </div>

          {/* ··· context menu trigger */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowMenu(m => !m)}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors text-base leading-none"
              aria-label="Entry options"
              data-testid="entry-menu-button"
            >
              ···
            </button>
            {showMenu && (
              <>
                {/* Click-away backdrop */}
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-28">
                  <button
                    onClick={() => { setShowMenu(false); onEdit(entry) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Linked habit badge — shown when the entry was logged against a habit */}
        {entry.habit_name && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
              🔗 {entry.habit_name}
            </span>
          </div>
        )}

        {/* Body rendered as markdown */}
        <div className="text-sm text-gray-700 leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-semibold [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500">
          <ReactMarkdown>{entry.body}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

/* ─── Tag chip sub-components ────────────────────────────────────────────── */

// EntryTypeChip — slightly prominent chip for structural entry types (Thoughts, Idea, etc.)
function EntryTypeChip({ tag }: { tag: JournalTag }) {
  const emoji = ENTRY_TYPE_EMOJIS[tag]
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
      {emoji && <span>{emoji}</span>}
      {tagLabel(tag)}
    </span>
  )
}

// EmotionChip — chip colored to match the emotion's accent color
function EmotionChip({ tag }: { tag: JournalTag }) {
  const color = EMOTION_COLORS[tag]
  const emoji = EMOTION_EMOJIS[tag]
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full border"
      style={color ? { borderColor: color, color, backgroundColor: `${color}25` } : undefined}
    >
      {emoji && <span>{emoji}</span>}
      {tagLabel(tag)}
    </span>
  )
}
