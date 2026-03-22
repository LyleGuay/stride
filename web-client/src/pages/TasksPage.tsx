// TasksPage — main task manager page with Today, Upcoming, and All tabs.
// Each view component owns its own useTasks fetch — the page just handles
// tab state, the FAB, and the Add/Edit sheet (Phase I).

import { useState } from 'react'
import { useSidebar } from '../components/SidebarContext'
import { todayString } from '../utils/dates'
import type { Task } from '../types'
import MobileModuleHeader, { type TabDef } from '../components/MobileModuleHeader'
import TodayView from '../components/tasks/TodayView'
import UpcomingView from '../components/tasks/UpcomingView'
import AllView from '../components/tasks/AllView'
import TaskSheet from '../components/tasks/TaskSheet'

type Tab = 'today' | 'upcoming' | 'all'

/* ─── Tab definitions ─────────────────────────────────────────────────── */

const TABS: TabDef[] = [
  {
    value: 'today',
    label: 'Today',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    value: 'upcoming',
    label: 'Upcoming',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    value: 'all',
    label: 'All',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
]

/* ─── TasksPage ───────────────────────────────────────────────────────── */

export default function TasksPage() {
  const [tab, setTab] = useState<Tab>('today')
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [initialFocusDueDate, setInitialFocusDueDate] = useState(false)

  const today = todayString()
  const { setOpen: setSidebarOpen } = useSidebar()

  const handleEdit = (task: Task) => {
    setEditTask(task)
    setInitialFocusDueDate(false)
    setSheetOpen(true)
  }

  // Schedule button (backlog) — opens edit sheet focused on the date field.
  const handleSchedule = (task: Task) => {
    setEditTask(task)
    setInitialFocusDueDate(true)
    setSheetOpen(true)
  }

  const handleAdd = () => {
    setEditTask(null)
    setInitialFocusDueDate(false)
    setSheetOpen(true)
  }

  const handleClose = () => {
    setSheetOpen(false)
    setEditTask(null)
  }

  /* ─── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="pb-24">
      {/* ── Sticky header ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white">

        {/* Mobile header — module name + tab dropdown */}
        <div className="lg:hidden">
          <MobileModuleHeader
            moduleName="Tasks"
            tabs={TABS}
            activeTab={tab}
            onTabChange={t => setTab(t as Tab)}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
        </div>

        {/* Desktop tab row — underline style */}
        <div className="hidden lg:flex items-end px-6 border-b border-gray-200" style={{ height: 56 }}>
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value as Tab)}
              className={`px-4 h-full flex items-center gap-1.5 text-sm -mb-px transition-colors border-b-[3px] ${
                tab === t.value
                  ? 'font-semibold text-gray-900 border-gray-900'
                  : 'font-medium text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Views — each owns its own data fetch ────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        {tab === 'today'    && <TodayView    today={today} onEdit={handleEdit} />}
        {tab === 'upcoming' && <UpcomingView today={today} onEdit={handleEdit} />}
        {tab === 'all'      && <AllView      today={today} onEdit={handleEdit} onSchedule={handleSchedule} />}
      </div>

      {/* FAB — opens Add Task sheet */}
      <button
        onClick={handleAdd}
        className="fixed bottom-6 right-6 w-14 h-14 bg-stride-600 hover:bg-stride-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors z-30"
        aria-label="Add task"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <TaskSheet
        task={editTask}
        open={sheetOpen}
        onClose={handleClose}
        onSave={() => handleClose()}
        today={today}
        initialFocusDueDate={initialFocusDueDate}
      />
    </div>
  )
}
