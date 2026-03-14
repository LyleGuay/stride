// JournalPage — daily journal timeline with date navigation, plus a Summary tab.
// Sticky header mirrors the h-14 sidebar logo height for consistent chrome.
// FAB (+) opens AddEntrySheet to create a new entry.
// Entries are loaded via useJournalEntries; reload() is called after create/
// update/delete to refresh the list.

import { useState } from 'react'
import { useSidebar } from '../components/SidebarContext'
import { todayString } from '../utils/dates'
import { useJournalEntries } from '../hooks/useJournalEntries'
import { deleteJournalEntry } from '../api'
import type { JournalEntry } from '../types'
import DateHeader from '../components/calorie-log/DateHeader'
import DailyTimeline from '../components/journal/DailyTimeline'
import AddEntrySheet from '../components/journal/AddEntrySheet'
import SummaryTab from '../components/journal/SummaryTab'

type Tab = 'daily' | 'summary'


export default function JournalPage() {
  const { setOpen: setSidebarOpen } = useSidebar()
  const [tab, setTab] = useState<Tab>('daily')
  const [date, setDate] = useState(todayString)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null)

  const { entries, loading, error, reload } = useJournalEntries(date)

  const handleEdit = (entry: JournalEntry) => {
    setEditEntry(entry)
    setSheetOpen(true)
  }

  const handleDelete = async (id: number) => {
    await deleteJournalEntry(id)
    reload()
  }

  const openCreate = () => {
    setEditEntry(null)
    setSheetOpen(true)
  }

  const handleSheetClose = () => {
    setSheetOpen(false)
    setEditEntry(null)
  }

  return (
    <div className="pb-24">
      {/* ── Sticky header ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white">
        {/* Tab row — h-14 matches sidebar logo height for a continuous chrome line */}
        <div className="flex items-end px-4 sm:px-6 border-b border-gray-200" style={{ height: 56 }}>
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 -ml-1 mr-3 rounded-md hover:bg-gray-100 lg:hidden self-center"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Daily tab */}
          <button
            onClick={() => setTab('daily')}
            className={`px-4 h-full flex items-center gap-1.5 text-sm -mb-px transition-colors border-b-[3px] ${
              tab === 'daily'
                ? 'font-semibold text-gray-900 border-gray-900'
                : 'font-medium text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Daily
          </button>

          {/* Summary tab */}
          <button
            onClick={() => setTab('summary')}
            className={`px-4 h-full flex items-center gap-1.5 text-sm -mb-px transition-colors border-b-[3px] ${
              tab === 'summary'
                ? 'font-semibold text-gray-900 border-gray-900'
                : 'font-medium text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            Summary
          </button>
        </div>

        {/* Sub-header — date navigator on Daily tab; empty on Summary (range lives in SummaryTab) */}
        {tab === 'daily' && (
          <div className="border-b border-gray-200">
            <DateHeader date={date} onDateChange={setDate} />
          </div>
        )}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      {tab === 'summary' ? (
        <SummaryTab />
      ) : (
        <div className="px-4 sm:px-6 pt-4">
          {loading && (
            <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
          )}
          {error && (
            <div className="text-center py-16 text-red-500 text-sm">{error}</div>
          )}
          {!loading && !error && (
            <DailyTimeline
              entries={entries}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}

      {/* ── FAB — add new entry (daily tab only) ───────────────────────── */}
      {tab === 'daily' && (
        <button
          onClick={openCreate}
          className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-colors z-30"
          aria-label="Add journal entry"
          data-testid="add-entry-fab"
        >
          +
        </button>
      )}

      {/* ── Add / Edit sheet ────────────────────────────────────────────── */}
      <AddEntrySheet
        open={sheetOpen}
        onClose={handleSheetClose}
        onSaved={reload}
        date={date}
        editEntry={editEntry}
      />
    </div>
  )
}
