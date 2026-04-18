// Tests for MealPlanEntrySheet — covers tab visibility, field rendering,
// and the save-and-close flow. Uses msw to intercept network requests.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import MealPlanEntrySheet from './MealPlanEntrySheet'
import type { MealPlanEntry, CalorieLogFavorite } from '../../api'

/* ─── MSW server ─────────────────────────────────────────────────────────── */

const mockRecipes = [
  {
    id: 1,
    user_id: 1,
    name: 'Overnight Oats',
    emoji: null,
    category: 'breakfast',
    notes: null,
    servings: 2,
    calories: 400,
    protein_g: 15,
    carbs_g: 60,
    fat_g: 10,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    step_count: 2,
    total_timer_seconds: 300,
  },
]

const server = setupServer(
  http.get('/api/recipes', () => HttpResponse.json(mockRecipes)),
  http.get('/api/calorie-log/favorites', () => HttpResponse.json([])),
  // Silence AI suggestion requests so they don't produce unhandled warnings
  http.post('/api/calorie-log/suggest', () => HttpResponse.json({ error: 'unrecognized' })),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/* ─── Fixtures ───────────────────────────────────────────────────────────── */

const noopSave = vi.fn().mockResolvedValue(undefined)
const noopClose = vi.fn()

const baseFavorite: CalorieLogFavorite = {
  id: 1,
  user_id: 1,
  item_name: 'Granola Bar',
  type: 'snack',
  qty: 1,
  uom: 'each',
  calories: 200,
  protein_g: 4,
  carbs_g: 30,
  fat_g: 7,
  created_at: '2026-01-01T00:00:00Z',
}

const baseEntry: MealPlanEntry = {
  id: 42,
  user_id: 1,
  date: '2026-04-14',
  meal_type: 'breakfast',
  entry_type: 'food',
  sort_order: 0,
  item_name: 'Oatmeal',
  qty: 1,
  uom: 'each',
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
  created_at: '2026-04-14T07:00:00Z',
  updated_at: '2026-04-14T07:00:00Z',
}

/* ─── Helper ─────────────────────────────────────────────────────────────── */

function renderSheet(overrides: {
  open?: boolean
  entry?: MealPlanEntry
  favorites?: CalorieLogFavorite[]
  onSave?: typeof noopSave
  onClose?: typeof noopClose
} = {}) {
  const props = {
    open: overrides.open ?? true,
    onClose: overrides.onClose ?? noopClose,
    day: '2026-04-14',
    mealType: 'breakfast' as const,
    entry: overrides.entry,
    onSave: overrides.onSave ?? noopSave,
    favorites: overrides.favorites ?? [baseFavorite],
  }
  return render(<MealPlanEntrySheet {...props} />)
}

/* ─── Tests ──────────────────────────────────────────────────────────────── */

describe('MealPlanEntrySheet — tab visibility', () => {
  it('Favorites tab is visible in add mode (no entry prop)', () => {
    renderSheet()
    // The "★ Favorites" tab pill should be in the document
    expect(screen.getByRole('button', { name: /★ Favorites/i })).toBeInTheDocument()
  })

  it('Favorites tab is NOT rendered in edit mode (entry prop provided)', () => {
    renderSheet({ entry: baseEntry })
    expect(screen.queryByRole('button', { name: /★ Favorites/i })).not.toBeInTheDocument()
  })
})

describe('MealPlanEntrySheet — Takeout tab', () => {
  it('renders "No snacks" and "No sides" checkboxes', () => {
    renderSheet()
    // Switch to Takeout tab
    fireEvent.click(screen.getByRole('button', { name: 'Takeout' }))

    expect(screen.getByRole('checkbox', { name: /no snacks/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /no sides/i })).toBeInTheDocument()
  })

  it('does NOT render a "No dessert" checkbox', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Takeout' }))

    expect(screen.queryByRole('checkbox', { name: /no dessert/i })).not.toBeInTheDocument()
  })
})

describe('MealPlanEntrySheet — Recipe tab', () => {
  it('shows the recipe picker (a select element) after switching to Recipe tab', async () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Recipe' }))

    // The recipe select should be present immediately (recipes load async but the
    // select is rendered regardless; it starts with just the placeholder option)
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()

    // After recipes load, the recipe name should appear as an option
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Overnight Oats' })).toBeInTheDocument()
    })
  })
})

describe('MealPlanEntrySheet — save flow', () => {
  it('calls onSave and closes when saving a valid Food entry', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderSheet({ onSave, onClose })

    // Food tab is active by default; fill required fields
    const nameInput = screen.getByPlaceholderText(/banana smoothie/i)
    fireEvent.change(nameInput, { target: { value: 'Scrambled Eggs' } })

    const calInput = screen.getByPlaceholderText('0')
    fireEvent.change(calInput, { target: { value: '300' } })

    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce()
      expect(onClose).toHaveBeenCalledOnce()
    })

    // Verify the payload shape
    const [payload] = onSave.mock.calls[0] as [Parameters<typeof onSave>[0]]
    expect(payload).toMatchObject({
      date: '2026-04-14',
      meal_type: 'breakfast',
      entry_type: 'food',
      item_name: 'Scrambled Eggs',
      calories: 300,
    })
  })
})
