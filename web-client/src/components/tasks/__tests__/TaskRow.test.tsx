import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaskRow from '../TaskRow'
import type { Task } from '../../../types'

/* ─── Fixtures ───────────────────────────────────────────────────────── */

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
    created_at: '2026-03-22T10:00:00Z',
    updated_at: '2026-03-22T10:00:00Z',
    tags: [],
    ...overrides,
  }
}

const noop = vi.fn()
const TODAY = '2026-03-22'

/* ─── Scheduled date chip ────────────────────────────────────────────── */

describe('scheduled date chip', () => {
  it('shows "Today" when scheduled_date equals today', () => {
    render(<TaskRow task={makeTask({ scheduled_date: TODAY })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('Today')).toBeTruthy()
  })

  it('shows "1 day overdue" when 1 day past scheduled_date', () => {
    render(<TaskRow task={makeTask({ scheduled_date: '2026-03-21' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('1 day overdue')).toBeTruthy()
  })

  it('shows "3 days overdue" when 3 days past scheduled_date', () => {
    render(<TaskRow task={makeTask({ scheduled_date: '2026-03-19' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('3 days overdue')).toBeTruthy()
  })

  it('shows future date as "Mar 25" for a task scheduled in 3 days', () => {
    render(<TaskRow task={makeTask({ scheduled_date: '2026-03-25' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('Mar 25')).toBeTruthy()
  })

  it('shows no scheduled chip when scheduled_date is null', () => {
    const { queryByTestId } = render(<TaskRow task={makeTask({ scheduled_date: null })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(queryByTestId('scheduled-chip')).toBeNull()
  })
})

/* ─── Deadline chip ──────────────────────────────────────────────────── */

describe('deadline chip', () => {
  it('is not shown when deadline is null', () => {
    const { queryByTestId } = render(
      <TaskRow task={makeTask({ deadline: null })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(queryByTestId('deadline-chip')).toBeNull()
  })

  it('is not shown when deadline equals scheduled_date', () => {
    const { queryByTestId } = render(
      <TaskRow task={makeTask({ scheduled_date: TODAY, deadline: TODAY })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(queryByTestId('deadline-chip')).toBeNull()
  })

  it('is shown when deadline differs from scheduled_date', () => {
    const { getByTestId } = render(
      <TaskRow task={makeTask({ scheduled_date: TODAY, deadline: '2026-03-25' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(getByTestId('deadline-chip')).toBeTruthy()
  })

  it('applies red color when deadline is in the past', () => {
    const { getByTestId } = render(
      <TaskRow task={makeTask({ deadline: '2026-03-20' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(getByTestId('deadline-chip').className).toContain('text-red-500')
  })

  it('applies red color when deadline is today', () => {
    const { getByTestId } = render(
      <TaskRow task={makeTask({ deadline: TODAY })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(getByTestId('deadline-chip').className).toContain('text-red-500')
  })

  it('applies orange color when deadline is 1 day away (≤2 days)', () => {
    const { getByTestId } = render(
      <TaskRow task={makeTask({ deadline: '2026-03-23' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(getByTestId('deadline-chip').className).toContain('text-orange-400')
  })

  it('applies orange color when deadline is 2 days away (≤2 days)', () => {
    const { getByTestId } = render(
      <TaskRow task={makeTask({ deadline: '2026-03-24' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(getByTestId('deadline-chip').className).toContain('text-orange-400')
  })

  it('applies gray color when deadline is more than 2 days away', () => {
    const { getByTestId } = render(
      <TaskRow task={makeTask({ deadline: '2026-03-26' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(getByTestId('deadline-chip').className).toContain('text-gray-400')
  })
})

/* ─── Recurring indicator ────────────────────────────────────────────── */

describe('recurring indicator', () => {
  it('is not shown when recurrence_rule is null', () => {
    const { queryByTestId } = render(
      <TaskRow task={makeTask({ recurrence_rule: null })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(queryByTestId('recurring-indicator')).toBeNull()
  })

  it('is shown when recurrence_rule is set', () => {
    const { getByTestId } = render(
      <TaskRow task={makeTask({ recurrence_rule: { frequency: 'daily', anchor: 'schedule' } })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(getByTestId('recurring-indicator')).toBeTruthy()
  })

  it('shows ↻ symbol in the indicator', () => {
    const { getByTestId } = render(
      <TaskRow task={makeTask({ recurrence_rule: { frequency: 'weekly', anchor: 'schedule' } })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    expect(getByTestId('recurring-indicator').textContent).toContain('↻')
  })
})

/* ─── Priority border ────────────────────────────────────────────────── */

describe('priority border', () => {
  it.each([
    ['urgent', 'bg-red-500'],
    ['high',   'bg-orange-400'],
    ['medium', 'bg-indigo-500'],
    ['low',    'bg-gray-300'],
  ] as const)('applies %s → %s on the priority bar', (priority, expectedClass) => {
    const { container } = render(
      <TaskRow task={makeTask({ priority })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />,
    )
    const bar = container.querySelector('[data-testid="priority-bar"]')
    expect(bar?.classList.contains(expectedClass)).toBe(true)
  })
})

/* ─── Completed / canceled styling ──────────────────────────────────── */

describe('status styling', () => {
  it('applies strikethrough on completed task name', () => {
    render(<TaskRow task={makeTask({ status: 'completed' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    const name = screen.getByText('Test task')
    expect(name.className).toContain('line-through')
  })

  it('applies strikethrough and gray on canceled task name', () => {
    render(<TaskRow task={makeTask({ status: 'canceled' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    const name = screen.getByText('Test task')
    expect(name.className).toContain('line-through')
    expect(name.className).toContain('text-gray-400')
  })

  it('does not apply strikethrough on todo task', () => {
    render(<TaskRow task={makeTask({ status: 'todo' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    const name = screen.getByText('Test task')
    expect(name.className).not.toContain('line-through')
  })
})

/* ─── Tags ────────────────────────────────────────────────────────────── */

describe('tags', () => {
  it('renders each tag as a pill', () => {
    render(<TaskRow task={makeTask({ tags: ['work', 'urgent'] })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('work')).toBeTruthy()
    expect(screen.getByText('urgent')).toBeTruthy()
  })

  it('renders no pills when tags is empty', () => {
    const { container } = render(<TaskRow task={makeTask({ tags: [] })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    // bg-gray-100 is the pill class — should not appear without tags
    const pills = container.querySelectorAll('.bg-gray-100')
    expect(pills.length).toBe(0)
  })
})
