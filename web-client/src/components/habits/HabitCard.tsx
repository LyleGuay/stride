// HabitCard — expandable row for a single habit in the Today view.
// Collapsed: level circle (tap to advance, long-press to reset) + name + badge + status.
// Expanded: level list with current/next indicators + streak/consistency stats.

import { useState, useRef, useCallback } from 'react'
import type { HabitWithLog } from '../../types'

export interface HabitCardProps {
  habit: HabitWithLog
  date: string
  onLogLevel: (level: 0 | 1 | 2 | 3) => void
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
  onViewDetail: () => void
  /** Ref callback for the level circle element — used by HabitsPage to anchor particle bursts. */
  circleRef?: (el: HTMLButtonElement | null) => void
  /** Called when the user taps "Add a note →" after logging a level. */
  onAddJournalNote?: (habitId: number) => void
}

// Level accent colors — indigo/emerald/amber matching design/features/habits mockups.
const LEVEL_COLORS: Record<1 | 2 | 3, string> = {
  1: '#4f46e5',
  2: '#10b981',
  3: '#f59e0b',
}

// Returns the label text for a given level number.
function getLabelForLevel(level: 1 | 2 | 3, habit: HabitWithLog): string {
  if (level === 1) return habit.level1_label
  if (level === 2) return habit.level2_label ?? ''
  return habit.level3_label ?? ''
}

// Returns the next level to advance to, cycling back to 0 after the max level.
function getNextLevel(current: 0 | 1 | 2 | 3, habit: HabitWithLog): 0 | 1 | 2 | 3 {
  if (current === 0) return 1
  if (current === 1 && habit.level2_label) return 2
  if (current === 2 && habit.level3_label) return 3
  return 0
}

export default function HabitCard({
  habit, onLogLevel, onEdit, onArchive, onDelete, onViewDetail, circleRef, onAddJournalNote,
}: HabitCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  // Long-press detection: 500ms hold resets to level 0.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

  const currentLevel = (habit.log?.level ?? 0) as 0 | 1 | 2 | 3
  const maxLevels = habit.level3_label ? 3 : habit.level2_label ? 2 : 1
  const nextLevel = getNextLevel(currentLevel, habit)

  const handlePressStart = useCallback(() => {
    didLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      if (currentLevel > 0 && window.confirm('Reset this habit to "not done" for today?')) {
        onLogLevel(0)
      }
    }, 500)
  }, [currentLevel, onLogLevel])

  const handlePressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleCircleClick = useCallback(() => {
    // Long press already handled the action; skip click.
    if (didLongPress.current) { didLongPress.current = false; return }
    onLogLevel(getNextLevel(currentLevel, habit))
  }, [currentLevel, habit, onLogLevel])

  // Circle styling — L3 gets a gold glow ring.
  const circleStyle = currentLevel > 0 ? {
    backgroundColor: LEVEL_COLORS[currentLevel as 1 | 2 | 3],
    boxShadow: currentLevel === 3 ? `0 0 0 3px ${LEVEL_COLORS[3]}40` : undefined,
  } : {}

  // Levels available on this habit (always at least L1).
  const availableLevels = ([1, 2, 3] as const).filter(
    l => l === 1 || (l === 2 && habit.level2_label) || (l === 3 && habit.level3_label),
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-visible" data-testid="habit-card">
      {/* ── Collapsed row ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Level circle — tap advances, long-press resets */}
        <button
          ref={circleRef}
          className={`w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm transition-transform active:scale-95 select-none ${
            currentLevel === 0 ? 'bg-gray-100 border-2 border-gray-300' : ''
          }`}
          style={circleStyle}
          onClick={handleCircleClick}
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressEnd}
          onTouchStart={handlePressStart}
          onTouchEnd={handlePressEnd}
          aria-label={`Level ${currentLevel}. Tap to advance.`}
          data-testid="habit-circle"
        >
          {currentLevel > 0 && (
            <span>{currentLevel === 3 && maxLevels === 3 ? '✦' : `L${currentLevel}`}</span>
          )}
        </button>

        {/* Name, badge, status, next-level hint */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {habit.emoji && <span className="text-base leading-none">{habit.emoji}</span>}
            <span className="font-medium text-gray-900 text-sm">{habit.name}</span>
            {currentLevel > 0 && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0"
                style={{ backgroundColor: LEVEL_COLORS[currentLevel as 1 | 2 | 3] }}
              >
                {currentLevel === 3 && maxLevels === 3 ? 'L3 ✦' : `L${currentLevel}`}
              </span>
            )}
          </div>
          {/* Current level label or "not yet" */}
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">
            {currentLevel > 0
              ? getLabelForLevel(currentLevel as 1 | 2 | 3, habit)
              : <span className="text-gray-400">Not logged yet</span>
            }
          </p>
          {/* Next-level hint — only show if there's a higher level available */}
          {nextLevel > 0 && nextLevel <= maxLevels && (
            <p className="text-xs text-gray-400 mt-0.5">
              → L{nextLevel}: {getLabelForLevel(nextLevel as 1 | 2 | 3, habit)}
            </p>
          )}
        </div>

        {/* ··· overflow menu */}
        <div className="relative shrink-0">
          <button
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            onClick={() => setShowMenu(s => !s)}
            aria-label="More options"
            data-testid="habit-menu-button"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <circle cx="4" cy="10" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="16" cy="10" r="1.5" />
            </svg>
          </button>
          {showMenu && (
            <>
              {/* Click-away backdrop */}
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-9 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[150px]">
                <button
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { setShowMenu(false); onViewDetail() }}
                >
                  View History
                </button>
                {onAddJournalNote && (
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => { setShowMenu(false); onAddJournalNote(habit.id) }}
                  >
                    Journal
                  </button>
                )}
                <button
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { setShowMenu(false); onEdit() }}
                >
                  Edit
                </button>
                <button
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { setShowMenu(false); onArchive() }}
                >
                  Archive
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => { setShowMenu(false); onDelete() }}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>

        {/* Expand/collapse chevron */}
        <button
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
          onClick={() => setExpanded(s => !s)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          data-testid="habit-chevron"
        >
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* ── Expanded section ────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          {/* Level list */}
          <div className="space-y-1.5 mb-3">
            {availableLevels.map(lv => {
              const isCurrent = currentLevel === lv
              const isNext = nextLevel === lv
              return (
                <div key={lv} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: LEVEL_COLORS[lv] }} />
                  <span className="text-xs font-semibold text-gray-400 shrink-0 w-5">L{lv}</span>
                  <span className="text-sm text-gray-700 flex-1">{getLabelForLevel(lv, habit)}</span>
                  {isCurrent && <span className="text-xs text-gray-400 font-medium">current</span>}
                  {!isCurrent && isNext && currentLevel > 0 && <span className="text-xs text-gray-400">← next</span>}
                </div>
              )
            })}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
            <span>{habit.consistency_30d}% consistency</span>
            <span>🔥 {habit.current_streak} streak</span>
            <span>Avg {habit.avg_level_30d.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
