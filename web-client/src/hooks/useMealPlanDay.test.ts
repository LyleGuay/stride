import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useMealPlanDay } from './useMealPlanDay'
import type { MealPlanEntry } from '../types'

const makeEntry = (overrides: Partial<MealPlanEntry> = {}): MealPlanEntry => ({
  id: 1,
  user_id: 1,
  date: '2026-04-12',
  meal_type: 'breakfast',
  entry_type: 'food',
  sort_order: 0,
  item_name: 'Oatmeal',
  qty: 1,
  uom: 'serving',
  calories: 350,
  protein_g: 10,
  carbs_g: 60,
  fat_g: 5,
  recipe_id: null,
  servings: null,
  takeout_name: null,
  calorie_limit: null,
  no_snacks: false,
  no_sides: false,
  created_at: '2026-04-12T08:00:00Z',
  updated_at: '2026-04-12T08:00:00Z',
  ...overrides,
})

const dayEntries = [
  makeEntry({ id: 1, meal_type: 'breakfast', item_name: 'Oatmeal', calories: 350 }),
  makeEntry({ id: 2, meal_type: 'lunch', item_name: 'Salad', calories: 400 }),
]

const server = setupServer(
  http.get('/api/meal-plan/entries', () => HttpResponse.json(dayEntries)),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('useMealPlanDay', () => {
  it('starts in loading state', () => {
    const { result } = renderHook(() => useMealPlanDay('2026-04-12'))
    expect(result.current.loading).toBe(true)
  })

  it('loads entries for the given date', async () => {
    const { result } = renderHook(() => useMealPlanDay('2026-04-12'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[0].item_name).toBe('Oatmeal')
  })

  it('refetches when date changes', async () => {
    const newEntries = [makeEntry({ id: 3, meal_type: 'dinner', item_name: 'Pasta', calories: 700 })]
    let currentDate = '2026-04-12'
    server.use(
      http.get('/api/meal-plan/entries', ({ request }) => {
        const url = new URL(request.url)
        const date = url.searchParams.get('date')
        if (date === '2026-04-13') return HttpResponse.json(newEntries)
        return HttpResponse.json(dayEntries)
      }),
    )

    const { result, rerender } = renderHook(() => useMealPlanDay(currentDate))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toHaveLength(2)

    currentDate = '2026-04-13'
    rerender()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].item_name).toBe('Pasta')
  })

  it('returns empty array on error', async () => {
    server.use(
      http.get('/api/meal-plan/entries', () => HttpResponse.json({ error: 'server error' }, { status: 500 })),
    )
    const { result } = renderHook(() => useMealPlanDay('2026-04-12'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toEqual([])
  })
})
