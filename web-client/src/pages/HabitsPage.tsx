// HabitsPage — Today and Progress tabs for the habit tracker.
// Today tab: date navigator (desktop week strip + mobile day arrows), habit list
// grouped by daily/weekly, FAB → AddHabitSheet.
// Progress tab: ProgressTab component.

import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useSidebar } from '../components/SidebarContext'
import { useHabits } from '../hooks/useHabits'
import { todayString, getMondayOf, shiftWeek, formatWeekRange } from '../utils/dates'
import { createHabit, updateHabit, archiveHabit, deleteHabit } from '../api'
import AddEntrySheet from '../components/journal/AddEntrySheet'
import type { Habit, HabitWithLog, CreateHabitInput } from '../types'
import HabitCard from '../components/habits/HabitCard'
import AddHabitSheet from '../components/habits/AddHabitSheet'
import ProgressTab from '../components/habits/ProgressTab'
import { spawnBurst, spawnCelebration, spawnWeeklyCelebration, playCheckSound, playCelebrationSound, playWeeklyCelebrationSound } from '../utils/habitEffects'
import { computeDailyLevel, computeWeeklyLevel } from '../utils/habitLevel'
import MobileModuleHeader, { type TabDef } from '../components/MobileModuleHeader'

/* ─── Date helpers ──────────────────────────────────────────────────────── */

