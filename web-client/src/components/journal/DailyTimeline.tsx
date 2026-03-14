// DailyTimeline — renders the ordered list of journal entries for a single day.
// Desktop (sm+): each entry has a time gutter on the left with a thin vertical
// rule connecting adjacent cards.
// Mobile: the gutter is hidden; EntryCard shows the time inline in its header.

import type { JournalEntry } from '../../types'
import EntryCard from './EntryCard'

interface Props {
  entries: JournalEntry[]
  onEdit: (entry: JournalEntry) => void
  onDelete: (id: number) => void
}

export default function DailyTimeline({ entries, onEdit, onDelete }: Props) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <div className="text-4xl mb-3">📓</div>
        <p className="text-sm font-medium">No entries for this day.</p>
        <p className="text-xs mt-1 text-gray-400">Tap + to add your first entry.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map(entry => (
        // Desktop: flex row — time gutter | vertical rule | card
        // Mobile: card only (time shown inside EntryCard header)
        <div key={entry.id} className="sm:flex sm:items-stretch sm:gap-0">
          {/* Time gutter — desktop only */}
          <div className="hidden sm:block w-14 flex-shrink-0 text-right pr-1 pt-3.5 text-xs text-gray-400 font-mono">
            {entry.entry_time}
          </div>
          {/* Thin vertical rule connecting gutter to card — desktop only */}
          <div className="hidden sm:block w-px bg-gray-200 mx-3 mt-2 mb-0" />
          {/* Card — takes remaining width */}
          <div className="flex-1 min-w-0">
            <EntryCard entry={entry} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </div>
      ))}
    </div>
  )
}
