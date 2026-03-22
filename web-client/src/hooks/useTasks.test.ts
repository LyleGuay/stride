import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { useTasks } from './useTasks'
import type { Task } from '../types'

/* ─── Fixtures ───────────────────────────────────────────────────────── */

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    user_id: 1,
    name: `Task ${id}`,
    description: null,
    due_date: '2026-03-22',
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

const defaultParams = { view: 'today', today: '2026-03-22' }

const server = setupServer(
  http.get('/api/tasks', () =>
    HttpResponse.json({ tasks: [makeTask(1)], has_more: false }),
  ),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/* ─── Tests ──────────────────────────────────────────────────────────── */

describe('useTasks', () => {
  it('starts loading=true then populates tasks on success', async () => {
    const { result } = renderHook(() => useTasks(defaultParams))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tasks).toHaveLength(1)
    expect(result.current.tasks[0].name).toBe('Task 1')
    expect(result.current.error).toBeNull()
    expect(result.current.hasMore).toBe(false)
  })

  it('sets error on network failure', async () => {
    server.use(
      http.get('/api/tasks', () =>
        HttpResponse.json({ error: 'failed' }, { status: 500 }),
      ),
    )
    const { result } = renderHook(() => useTasks(defaultParams))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.tasks).toHaveLength(0)
  })

  it('re-fetches and resets tasks when view changes', async () => {
    let fetchCount = 0
    server.use(
      http.get('/api/tasks', () => {
        fetchCount++
        return HttpResponse.json({ tasks: [makeTask(fetchCount)], has_more: false })
      }),
    )
    const { result, rerender } = renderHook(
      ({ view }) => useTasks({ view, today: '2026-03-22' }),
      { initialProps: { view: 'today' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(1)

    rerender({ view: 'upcoming' })
    // tasks reset immediately on view change
    expect(result.current.tasks).toHaveLength(0)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(2)
  })

  it('appends tasks on loadMore when has_more is true', async () => {
    // First page returns has_more: true; second returns has_more: false.
    let callCount = 0
    server.use(
      http.get('/api/tasks', () => {
        callCount++
        if (callCount === 1) {
          return HttpResponse.json({ tasks: [makeTask(1), makeTask(2)], has_more: true })
        }
        return HttpResponse.json({ tasks: [makeTask(3)], has_more: false })
      }),
    )
    const { result } = renderHook(() => useTasks(defaultParams))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tasks).toHaveLength(2)
    expect(result.current.hasMore).toBe(true)

    act(() => { result.current.loadMore() })
    await waitFor(() => expect(result.current.loadingMore).toBe(false))
    expect(result.current.tasks).toHaveLength(3)
    expect(result.current.tasks[2].id).toBe(3)
    expect(result.current.hasMore).toBe(false)
  })

  it('loadMore is a no-op when hasMore is false', async () => {
    let fetchCount = 0
    server.use(
      http.get('/api/tasks', () => {
        fetchCount++
        return HttpResponse.json({ tasks: [makeTask(1)], has_more: false })
      }),
    )
    const { result } = renderHook(() => useTasks(defaultParams))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(1)

    act(() => { result.current.loadMore() })
    // No additional fetch should happen
    expect(fetchCount).toBe(1)
  })

  it('reload() resets to page 0 and re-fetches', async () => {
    let fetchCount = 0
    server.use(
      http.get('/api/tasks', () => {
        fetchCount++
        return HttpResponse.json({ tasks: [makeTask(fetchCount)], has_more: false })
      }),
    )
    const { result } = renderHook(() => useTasks(defaultParams))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(1)

    act(() => { result.current.reload() })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(2)
  })
})