// Shifts a YYYY-MM-DD string by `days` (positive = forward, negative = back).
function shiftDay(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Returns true if the date is strictly after today in local time.
function isFuture(dateStr: string): boolean {
  return dateStr > todayString()
}

// Formats "Sat, Mar 7" from a YYYY-MM-DD string (local time).
function formatDayDisplay(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

// Single-letter weekday labels for day pills (Mon=M, Tue=T, … Sun=S).
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// Dot colors per level, matching level accent colors throughout the app.
const DOT_COLORS = ['#e5e7eb', '#4f46e5', '#10b981', '#f59e0b']

/* ─── HabitsPage ────────────────────────────────────────────────────────── */

export default function HabitsPage() {
  const [tab, setTab] = useState<'today' | 'progress'>('today')
  const [selectedDate, setSelectedDate] = useState(todayString())
  // weekStart is the Monday containing selectedDate; drives the desktop week strip.
  const [weekStart, setWeekStart] = useState(() => getMondayOf(todayString()))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editHabit, setEditHabit] = useState<Habit | null>(null)

  // Journal entry sheet — opened from "Add a note →" on a habit card.
  const [journalSheetOpen, setJournalSheetOpen] = useState(false)
  const [linkedHabitId, setLinkedHabitId] = useState<number | null>(null)
  const [linkedHabitName, setLinkedHabitName] = useState<string | null>(null)
  const [linkedHabitLevel, setLinkedHabitLevel] = useState<number | null>(null)

  const navigate = useNavigate()
  const { setOpen: setSidebarOpen } = useSidebar()
  const { habits, loading, error, logLevel, reload } = useHabits(selectedDate)

  // Maps habitId → circle DOM element for particle burst origin.
  const circleRefs = useRef(new Map<number, HTMLButtonElement | null>())
  // Ref to the currently selected day pill — used as celebration burst origin.
  const selectedDayPillRef = useRef<HTMLButtonElement | null>(null)
  // True only when the user has explicitly toggled a habit on the current day.
  // Prevents the celebration from firing on page load / date navigation.
  const userDidToggle = useRef(false)

  const today = todayString()
  const isToday = selectedDate === today
  const isCurrentWeek = weekStart === getMondayOf(today)

  // Opens the journal entry sheet pre-linked to the given habit.
  // Captures the habit's current log level so the entry can record its completion state.
  const handleAddJournalNote = useCallback((habitId: number) => {
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return
    setLinkedHabitId(habitId)
    setLinkedHabitName(habit.name)
    // log === null means not logged today → level 0 (failed/missed)
    setLinkedHabitLevel(habit.log?.level ?? 0)
    setJournalSheetOpen(true)
  }, [habits])

  // Toast state — auto-dismissed after 3 seconds.
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastMsg(msg)
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000)
  }, [])

  // Derived — separate daily and weekly habits.
  const dailyHabits = habits.filter(h => h.frequency === 'daily')
  const weeklyHabits = habits.filter(h => h.frequency === 'weekly')

  // 7-day date list for the desktop week strip (Mon–Sun).
  const weekDates = Array.from({ length: 7 }, (_, i) => shiftDay(weekStart, i))

  // Proportional level results for daily and weekly scopes.
  const dailyLevelResult = computeDailyLevel(dailyHabits)
  const weeklyLevelResult = computeWeeklyLevel(habits)

  // Dot color in the week strip is driven by the floored daily level (0–3).
  const maxLevelForSelected = Math.min(3, Math.floor(dailyLevelResult?.level ?? 0)) as 0 | 1 | 2 | 3

  // Tracks the last seen floored level for each scope so we only celebrate when
  // the level crosses a new whole-number threshold (not on every toggle).
  const prevDailyFloorRef = useRef(0)
  const prevWeeklyFloorRef = useRef(0)

  // Reset the toggle flag and previous-level refs whenever the user navigates to a different date.
  useEffect(() => {
    userDidToggle.current = false
    prevDailyFloorRef.current = 0
    prevWeeklyFloorRef.current = 0
  }, [selectedDate])

  /* ─── Celebration check ─────────────────────────────────────────────── */
  // Fires only when the floored level increases — i.e. when you cross a new
  // whole-number threshold that you weren't already at before this toggle.
  useEffect(() => {
    // Compute current floored levels regardless of toggle state, so the refs
    // stay accurate and don't fire stale celebrations after date navigation.
    const daily = habits.filter(h => h.frequency === 'daily')
    const dailyResult = computeDailyLevel(daily)
    const weeklyResult = computeWeeklyLevel(habits)

    const flooredDailyLevel = Math.floor(dailyResult?.level ?? 0)
    const flooredWeeklyLevel = Math.floor(weeklyResult?.level ?? 0)

    if (userDidToggle.current && habits.length > 0) {
      // Daily celebration — only if the floored level went up since the last toggle.
      if (flooredDailyLevel > prevDailyFloorRef.current) {
        const pill = selectedDayPillRef.current
        if (pill) {
          spawnCelebration(pill, Math.min(3, flooredDailyLevel) as 1 | 2 | 3)
          playCelebrationSound(Math.min(3, flooredDailyLevel) as 1 | 2 | 3)
        }
        const msg = `You reached Level ${flooredDailyLevel} for the day! 🎉`
        setTimeout(() => showToast(msg), 0)
      }

      // Weekly celebration — only if the floored weekly level went up since the last toggle.
      if (flooredWeeklyLevel > prevWeeklyFloorRef.current) {
        spawnWeeklyCelebration(selectedDayPillRef.current)
        playWeeklyCelebrationSound()
        const weekMsg = `You reached Level ${flooredWeeklyLevel} for the week! 🌟`
        setTimeout(() => showToast(weekMsg), 0)
      }
    }

    prevDailyFloorRef.current = flooredDailyLevel
    prevWeeklyFloorRef.current = flooredWeeklyLevel
  }, [habits, selectedDate, showToast])

  /* ─── Desktop week navigation ─────────────────────────────────────────── */

  const goToPrevWeek = () => {
    const prev = shiftWeek(weekStart, -1)
    setWeekStart(prev)
    // When going back, land on Sunday (last day of prev week), capped at today.
    const sunday = shiftDay(prev, 6)
    setSelectedDate(sunday > today ? today : sunday)
  }

  const goToNextWeek = () => {
    const next = shiftWeek(weekStart, 1)
    setWeekStart(next)
    // When advancing, land on Monday of next week, capped at today.
    setSelectedDate(next > today ? today : next)
  }

  const selectWeekDay = (dateStr: string) => {
    if (isFuture(dateStr)) return
    setSelectedDate(dateStr)
  }

  /* ─── Mobile day navigation ───────────────────────────────────────────── */

  const goToPrevDay = () => {
    const prev = shiftDay(selectedDate, -1)
    setSelectedDate(prev)
    setWeekStart(getMondayOf(prev))
  }

  const goToNextDay = () => {
    if (isToday) return
    const next = shiftDay(selectedDate, 1)
    setSelectedDate(next)
    setWeekStart(getMondayOf(next))
  }

  /* ─── Habit logging ───────────────────────────────────────────────────── */

  const handleLogLevel = useCallback(async (habit: HabitWithLog, level: 0 | 1 | 2 | 3) => {
    userDidToggle.current = true
    await logLevel(habit.id, level)
    if (level > 0) {
      const circleEl = circleRefs.current.get(habit.id)
      if (circleEl) {
        spawnBurst(circleEl, level as 1 | 2 | 3)
        playCheckSound(level as 1 | 2 | 3)
      }
    }
  }, [logLevel])

  /* ─── Habit CRUD ──────────────────────────────────────────────────────── */

  const handleSaveHabit = async (input: CreateHabitInput) => {
    try {
      if (editHabit) {
        await updateHabit(editHabit.id, input)
      } else {
        await createHabit(input)
      }
      setSheetOpen(false)
      setEditHabit(null)
      reload()
    } catch { /* TODO: toast */ }
  }

  const handleDeleteHabit = async () => {
    if (!editHabit) return
    try {
      await deleteHabit(editHabit.id)
      setSheetOpen(false)
      setEditHabit(null)
      reload()
    } catch { /* TODO: toast */ }
  }

  const handleArchive = async (habit: HabitWithLog) => {
    try {
      await archiveHabit(habit.id)
      reload()
    } catch { /* TODO: toast */ }
  }

  const handleDeleteFromCard = async (habit: HabitWithLog) => {
    if (window.confirm(`Delete "${habit.name}" and all its history?`)) {
      try {
        await deleteHabit(habit.id)
        reload()
      } catch { /* TODO: toast */ }
    }
  }

  const openEditSheet = (habit: HabitWithLog) => {
    setEditHabit(habit)
    setSheetOpen(true)
  }

  /* ─── Render ──────────────────────────────────────────────────────────── */

  // Next week's Monday — used to disable the forward week arrow when already on current week.
  const nextMonday = shiftWeek(weekStart, 1)
  const canGoNextWeek = nextMonday <= getMondayOf(today)

  return (
    <div className="pb-24">
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white">

        {/* Mobile header — module name + tab dropdown (hidden on desktop) */}
        {(() => {
          const habitTabs: TabDef[] = [
            { value: 'today',    label: 'Today',    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg> },
            { value: 'progress', label: 'Progress', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg> },
          ]
          return (
            <div className="lg:hidden">
              <MobileModuleHeader
                moduleName="Habits"
                tabs={habitTabs}
                activeTab={tab}
                onTabChange={t => setTab(t as typeof tab)}
                onOpenSidebar={() => setSidebarOpen(true)}
              />
            </div>
          )
        })()}

        {/* Desktop tab row — underline style, hidden on mobile */}
        <div className="hidden lg:flex items-end px-6 border-b border-gray-200" style={{ height: 56 }}>
          {/* Today tab */}
          <button
            onClick={() => setTab('today')}
            className={`px-4 h-full flex items-center gap-1.5 text-sm -mb-px transition-colors border-b-[3px] ${
              tab === 'today'
                ? 'font-semibold text-gray-900 border-gray-900'
                : 'font-medium text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            Today
          </button>

          {/* Progress tab */}
          <button
            onClick={() => setTab('progress')}
            className={`px-4 h-full flex items-center gap-1.5 text-sm -mb-px transition-colors border-b-[3px] ${
              tab === 'progress'
                ? 'font-semibold text-gray-900 border-gray-900'
                : 'font-medium text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            Progress
          </button>
        </div>

        {/* ── Desktop week strip — lg+ only, Today tab only ─────────────── */}
        {tab === 'today' && (
          <div className="hidden lg:flex items-center justify-center py-2.5 border-b border-gray-100">
            {/* Everything — arrows + label + pills — lives inside one rounded-full pill */}
            <div className="flex items-center bg-gray-100 rounded-full px-1 py-1">
              {/* Prev week arrow */}
              <button
                onClick={goToPrevWeek}
                className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center"
                aria-label="Previous week"
                data-testid="prev-week"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>

              {/* Week range label + "now" badge + day pills */}
              <div className="flex items-center gap-1 px-2">
                {/* Week label */}
                <div className="text-xs font-semibold text-gray-500 mr-3 whitespace-nowrap flex items-center gap-1.5">
                  {formatWeekRange(weekStart)}
                  {isCurrentWeek && (
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full leading-none">
                      now
                    </span>
                  )}
                </div>

                {/* Day pills */}
                {weekDates.map((date, i) => {
                  const isSelected = date === selectedDate
                  const isFut = isFuture(date)
                  const isTod = date === today
                  // Dot color: only show actual level color for the selected date.
                  const dotLevel = isSelected ? maxLevelForSelected : 0
                  return (
                    <button
                      key={date}
                      ref={isSelected ? (el) => { selectedDayPillRef.current = el } : null}
                      onClick={() => selectWeekDay(date)}
                      disabled={isFut}
                      className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-full transition-all ${
                        isSelected
                          ? 'bg-white shadow-sm outline outline-2 outline-stride-500'
                          : isFut
                            ? 'opacity-35 cursor-not-allowed'
                            : 'hover:bg-white/70 cursor-pointer'
                      }`}
                      data-testid={`week-day-${date}`}
                    >
                      <span className={`text-[10px] font-semibold pointer-events-none ${
                        isSelected ? 'text-stride-600' : isTod ? 'text-gray-600' : 'text-gray-400'
                      }`}>
                        {DAY_LETTERS[i]}
                      </span>
                      {/* 8px colored dot — color = level logged that day (gray = none) */}
                      <div
                        className="pointer-events-none"
                        style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          ...(isFut
                            ? { background: 'transparent', border: '1.5px dashed #d1d5db' }
                            : { background: DOT_COLORS[dotLevel] }),
                        }}
                      />
                    </button>
                  )
                })}
              </div>

              {/* Next week arrow */}
              <button
                onClick={goToNextWeek}
                disabled={!canGoNextWeek}
                className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors flex items-center disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next week"
                data-testid="next-week"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Mobile day navigator — visible on small screens, Today tab only ── */}
        {tab === 'today' && (
          <div className="flex lg:hidden items-center justify-between px-6 py-2 border-b border-gray-100">
            <button
              onClick={goToPrevDay}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              aria-label="Previous day"
              data-testid="prev-day"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-gray-700" data-testid="mobile-date-display">
              {formatDayDisplay(selectedDate)}
            </span>
            <button
              onClick={goToNextDay}
              disabled={isToday}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next day"
              data-testid="next-day"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── Today tab content ──────────────────────────────────────────── */}
      {tab === 'today' && (
        <div className="px-4 pt-4 max-w-2xl mx-auto">
          {/* Past-day amber banner */}
          {!isToday && (
            <div
              className="mb-4 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700 font-medium"
              data-testid="past-day-banner"
            >
              {formatDayDisplay(selectedDate)} · editing past log
            </div>
          )}

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          {loading && (
            <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
          )}

          {/* Empty state */}
          {!loading && habits.length === 0 && (
            <div className="text-center py-16" data-testid="empty-state">
              <div className="text-5xl mb-3">✓</div>
              <p className="text-gray-500 text-sm font-medium">No habits yet</p>
              <p className="text-gray-400 text-xs mt-1">Tap + to add your first habit.</p>
            </div>
          )}

          {/* Daily habits section */}
          {!loading && dailyHabits.length > 0 && (
            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-2 px-1">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Daily</h3>
                {dailyLevelResult != null && (
                  <span className="text-xs font-medium" style={{ color: DOT_COLORS[Math.min(3, Math.floor(dailyLevelResult.level))] }}>
                    · {dailyLevelResult.level.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {dailyHabits.map(habit => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    date={selectedDate}
                    onLogLevel={level => handleLogLevel(habit, level)}
                    onEdit={() => openEditSheet(habit)}
                    onArchive={() => handleArchive(habit)}
                    onDelete={() => handleDeleteFromCard(habit)}
                    onViewDetail={() => navigate(`/habits/${habit.id}`)}
                    circleRef={(el) => circleRefs.current.set(habit.id, el)}
                    onAddJournalNote={handleAddJournalNote}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Weekly habits section */}
          {!loading && weeklyHabits.length > 0 && (
            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-2 px-1">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Weekly</h3>
                {weeklyLevelResult != null && (
                  <span className="text-xs font-medium" style={{ color: DOT_COLORS[Math.min(3, Math.floor(weeklyLevelResult.level))] }}>
                    · {weeklyLevelResult.level.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {weeklyHabits.map(habit => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    date={selectedDate}
                    onLogLevel={level => handleLogLevel(habit, level)}
                    onEdit={() => openEditSheet(habit)}
                    onArchive={() => handleArchive(habit)}
                    onDelete={() => handleDeleteFromCard(habit)}
                    onViewDetail={() => navigate(`/habits/${habit.id}`)}
                    circleRef={(el) => circleRefs.current.set(habit.id, el)}
                    onAddJournalNote={handleAddJournalNote}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Progress tab ───────────────────────────────────────────────── */}
      {tab === 'progress' && (
        <ProgressTab onViewDetail={(id) => navigate(`/habits/${id}`)} />
      )}

      {/* FAB — fixed, opens AddHabitSheet in create mode (Today tab only) */}
      {tab === 'today' && (
        <button
          onClick={() => { setEditHabit(null); setSheetOpen(true) }}
          className="fixed bottom-6 right-6 w-14 h-14 bg-stride-600 hover:bg-stride-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-colors z-30"
          aria-label="Add habit"
          data-testid="add-habit-fab"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      )}

      {/* Create / edit habit sheet */}
      <AddHabitSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditHabit(null) }}
        onSave={handleSaveHabit}
        editHabit={editHabit}
        onDelete={editHabit ? handleDeleteHabit : undefined}
      />

      {/* Journal entry sheet — opened from "Add a note →" on a habit card */}
      <AddEntrySheet
        open={journalSheetOpen}
        onClose={() => { setJournalSheetOpen(false); setLinkedHabitId(null); setLinkedHabitName(null); setLinkedHabitLevel(null) }}
        onSaved={() => {}}
        date={selectedDate}
        habitId={linkedHabitId}
        habitName={linkedHabitName}
        habitLevel={linkedHabitLevel}
      />

      {/* Toast — fixed bottom-center pill, auto-dismisses after 3s */}
      <div
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 ${
          toastMsg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        {toastMsg && (
          <div className="bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap">
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  )
}
