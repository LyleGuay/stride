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
    due_date: null,
    due_time: null,
    priority: 'medium',
    status: 'todo',
    completed_at: null,
    canceled_at: null,
    created_at: '2026-03-22T10:00:00Z',
    updated_at: '2026-03-22T10:00:00Z',
    tags: [],
    ...overrides,
  }
}

const noop = vi.fn()
const TODAY = '2026-03-22'

/* ─── Due date display ─────────────────────────────────────────────── */

describe('due date chip', () => {
  it('shows "Today" when due date equals today', () => {
    render(<TaskRow task={makeTask({ due_date: TODAY })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('Today')).toBeTruthy()
  })

  it('shows "1 day overdue" when 1 day past due', () => {
    render(<TaskRow task={makeTask({ due_date: '2026-03-21' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('1 day overdue')).toBeTruthy()
  })

  it('shows "3 days overdue" when 3 days past due', () => {
    render(<TaskRow task={makeTask({ due_date: '2026-03-19' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('3 days overdue')).toBeTruthy()
  })

  it('shows future date as "Mar 25" for a task due in 3 days', () => {
    render(<TaskRow task={makeTask({ due_date: '2026-03-25' })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('Mar 25')).toBeTruthy()
  })

  it('shows no chip when due_date is null', () => {
    const { container } = render(<TaskRow task={makeTask({ due_date: null })} today={TODAY} onStatusChange={noop} onEdit={noop} onDelete={noop} />)
    expect(container.querySelector('.text-red-500')).toBeNull()
    expect(container.querySelector('.text-amber-500')).toBeNull()
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
