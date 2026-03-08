import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AddHabitSheet from './AddHabitSheet'
import type { Habit } from '../../types'

const noop = vi.fn()

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    user_id: 1,
    name: 'Exercise',
    emoji: '🏃',
    color: '#4f46e5',
    frequency: 'daily',
    weekly_target: null,
    level1_label: 'Exercise at all',
    level2_label: 'Exercise 30 min',
    level3_label: null,
    sort_order: 0,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderSheet(props: Parameters<typeof AddHabitSheet>[0] = { open: true, onClose: noop, onSave: noop }) {
  return render(<AddHabitSheet {...props} />)
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.resetAllMocks())

describe('AddHabitSheet', () => {
  it('shows validation error when submitted without a name', () => {
    renderSheet({ open: true, onClose: noop, onSave: noop })
    fireEvent.click(screen.getByRole('button', { name: 'Create Habit' }))
    expect(screen.getByText('Habit name is required')).toBeInTheDocument()
  })

  it('shows validation error when submitted without L1 label', () => {
    renderSheet({ open: true, onClose: noop, onSave: noop })
    fireEvent.change(screen.getByLabelText('Habit name'), { target: { value: 'Walk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Habit' }))
    expect(screen.getByText('Level 1 label is required')).toBeInTheDocument()
  })

  it('selecting Weekly shows the times-per-week stepper', () => {
    renderSheet({ open: true, onClose: noop, onSave: noop })
    expect(screen.queryByText(/per week/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'weekly' }))
    expect(screen.getByText(/per week/)).toBeInTheDocument()
  })

  it('edit mode pre-fills name, frequency, and level labels', () => {
    const habit = makeHabit({
      name: 'Meditate',
      frequency: 'weekly',
      weekly_target: 4,
      level1_label: 'Meditate 5 min',
      level2_label: 'Meditate 15 min',
    })
    renderSheet({ open: true, onClose: noop, onSave: noop, editHabit: habit })

    expect((screen.getByLabelText('Habit name') as HTMLInputElement).value).toBe('Meditate')
    expect((screen.getByLabelText('Level 1 label') as HTMLInputElement).value).toBe('Meditate 5 min')
    expect((screen.getByLabelText('Level 2 label') as HTMLInputElement).value).toBe('Meditate 15 min')
    // Weekly frequency is selected
    expect(screen.getByText(/per week/)).toBeInTheDocument()
  })

  it('delete button only appears in edit mode', () => {
    // Create mode — no delete
    const { unmount } = renderSheet({ open: true, onClose: noop, onSave: noop })
    expect(screen.queryByTestId('delete-habit-button')).not.toBeInTheDocument()
    unmount()

    // Edit mode — delete button is present
    const onDelete = vi.fn()
    renderSheet({ open: true, onClose: noop, onSave: noop, editHabit: makeHabit(), onDelete })
    expect(screen.getByTestId('delete-habit-button')).toBeInTheDocument()
  })

  it('clicking delete button prompts confirmation then calls onDelete', () => {
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderSheet({ open: true, onClose: noop, onSave: noop, editHabit: makeHabit(), onDelete })

    fireEvent.click(screen.getByTestId('delete-habit-button'))

    expect(window.confirm).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalled()
  })

  it('cancelling delete confirm does not call onDelete', () => {
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderSheet({ open: true, onClose: noop, onSave: noop, editHabit: makeHabit(), onDelete })

    fireEvent.click(screen.getByTestId('delete-habit-button'))

    expect(window.confirm).toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('calls onSave with correct payload on valid submit', () => {
    const onSave = vi.fn()
    renderSheet({ open: true, onClose: noop, onSave })

    fireEvent.change(screen.getByLabelText('Habit name'), { target: { value: 'Walk' } })
    fireEvent.change(screen.getByLabelText('Level 1 label'), { target: { value: 'Walk outside' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Habit' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Walk',
        level1_label: 'Walk outside',
        frequency: 'daily',
        weekly_target: null,
        level2_label: null,
        level3_label: null,
      }),
    )
  })
})
