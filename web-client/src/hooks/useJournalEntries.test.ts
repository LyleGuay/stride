import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { useJournalEntries } from './useJournalEntries'
import type { JournalEntry } from '../types'

/* ─── Fixtures ───────────────────────────────────────────────────────── */

const mockEntry: JournalEntry = {
  id: 1,
  entry_date: '2026-03-10',
  entry_time: '09:30',
  body: 'Feeling good today.',
  tags: ['happy', 'thoughts'],
  habit_id: null,
  habit_name: null,
  created_at: '2026-03-10T09:30:00Z',
}

const server = setupServer(
  http.get('/api/journal', () => HttpResponse.json([mockEntry])),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/* ─── Tests ──────────────────────────────────────────────────────────── */

describe('useJournalEntries', () => {
  it('starts loading=true then sets loading=false and populates entries', async () => {
    const { result } = renderHook(() => useJournalEntries('2026-03-10'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].body).toBe('Feeling good today.')
    expect(result.current.error).toBeNull()
  })

  it('sets error on non-2xx response', async () => {
    server.use(
      http.get('/api/journal', () =>
        HttpResponse.json({ error: 'failed to load' }, { status: 500 }),
      ),
    )
    const { result } = renderHook(() => useJournalEntries('2026-03-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.entries).toHaveLength(0)
  })

  it('re-fetches when date changes', async () => {
    let fetchCount = 0
    server.use(
      http.get('/api/journal', () => {
        fetchCount++
        return HttpResponse.json([mockEntry])
      }),
    )
    const { result, rerender } = renderHook(({ date }) => useJournalEntries(date), {
      initialProps: { date: '2026-03-10' },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(1)

    rerender({ date: '2026-03-09' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(2)
  })

  it('re-fetches when reload() is called', async () => {
    let fetchCount = 0
    server.use(
      http.get('/api/journal', () => {
        fetchCount++
        return HttpResponse.json([mockEntry])
      }),
    )
    const { result } = renderHook(() => useJournalEntries('2026-03-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(1)

    // Wrap in act so the reloadCounter state update flushes before waitFor
    act(() => { result.current.reload() })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(2)
  })
})
