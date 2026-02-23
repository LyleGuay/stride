import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useDailySummary } from './useDailySummary'

// Minimal DailySummary shape for testing
const mockSummary = {
  date: '2026-02-22',
  calorie_budget: 2000,
  calories_food: 500,
  calories_exercise: 0,
  net_calories: 500,
  calories_left: 1500,
  protein_g: 30,
  carbs_g: 60,
  fat_g: 15,
  items: [],
  settings: {
    user_id: 1,
    calorie_budget: 2000,
    protein_target_g: 150,
    carbs_target_g: 200,
    fat_target_g: 65,
    breakfast_budget: 400,
    lunch_budget: 600,
    dinner_budget: 700,
    snack_budget: 300,
    exercise_target_calories: 300,
    sex: null,
    date_of_birth: null,
    height_cm: null,
    weight_lbs: null,
    activity_level: null,
    target_weight_lbs: null,
    target_date: null,
    units: 'imperial',
    budget_auto: false,
    setup_complete: false,
  },
}

// MSW intercepts fetch at the network level so the real hook logic runs
const server = setupServer(
  http.get('/api/calorie-log/daily', () => HttpResponse.json(mockSummary))
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('useDailySummary', () => {
  it('starts in loading state', () => {
    const { result } = renderHook(() => useDailySummary('2026-02-22'))
    expect(result.current.loading).toBe(true)
    expect(result.current.summary).toBeNull()
  })

  it('sets summary on successful fetch', async () => {
    const { result } = renderHook(() => useDailySummary('2026-02-22'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary).toEqual(mockSummary)
    expect(result.current.error).toBe('')
  })

  it('sets error on failed fetch', async () => {
    server.use(
      http.get('/api/calorie-log/daily', () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 })
      )
    )
    const { result } = renderHook(() => useDailySummary('2026-02-22'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.summary).toBeNull()
  })

  it('refetches when date changes', async () => {
    let callCount = 0
    server.use(
      http.get('/api/calorie-log/daily', () => {
        callCount++
        return HttpResponse.json({
          ...mockSummary,
          date: callCount === 1 ? '2026-02-22' : '2026-02-23',
        })
      })
    )

    const { result, rerender } = renderHook(
      ({ date }) => useDailySummary(date),
      { initialProps: { date: '2026-02-22' } }
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(callCount).toBe(1)

    rerender({ date: '2026-02-23' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(callCount).toBe(2)
  })
})
