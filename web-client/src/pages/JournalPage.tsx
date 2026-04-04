// JournalPage — daily journal timeline with date navigation, plus a Summary tab.
// Sticky header mirrors the h-14 sidebar logo height for consistent chrome.
// FAB (+) opens AddEntrySheet to create a new entry.
// Entries are loaded via useJournalEntries; reload() is called after create/
// update/delete to refresh the list.
// useJournalCalendar is owned here so its cache can be shared between the date
// header (which renders dots) and the mutations (which invalidate the cache).

import { useState } from 'react'
import { useSidebar } from '../components/SidebarContext'
import { todayString } from '../utils/dates'
import { useJournalEntries } from '../hooks/useJournalEntries'
import { useJournalCalendar } from '../hooks/useJournalCalendar'
import { deleteJournalEntry } from '../api'
import type { JournalEntry } from '../types'
import JournalDateHeader from '../components/journal/JournalDateHeader'
import DailyTimeline from '../components/journal/DailyTimeline'
import AddEntrySheet from '../components/journal/AddEntrySheet'
import SummaryTab from '../components/journal/SummaryTab'
import MobileModuleHeader, { type TabDef } from '../components/MobileModuleHeader'

type Tab = 'daily' | 'summary'


export default function JournalPage() {
  const { setOpen: setSidebarOpen } = useSidebar()
  const [tab, setTab] = useState<Tab>('daily')
  const [date, setDate] = useState(todayString)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null)

  const { entries, loading, error, reload } = useJournalEntries(date)

  // Calendar cache shared between JournalDateHeader (dots) and mutation handlers
  // (cache invalidation). Owned at the page level so it persists across navigations.
  const { loadMonth, getMonthData, isLoading: isLoadingMonth, invalidate } = useJournalCalendar()

  // Invalidates the current month's calendar cache after a mutation so the dot
  // for the active date is updated when the user next opens the picker.
  const invalidateCurrentMonth = () => invalidate(date.slice(0, 7))

  const handleEdit = (entry: JournalEntry) => {
    setEditEntry(entry)
    setSheetOpen(true)
  }

  const handleDelete = async (id: number) => {
    await deleteJournalEntry(id)
    reload()
    invalidateCurrentMonth()
  }

  const openCreate = () => {
    setEditEntry(null)
    setSheetOpen(true)
  }

  const handleSheetClose = () => {
    setSheetOpen(false)
    setEditEntry(null)
  }

  const handleSaved = () => {
    reload()
    invalidateCurrentMonth()
  }

  return (
    <div className="pb-24">
      {/* ── Sticky header ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white">

        {/* Mobile header — module name + tab dropdown (hidden on desktop) */}
        {(() => {
          const journalTabs: TabDef[] = [
            { value: 'daily',   label: 'Daily',   icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg> },
            { value: 'summary', label: 'Summary', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg> },
          ]
          return (
            <div className="lg:hidden">
              <MobileModuleHeader
                moduleName="Journal"
                tabs={journalTabs}
                activeTab={tab}
                onTabChange={t => setTab(t as Tab)}
                onOpenSidebar={() => setSidebarOpen(true)}
              />
            </div>
          )
        })()}

        {/* Desktop tab row — underline style, hidden on mobile */}
        <div className="hidden lg:flex items-end px-4 sm:px-6 border-b border-gray-200" style={{ height: 56 }}>
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
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
            <JournalDateHeader
              date={date}
              onDateChange={setDate}
              loadMonth={loadMonth}
              getMonthData={getMonthData}
              isLoadingMonth={isLoadingMonth}
            />
          </div>
        )}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      {tab === 'summary' ? (
        <SummaryTab onNavigateToDay={(d) => { setTab('daily'); setDate(d) }} />
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
        onSaved={handleSaved}
        date={date}
        editEntry={editEntry}
      />
    </div>
  )
}
