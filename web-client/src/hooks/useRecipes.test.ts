import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useRecipes } from './useRecipes'
import type { RecipeListItem } from '../types'

// Minimal recipe list items for test responses
const mockRecipes: RecipeListItem[] = [
  {
    id: 1, user_id: 1, name: 'Pumpkin Pie', category: 'dessert',
    emoji: '🎃', servings: 8, calories: 320, protein_g: 6, carbs_g: 45, fat_g: 13,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    step_count: 5, total_timer_seconds: 3900,
  },
  {
    id: 2, user_id: 1, name: 'Chicken Stir-Fry', category: 'dinner',
    emoji: '🥘', servings: 4, calories: 450, protein_g: 38, carbs_g: 30, fat_g: 14,
    created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
    step_count: 3, total_timer_seconds: 1200,
  },
]

// MSW intercepts fetch at the network level so real hook logic runs
const server = setupServer(
  http.get('/api/recipes', () => HttpResponse.json(mockRecipes))
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('useRecipes', () => {
  it('starts in loading state', () => {
    const { result } = renderHook(() => useRecipes())
    expect(result.current.loading).toBe(true)
    expect(result.current.recipes).toEqual([])
  })

  it('returns recipes on successful fetch', async () => {
    const { result } = renderHook(() => useRecipes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.recipes).toEqual(mockRecipes)
    expect(result.current.error).toBe('')
  })

  it('sets error when the server returns an error', async () => {
    server.use(
      http.get('/api/recipes', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 })
      )
    )
    const { result } = renderHook(() => useRecipes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.recipes).toEqual([])
  })

  it('reload() re-fetches and updates the list', async () => {
    let callCount = 0
    const secondList: RecipeListItem[] = [
      ...mockRecipes,
      {
        id: 3, user_id: 1, name: 'New Recipe', category: 'lunch',
        emoji: null, servings: 2, calories: null, protein_g: null, carbs_g: null, fat_g: null,
        created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z',
        step_count: 1, total_timer_seconds: 0,
      },
    ]
    server.use(
      http.get('/api/recipes', () => {
        callCount++
        return HttpResponse.json(callCount === 1 ? mockRecipes : secondList)
      })
    )

    const { result } = renderHook(() => useRecipes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.recipes).toHaveLength(2)
    expect(callCount).toBe(1)

    await act(() => result.current.reload())
    expect(result.current.recipes).toHaveLength(3)
    expect(callCount).toBe(2)
  })
})
