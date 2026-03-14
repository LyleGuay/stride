import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { useJournalSummary } from './useJournalSummary'
import type { JournalSummaryResponse } from '../types'

/* ─── Fixtures ───────────────────────────────────────────────────────── */

const mockSummary: JournalSummaryResponse = {
  mental_state_points: [{ date: '2026-03-10', score: 4.0 }],
  top_emotions: [{ tag: 'happy', count: 3 }],
  entry_type_counts: [{ tag: 'thoughts', count: 2 }],
}

const server = setupServer(
  http.get('/api/journal/summary', () => HttpResponse.json(mockSummary)),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/* ─── Tests ──────────────────────────────────────────────────────────── */

describe('useJournalSummary', () => {
  it('populates summary on success', async () => {
    const { result } = renderHook(() => useJournalSummary('1m'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary).toEqual(mockSummary)
    expect(result.current.error).toBeNull()
  })

  it('sets error on non-2xx response', async () => {
    server.use(
      http.get('/api/journal/summary', () =>
        HttpResponse.json({ error: 'invalid range' }, { status: 400 }),
      ),
    )
    const { result } = renderHook(() => useJournalSummary('1m'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.summary).toBeNull()
  })

  it('re-fetches when range changes', async () => {
    let fetchCount = 0
    server.use(
      http.get('/api/journal/summary', () => {
        fetchCount++
        return HttpResponse.json(mockSummary)
      }),
    )
    const { result, rerender } = renderHook(({ range }) => useJournalSummary(range), {
      initialProps: { range: '1m' as const },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(1)

    rerender({ range: '6m' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(2)
  })
})
