import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useMealPlanWeek } from './useMealPlanWeek'
import type { MealPlanEntry } from '../types'

const makeEntry = (overrides: Partial<MealPlanEntry> = {}): MealPlanEntry => ({
  id: 1,
  user_id: 1,
  date: '2026-04-14',
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
  created_at: '2026-04-14T08:00:00Z',
  updated_at: '2026-04-14T08:00:00Z',
  ...overrides,
})

const mockEntries: MealPlanEntry[] = [
  makeEntry({ id: 1, date: '2026-04-14', meal_type: 'breakfast', item_name: 'Oatmeal', calories: 350 }),
  makeEntry({ id: 2, date: '2026-04-14', meal_type: 'lunch',     item_name: 'Salad',   calories: 400, sort_order: 0 }),
  makeEntry({ id: 3, date: '2026-04-16', meal_type: 'dinner',    item_name: 'Pasta',   calories: 700, sort_order: 0 }),
]

const server = setupServer(
  http.get('/api/meal-plan/entries', () => HttpResponse.json(mockEntries)),
  http.post('/api/meal-plan/entries', async ({ request }) => {
    const body = await request.json() as Partial<MealPlanEntry>
    return HttpResponse.json(makeEntry({ id: 99, ...body }), { status: 201 })
  }),
  http.delete('/api/meal-plan/entries/:id', () => new HttpResponse(null, { status: 204 })),
  http.put('/api/meal-plan/entries/:id', async ({ request, params }) => {
    const body = await request.json() as Partial<MealPlanEntry>
    return HttpResponse.json(makeEntry({ id: Number(params.id), ...body }))
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('useMealPlanWeek', () => {
  it('starts in loading state', () => {
    const { result } = renderHook(() => useMealPlanWeek('2026-04-14'))
    expect(result.current.loading).toBe(true)
    expect(result.current.entries).toEqual([])
  })

  it('loads entries on mount', async () => {
    const { result } = renderHook(() => useMealPlanWeek('2026-04-14'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toHaveLength(3)
    expect(result.current.error).toBeNull()
  })

  it('refetches when weekStart changes', async () => {
    let callCount = 0
    server.use(
      http.get('/api/meal-plan/entries', () => {
        callCount++
        return HttpResponse.json(mockEntries)
      })
    )
    const { result, rerender } = renderHook(
      ({ ws }) => useMealPlanWeek(ws),
      { initialProps: { ws: '2026-04-14' } }
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(callCount).toBe(1)

    rerender({ ws: '2026-04-21' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(callCount).toBe(2)
  })

  it('sets error on failed fetch', async () => {
    server.use(
      http.get('/api/meal-plan/entries', () => HttpResponse.json({ error: 'fail' }, { status: 500 }))
    )
    const { result } = renderHook(() => useMealPlanWeek('2026-04-14'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.entries).toEqual([])
  })

  it('addEntry appends to entries', async () => {
    const { result } = renderHook(() => useMealPlanWeek('2026-04-14'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addEntry({
        date: '2026-04-14',
        meal_type: 'snack',
        entry_type: 'food',
        item_name: 'Apple',
        calories: 80,
      })
    })
    expect(result.current.entries).toHaveLength(4)
    expect(result.current.entries.find(e => e.id === 99)?.item_name).toBe('Apple')
  })

  it('deleteEntry removes the entry immediately', async () => {
    const { result } = renderHook(() => useMealPlanWeek('2026-04-14'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteEntry(1)
    })
    expect(result.current.entries.find(e => e.id === 1)).toBeUndefined()
    expect(result.current.entries).toHaveLength(2)
  })
})
