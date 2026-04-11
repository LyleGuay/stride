import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import TaskSheet from '../TaskSheet'
import type { Task } from '../../../types'

/* ─── Mocks ──────────────────────────────────────────────────────────── */

vi.mock('../../../api', () => ({
  createTask: vi.fn().mockResolvedValue({ id: 99, name: 'New', tags: [] }),
  updateTask: vi.fn().mockResolvedValue({ id: 1, name: 'Updated', tags: [] }),
}))

import { createTask, updateTask } from '../../../api'
const mockCreate = createTask as ReturnType<typeof vi.fn>
const mockUpdate = updateTask as ReturnType<typeof vi.fn>

/* ─── Fixtures ───────────────────────────────────────────────────────── */

const TODAY = '2026-04-06'
const noop = vi.fn()

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    user_id: 1,
    name: 'Test task',
    description: null,
    scheduled_date: null,
    scheduled_time: null,
    deadline: null,
    priority: 'medium',
    status: 'todo',
    started_at: null,
    completed_at: null,
    canceled_at: null,
    recurrence_rule: null,
    created_at: '2026-04-06T10:00:00Z',
    updated_at: '2026-04-06T10:00:00Z',
    tags: [],
    ...overrides,
  }
}

function openSheet(props: Partial<Parameters<typeof TaskSheet>[0]> = {}) {
  return render(
    <TaskSheet
      open={true}
      onClose={noop}
      onSave={noop}
      today={TODAY}
      {...props}
    />,
  )
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

// Finds the Repeat button and opens the recurrence panel.
function openRecurrencePanel() {
  const repeatBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('None'))
  expect(repeatBtn).toBeTruthy()
  fireEvent.click(repeatBtn!)
}

/* ─── Priority dropdown ──────────────────────────────────────────────── */

describe('priority dropdown', () => {
  it('opens and shows all four options', () => {
    openSheet()
    // Find the priority button (shows "Medium" by default)
    const trigger = screen.getAllByRole('button').find(b => b.textContent?.includes('Medium'))
    expect(trigger).toBeTruthy()
    fireEvent.click(trigger!)
    expect(screen.getAllByText('Urgent').length).toBeGreaterThan(0)
    expect(screen.getAllByText('High').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Low').length).toBeGreaterThan(0)
  })

  it('updates displayed priority after selection', () => {
    openSheet()
    const trigger = screen.getAllByRole('button').find(b => b.textContent?.includes('Medium'))
    fireEvent.click(trigger!)
    const urgentOption = screen.getAllByText('Urgent')[0]
    fireEvent.click(urgentOption)
    // Dropdown closed; trigger now shows Urgent
    const newTrigger = screen.getAllByRole('button').find(b => b.textContent?.includes('Urgent'))
    expect(newTrigger).toBeTruthy()
  })

  it('includes selected priority in create API call', async () => {
    openSheet()
    // Open dropdown and select Urgent
    const trigger = screen.getAllByRole('button').find(b => b.textContent?.includes('Medium'))
    fireEvent.click(trigger!)
    fireEvent.click(screen.getAllByText('Urgent')[0])

    // Fill in name and submit
    const nameInput = screen.getByPlaceholderText('Task name')
    fireEvent.change(nameInput, { target: { value: 'My task' } })
    const saveBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('Create'))
    expect(saveBtn).toBeTruthy()
    fireEvent.click(saveBtn!)

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'urgent' }),
    ))
  })
})

/* ─── Calendar mutual exclusion ──────────────────────────────────────── */

describe('date pickers mutual exclusion', () => {
  it('opening scheduled date calendar closes deadline calendar', () => {
    const { queryAllByTestId } = openSheet()
    // Open deadline calendar first
    const deadlineBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('No deadline'))
    fireEvent.click(deadlineBtn!)
    // Exactly one calendar panel open
    expect(queryAllByTestId('calendar-panel').length).toBe(1)

    // Open scheduled date calendar — deadline calendar should close
    const scheduledBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('No date'))
    if (scheduledBtn) {
      fireEvent.click(scheduledBtn)
      // Still exactly one calendar panel (scheduled replaced deadline)
      expect(queryAllByTestId('calendar-panel').length).toBe(1)
    }
  })

  it('opening recurrence panel closes the active calendar', () => {
    const { queryByTestId } = openSheet()
    // Open scheduled date calendar by clicking the scheduled date row button
    const scheduledBtn = screen.getAllByRole('button').find(b =>
      b.textContent?.includes('No date'),
    )
    if (scheduledBtn) {
      fireEvent.click(scheduledBtn)
      // Calendar panel should be open
      expect(queryByTestId('calendar-panel')).not.toBeNull()

      // Open recurrence panel — should close the calendar
      const repeatBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('None'))
      fireEvent.click(repeatBtn!)

      // Calendar panel should now be gone
      expect(queryByTestId('calendar-panel')).toBeNull()
    }
  })
})

