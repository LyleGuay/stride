import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { useJournalCalendar } from './useJournalCalendar'
import type { JournalCalendarDay } from '../types'

/* ─── Fixtures ───────────────────────────────────────────────────────── */

const aprilDays: JournalCalendarDay[] = [
  { date: '2026-04-01', entry_count: 2, avg_score: 4.0 },
  { date: '2026-04-03', entry_count: 1, avg_score: null },
]

const mayDays: JournalCalendarDay[] = [
  { date: '2026-05-10', entry_count: 3, avg_score: 3.5 },
]

let fetchCount = 0

const server = setupServer(
  http.get('/api/journal/calendar', ({ request }) => {
    fetchCount++
    const url = new URL(request.url)
    const month = url.searchParams.get('month')
    if (month === '2026-04') return HttpResponse.json(aprilDays)
    if (month === '2026-05') return HttpResponse.json(mayDays)
    return HttpResponse.json([])
  }),
)

beforeAll(() => server.listen())
afterEach(() => { server.resetHandlers(); fetchCount = 0 })
afterAll(() => server.close())

/* ─── Tests ──────────────────────────────────────────────────────────── */

describe('useJournalCalendar', () => {
  it('getMonthData returns null before loadMonth is called', () => {
    const { result } = renderHook(() => useJournalCalendar())
    expect(result.current.getMonthData('2026-04')).toBeNull()
  })

  it('getMonthData returns cached data after loadMonth resolves', async () => {
    const { result } = renderHook(() => useJournalCalendar())
    act(() => { result.current.loadMonth('2026-04') })
    await waitFor(() => expect(result.current.isLoading('2026-04')).toBe(false))
    expect(result.current.getMonthData('2026-04')).toEqual(aprilDays)
  })

  it('calling loadMonth twice for the same month only triggers one fetch', async () => {
    const { result } = renderHook(() => useJournalCalendar())
    act(() => {
      result.current.loadMonth('2026-04')
      result.current.loadMonth('2026-04') // second call should be a no-op
    })
    await waitFor(() => expect(result.current.isLoading('2026-04')).toBe(false))
    expect(fetchCount).toBe(1)
  })

  it('isLoading is true while fetch is in-flight and false after', async () => {
    const { result } = renderHook(() => useJournalCalendar())
    act(() => { result.current.loadMonth('2026-04') })
    expect(result.current.isLoading('2026-04')).toBe(true)
    await waitFor(() => expect(result.current.isLoading('2026-04')).toBe(false))
  })

  it('invalidate clears the cache so the next loadMonth refetches', async () => {
    const { result } = renderHook(() => useJournalCalendar())

    // Load and wait.
    act(() => { result.current.loadMonth('2026-04') })
    await waitFor(() => expect(result.current.isLoading('2026-04')).toBe(false))
    expect(fetchCount).toBe(1)

    // Invalidate and reload — should trigger a second fetch.
    act(() => { result.current.invalidate('2026-04') })
    expect(result.current.getMonthData('2026-04')).toBeNull()

    act(() => { result.current.loadMonth('2026-04') })
    await waitFor(() => expect(result.current.isLoading('2026-04')).toBe(false))
    expect(fetchCount).toBe(2)
  })

  it('different months are cached independently', async () => {
    const { result } = renderHook(() => useJournalCalendar())
    act(() => {
      result.current.loadMonth('2026-04')
      result.current.loadMonth('2026-05')
    })
    await waitFor(() => {
      expect(result.current.isLoading('2026-04')).toBe(false)
      expect(result.current.isLoading('2026-05')).toBe(false)
    })
    expect(result.current.getMonthData('2026-04')).toEqual(aprilDays)
    expect(result.current.getMonthData('2026-05')).toEqual(mayDays)
    expect(fetchCount).toBe(2)
  })
})
