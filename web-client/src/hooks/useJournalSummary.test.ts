import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { useJournalSummary } from './useJournalSummary'
import type { JournalSummaryResponse } from '../types'

/* ─── Fixtures ───────────────────────────────────────────────────────── */

const mockSummary: JournalSummaryResponse = {
  mental_state_bars: [
    { label: 'Mon', date: '2026-03-30', score: 4.0, entry_count: 2, emotions: ['happy'] },
  ],
  top_emotions: [{ tag: 'happy', count: 3 }],
  entry_type_counts: [{ tag: 'thoughts', count: 2 }],
  total_entries: 5,
  days_logged: 3,
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
    const { result } = renderHook(() => useJournalSummary('week'))
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
    const { result } = renderHook(() => useJournalSummary('week'))
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
    const { result, rerender } = renderHook(
      ({ range }) => useJournalSummary(range),
      { initialProps: { range: 'week' as const } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(1)

    rerender({ range: 'month' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchCount).toBe(2)
  })

  it('re-fetches when refDate changes independently of range', async () => {
    let lastUrl = ''
    server.use(
      http.get('/api/journal/summary', ({ request }) => {
        lastUrl = request.url
        return HttpResponse.json(mockSummary)
      }),
    )
    const { result, rerender } = renderHook(
      ({ range, refDate }) => useJournalSummary(range, refDate),
      { initialProps: { range: 'week' as const, refDate: '2026-03-30' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(lastUrl).toContain('ref_date=2026-03-30')

    rerender({ range: 'week', refDate: '2026-04-06' })
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(lastUrl).toContain('ref_date=2026-04-06')
    })
  })

  it('returns updated mental_state_bars shape', async () => {
    const { result } = renderHook(() => useJournalSummary('week'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const bar = result.current.summary!.mental_state_bars[0]
    expect(bar.label).toBe('Mon')
    expect(bar.score).toBe(4.0)
    expect(bar.entry_count).toBe(2)
    expect(bar.emotions).toEqual(['happy'])
  })
})