/* ─── Recurrence picker ──────────────────────────────────────────────── */

describe('recurrence picker', () => {
  it('shows preset chips when opened', () => {
    openSheet()
    openRecurrencePanel()
    expect(screen.getByText('Daily')).toBeTruthy()
    expect(screen.getByText('Weekdays')).toBeTruthy()
    expect(screen.getByText('Weekly')).toBeTruthy()
    expect(screen.getByText('Monthly')).toBeTruthy()
    expect(screen.getByText('Custom')).toBeTruthy()
  })

  it('does NOT show custom interval fields for non-custom presets', () => {
    openSheet()
    openRecurrencePanel()
    fireEvent.click(screen.getByText('Daily'))
    // interval input should not be visible for 'daily' preset
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('shows custom interval fields when Custom chip is selected', () => {
    openSheet()
    openRecurrencePanel()
    fireEvent.click(screen.getByText('Custom'))
    // An interval number input should appear
    expect(screen.getByRole('spinbutton')).toBeTruthy()
    // A unit select (days/weeks/months) should appear
    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('shows day-of-week toggles when Custom + weeks unit is selected', () => {
    openSheet()
    openRecurrencePanel()
    fireEvent.click(screen.getByText('Custom'))
    // Switch unit to weeks
    const unitSelect = screen.getByRole('combobox')
    fireEvent.change(unitSelect, { target: { value: 'weeks' } })
    // DOW toggles: 7 letters M T W T F S S
    const dowButtons = screen.getAllByRole('button').filter(b =>
      ['M', 'T', 'W', 'F', 'S'].includes(b.textContent?.trim() ?? ''),
    )
    expect(dowButtons.length).toBeGreaterThan(0)
  })

  it('does NOT show day toggles for Custom + days unit', () => {
    const { queryByTestId } = openSheet()
    openRecurrencePanel()
    fireEvent.click(screen.getByText('Custom'))
    // Default unit is 'days', no DOW toggles
    const unitSelect = screen.getByRole('combobox')
    fireEvent.change(unitSelect, { target: { value: 'days' } })
    // No dow-toggles container should be present
    expect(queryByTestId('dow-toggles')).toBeNull()
  })

  it('includes recurrence_rule in create API call when set', async () => {
    openSheet()
    openRecurrencePanel()
    fireEvent.click(screen.getByText('Daily'))
    // Close the panel
    const repeatBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('Every day'))
    fireEvent.click(repeatBtn!)

    const nameInput = screen.getByPlaceholderText('Task name')
    fireEvent.change(nameInput, { target: { value: 'Recurring task' } })
    const saveBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('Create'))
    expect(saveBtn).toBeTruthy()
    fireEvent.click(saveBtn!)

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence_rule: expect.objectContaining({ frequency: 'daily' }),
      }),
    ))
  })
})

/* ─── Edit mode pre-fill ─────────────────────────────────────────────── */

describe('edit mode', () => {
  beforeEach(() => {
    mockUpdate.mockResolvedValue({ id: 1, name: 'Updated', tags: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pre-fills the name field', () => {
    openSheet({ task: makeTask({ name: 'Existing task' }) })
    expect((screen.getByPlaceholderText('Task name') as HTMLInputElement).value).toBe('Existing task')
  })

  // Edit mode uses auto-save (no Save button). Advance fake timers past the
  // formInitialized delay (100ms) + auto-save debounce (1500ms) to trigger the call.
  it('sends scheduled_date and deadline in update call', async () => {
    vi.useFakeTimers()
    openSheet({
      task: makeTask({ scheduled_date: '2026-04-10', deadline: '2026-04-15' }),
    })

    // Allow formInitialized timeout to fire, then make a change to trigger auto-save.
    await act(async () => { vi.advanceTimersByTime(200) })
    const nameInput = screen.getByPlaceholderText('Task name')
    fireEvent.change(nameInput, { target: { value: 'Test task edited' } })
    await act(async () => { vi.advanceTimersByTime(1600) })

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        scheduled_date: '2026-04-10',
        deadline: '2026-04-15',
      }),
    )
  })

  it('sends recurrence_rule in update call when task has one', async () => {
    vi.useFakeTimers()
    openSheet({
      task: makeTask({ recurrence_rule: { frequency: 'weekly', interval: 1, unit: 'weeks', days_of_week: [1], anchor: 'schedule' } }),
    })

    await act(async () => { vi.advanceTimersByTime(200) })
    const nameInput = screen.getByPlaceholderText('Task name')
    fireEvent.change(nameInput, { target: { value: 'Weekly task edited' } })
    await act(async () => { vi.advanceTimersByTime(1600) })

    expect(mockUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        recurrence_rule: expect.objectContaining({ frequency: 'weekly' }),
      }),
    )
  })
})
