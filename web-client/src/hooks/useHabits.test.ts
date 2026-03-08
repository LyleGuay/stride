import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { useHabits } from './useHabits'
import type { HabitWithLog, HabitLog } from '../types'

/* ─── Fixtures ───────────────────────────────────────────────────────── */

const mockHabit: HabitWithLog = {
  id: 1,
  user_id: 1,
  name: 'Exercise',
  emoji: null,
  color: null,
  frequency: 'daily',
  weekly_target: null,
  level1_label: 'Exercise',
  level2_label: '30 min',
  level3_label: '1 hour',
  sort_order: 0,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  log: null,
  current_streak: 0,
  longest_streak: 3,
  consistency_30d: 50,
  avg_level_30d: 1.5,
}

const server = setupServer(
  http.get('/api/habits', () => HttpResponse.json([mockHabit])),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/* ─── Tests ──────────────────────────────────────────────────────────── */

describe('useHabits', () => {
  it('fetches habits on mount; loading starts true and ends false', async () => {
    const { result } = renderHook(() => useHabits('2026-03-07'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.habits).toHaveLength(1)
    expect(result.current.habits[0].name).toBe('Exercise')
  })

  it('logLevel sends PUT and updates matching habit log in state', async () => {
    const { result } = renderHook(() => useHabits('2026-03-07'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const mockLog: HabitLog = { id: 42, user_id: 1, habit_id: 1, date: '2026-03-07', level: 2 }
    server.use(http.put('/api/habit-logs', () => HttpResponse.json(mockLog)))

    await act(async () => {
      await result.current.logLevel(1, 2)
    })

    expect(result.current.habits[0].log?.level).toBe(2)
    // Server id is reflected after the confirmed response.
    expect(result.current.habits[0].log?.id).toBe(42)
  })

  it('rolls back optimistic update when API returns an error', async () => {
    const { result } = renderHook(() => useHabits('2026-03-07'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.habits[0].log).toBeNull()

    server.use(
      http.put('/api/habit-logs', () =>
        HttpResponse.json({ error: 'server error' }, { status: 500 }),
      ),
    )

    await act(async () => {
      try {
        await result.current.logLevel(1, 2)
      } catch { /* expected */ }
    })

    // Log must be rolled back to null.
    expect(result.current.habits[0].log).toBeNull()
  })

  it('re-fetches when date prop changes', async () => {
    let fetchCount = 0
    server.use(
      http.get('/api/habits', () => {
        fetchCount++
        return HttpResponse.json([mockHabit])
      }),
    )

    const { result, rerender } = renderHook(({ date }) => useHabits(date), {
      initialProps: { date: '2026-03-07' },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(1)

    rerender({ date: '2026-03-06' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(2)
  })
})
