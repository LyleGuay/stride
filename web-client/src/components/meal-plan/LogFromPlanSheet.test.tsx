import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import LogFromPlanSheet from './LogFromPlanSheet'
import type { MealPlanEntry } from '../../api'

const makeEntry = (overrides: Partial<MealPlanEntry> = {}): MealPlanEntry => ({
  id: 42,
  user_id: 1,
  date: '2026-04-12',
  meal_type: 'lunch',
  entry_type: 'food',
  sort_order: 0,
  item_name: 'Chicken Rice Bowl',
  qty: 2,
  uom: 'cup',
  calories: 500,
  protein_g: 40,
  carbs_g: 50,
  fat_g: 10,
  recipe_id: null,
  servings: null,
  takeout_name: null,
  calorie_limit: null,
  no_snacks: false,
  no_sides: false,
  created_at: '2026-04-12T10:00:00Z',
  updated_at: '2026-04-12T10:00:00Z',
  ...overrides,
})

const server = setupServer(
  http.post('/api/calorie-log/items', () => HttpResponse.json({ id: 99 }, { status: 201 })),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('LogFromPlanSheet', () => {
  it('renders item name and pre-fills calories', () => {
    render(
      <LogFromPlanSheet
        open={true}
        onClose={vi.fn()}
        entry={makeEntry()}
        date="2026-04-12"
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByText('Chicken Rice Bowl')).toBeTruthy()
    const calInput = screen.getByPlaceholderText('0') as HTMLInputElement
    expect(calInput.value).toBe('500')
  })

  it('recomputes calories when qty changes', () => {
    render(
      <LogFromPlanSheet
        open={true}
        onClose={vi.fn()}
        entry={makeEntry({ qty: 2, calories: 500 })}
        date="2026-04-12"
        onSaved={vi.fn()}
      />
    )
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity/i }) as HTMLInputElement
    fireEvent.change(qtyInput, { target: { value: '1' } })
    const calInput = screen.getByPlaceholderText('0') as HTMLInputElement
    // 500 * (1/2) = 250
    expect(calInput.value).toBe('250')
  })

  it('calls onSaved and onClose after successful save', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(
      <LogFromPlanSheet
        open={true}
        onClose={onClose}
        entry={makeEntry()}
        date="2026-04-12"
        onSaved={onSaved}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /log item/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  it('shows error message when API fails', async () => {
    server.use(
      http.post('/api/calorie-log/items', () => HttpResponse.json({ error: 'server error' }, { status: 500 })),
    )
    render(
      <LogFromPlanSheet
        open={true}
        onClose={vi.fn()}
        entry={makeEntry()}
        date="2026-04-12"
        onSaved={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /log item/i }))
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeTruthy())
  })
})
