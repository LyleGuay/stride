import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MealPlanGhostRow from './MealPlanGhostRow'
import type { MealPlanEntry } from '../../api'

const makeEntry = (overrides: Partial<MealPlanEntry> = {}): MealPlanEntry => ({
  id: 1,
  user_id: 1,
  date: '2026-04-12',
  meal_type: 'lunch',
  entry_type: 'food',
  sort_order: 0,
  item_name: 'Chicken Salad',
  qty: 1,
  uom: 'serving',
  calories: 420,
  protein_g: 35,
  carbs_g: 20,
  fat_g: 15,
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

// Wrap in a table so <tr> renders correctly
function renderInTable(ui: React.ReactElement) {
  const { container } = render(
    <table><tbody>{ui}</tbody></table>
  )
  return container
}

describe('MealPlanGhostRow', () => {
  it('renders item name and calories for food entry', () => {
    renderInTable(<MealPlanGhostRow entry={makeEntry()} onLog={vi.fn()} />)
    expect(screen.getByText('Chicken Salad')).toBeTruthy()
    expect(screen.getByText('420 cal')).toBeTruthy()
  })

  it('renders takeout_name and calorie limit for takeout entry', () => {
    renderInTable(
      <MealPlanGhostRow
        entry={makeEntry({ entry_type: 'takeout', takeout_name: 'Pizza Hut', calorie_limit: 900 })}
        onLog={vi.fn()}
      />
    )
    expect(screen.getByText('Pizza Hut')).toBeTruthy()
    // Takeout shows calorie limit as "≤900 cal", not planned calories
    expect(screen.getByText('≤900 cal')).toBeTruthy()
  })

  it('calls onLog with the entry when Log button is clicked', () => {
    const onLog = vi.fn()
    const entry = makeEntry()
    renderInTable(<MealPlanGhostRow entry={entry} onLog={onLog} />)
    // Click first Log button (desktop column)
    const buttons = screen.getAllByRole('button', { name: /log/i })
    fireEvent.click(buttons[0])
    expect(onLog).toHaveBeenCalledWith(entry)
  })

  it('shows fallback name when item_name is null', () => {
    renderInTable(
      <MealPlanGhostRow
        entry={makeEntry({ item_name: null })}
        onLog={vi.fn()}
      />
    )
    expect(screen.getByText('—')).toBeTruthy()
  })
})
