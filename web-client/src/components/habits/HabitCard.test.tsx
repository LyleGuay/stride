import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import HabitCard from './HabitCard'
import type { HabitWithLog } from '../../types'

/* ─── Fixtures ───────────────────────────────────────────────────────── */

function makeHabit(overrides: Partial<HabitWithLog> = {}): HabitWithLog {
  return {
    id: 1,
    user_id: 1,
    name: 'Exercise',
    emoji: null,
    color: null,
    frequency: 'daily',
    weekly_target: null,
    level1_label: 'Exercise at all',
    level2_label: 'Exercise 30 min',
    level3_label: 'Exercise 1 hour',
    sort_order: 0,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    log: null,
    current_streak: 5,
    longest_streak: 10,
    consistency_30d: 80,
    avg_level_30d: 2.1,
    ...overrides,
  }
}

const noop = vi.fn()

function renderCard(habit: HabitWithLog, onLogLevel = noop) {
  return render(
    <HabitCard
      habit={habit}
      date="2026-03-07"
      onLogLevel={onLogLevel}
      onEdit={noop}
      onArchive={noop}
      onDelete={noop}
      onViewDetail={noop}
    />,
  )
}

/* ─── Tests ──────────────────────────────────────────────────────────── */

describe('HabitCard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

  it('renders the habit name', () => {
    renderCard(makeHabit())
    expect(screen.getByText('Exercise')).toBeInTheDocument()
  })

  it('renders level badge when habit is logged', () => {
    const habit = makeHabit({ log: { id: 1, user_id: 1, habit_id: 1, date: '2026-03-07', level: 2 } })
    renderCard(habit)
    // The badge shows "L2" (there are two — one in circle, one pill badge)
    expect(screen.getAllByText('L2').length).toBeGreaterThanOrEqual(1)
  })

  it('shows "Not logged yet" when no log', () => {
    renderCard(makeHabit({ log: null }))
    expect(screen.getByText('Not logged yet')).toBeInTheDocument()
  })

  it('clicking circle advances from level 0 to 1', () => {
    const onLogLevel = vi.fn()
    renderCard(makeHabit({ log: null }), onLogLevel)
    fireEvent.click(screen.getByTestId('habit-circle'))
    expect(onLogLevel).toHaveBeenCalledWith(1)
  })

  it('clicking circle advances from level 1 to 2', () => {
    const onLogLevel = vi.fn()
    const habit = makeHabit({ log: { id: 1, user_id: 1, habit_id: 1, date: '2026-03-07', level: 1 } })
    renderCard(habit, onLogLevel)
    fireEvent.click(screen.getByTestId('habit-circle'))
    expect(onLogLevel).toHaveBeenCalledWith(2)
  })

  it('clicking circle at max level (3) wraps back to 0', () => {
    const onLogLevel = vi.fn()
    const habit = makeHabit({ log: { id: 1, user_id: 1, habit_id: 1, date: '2026-03-07', level: 3 } })
    renderCard(habit, onLogLevel)
    fireEvent.click(screen.getByTestId('habit-circle'))
    expect(onLogLevel).toHaveBeenCalledWith(0)
  })

  it('clicking circle at max level wraps to 0 when only 1 level defined', () => {
    const onLogLevel = vi.fn()
    const habit = makeHabit({
      level2_label: null,
      level3_label: null,
      log: { id: 1, user_id: 1, habit_id: 1, date: '2026-03-07', level: 1 },
    })
    renderCard(habit, onLogLevel)
    fireEvent.click(screen.getByTestId('habit-circle'))
    expect(onLogLevel).toHaveBeenCalledWith(0)
  })

  it('long press (500ms) on a logged habit triggers confirm reset', () => {
    const onLogLevel = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const habit = makeHabit({ log: { id: 1, user_id: 1, habit_id: 1, date: '2026-03-07', level: 2 } })
    renderCard(habit, onLogLevel)

    fireEvent.mouseDown(screen.getByTestId('habit-circle'))
    act(() => { vi.advanceTimersByTime(500) })

    expect(window.confirm).toHaveBeenCalled()
    expect(onLogLevel).toHaveBeenCalledWith(0)
  })

  it('long press confirm cancelled does not call onLogLevel', () => {
    const onLogLevel = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const habit = makeHabit({ log: { id: 1, user_id: 1, habit_id: 1, date: '2026-03-07', level: 2 } })
    renderCard(habit, onLogLevel)

    fireEvent.mouseDown(screen.getByTestId('habit-circle'))
    act(() => { vi.advanceTimersByTime(500) })

    expect(window.confirm).toHaveBeenCalled()
    expect(onLogLevel).not.toHaveBeenCalled()
  })

  it('chevron click toggles expanded section', () => {
    renderCard(makeHabit())
    expect(screen.queryByText('consistency')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('habit-chevron'))
    expect(screen.getByText(/80% consistency/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('habit-chevron'))
    expect(screen.queryByText('consistency')).not.toBeInTheDocument()
  })
})
