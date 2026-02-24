import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useSuggestion } from './useSuggestion'

const mockSuggestion = {
  item_name: 'Scrambled Eggs',
  qty: 2,
  uom: 'each',
  calories: 180,
  protein_g: 14,
  carbs_g: 2,
  fat_g: 12,
  confidence: 4,
}

// MSW intercepts fetch at the network level so the real hook logic runs
const server = setupServer(
  http.post('/api/calorie-log/suggest', () =>
    HttpResponse.json(mockSuggestion)
  )
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
})
afterAll(() => server.close())

describe('useSuggestion', () => {
  it('stays idle for empty input', () => {
    const { result } = renderHook(() => useSuggestion('', 'breakfast'))
    expect(result.current.state.status).toBe('idle')
  })

  it('stays idle for short input (< 3 chars)', () => {
    const { result } = renderHook(() => useSuggestion('ab', 'breakfast'))
    expect(result.current.state.status).toBe('idle')
  })

  it('transitions from loading to success', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useSuggestion('2 eggs scrambled', 'breakfast'))

    // Before debounce fires, should be idle
    expect(result.current.state.status).toBe('idle')

    // Advance past the 600ms debounce
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    vi.useRealTimers()

    await waitFor(() => expect(result.current.state.status).toBe('success'))
    if (result.current.state.status === 'success') {
      expect(result.current.state.suggestion).toEqual(mockSuggestion)
    }
  })

  it('returns unrecognized for unknown food', async () => {
    server.use(
      http.post('/api/calorie-log/suggest', () =>
        HttpResponse.json({ error: 'unrecognized' })
      )
    )

    vi.useFakeTimers()
    const { result } = renderHook(() => useSuggestion('asdfghjkl', 'snack'))

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    vi.useRealTimers()

    await waitFor(() => expect(result.current.state.status).toBe('unrecognized'))
  })

  it('returns error on server failure', async () => {
    server.use(
      http.post('/api/calorie-log/suggest', () =>
        HttpResponse.json({ error: 'openai request failed' }, { status: 500 })
      )
    )

    vi.useFakeTimers()
    const { result } = renderHook(() => useSuggestion('banana', 'snack'))

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    vi.useRealTimers()

    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })

  it('only fires one request for rapid input changes (debounce)', async () => {
    let requestCount = 0
    server.use(
      http.post('/api/calorie-log/suggest', () => {
        requestCount++
        return HttpResponse.json(mockSuggestion)
      })
    )

    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ desc }) => useSuggestion(desc, 'breakfast'),
      { initialProps: { desc: 'ban' } }
    )

    // Rapid changes before debounce fires
    await act(async () => { vi.advanceTimersByTime(200) })
    rerender({ desc: 'bana' })
    await act(async () => { vi.advanceTimersByTime(200) })
    rerender({ desc: 'banan' })
    await act(async () => { vi.advanceTimersByTime(200) })
    rerender({ desc: 'banana' })

    // Now advance past debounce for the final value
    await act(async () => { vi.advanceTimersByTime(600) })
    vi.useRealTimers()

    await waitFor(() => expect(result.current.state.status).toBe('success'))
    // Only the last description should have fired a request
    expect(requestCount).toBe(1)
  })

  it('dismiss resets state to idle', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useSuggestion('2 eggs scrambled', 'breakfast'))

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    vi.useRealTimers()

    await waitFor(() => expect(result.current.state.status).toBe('success'))

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.state.status).toBe('idle')
  })
})
