import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FavoritesDropdown from '../FavoritesDropdown'
import { scaleFavorite } from '../favorites-utils'
import type { CalorieLogFavorite } from '../../../types'

/* ─── Fixtures ───────────────────────────────────────────────────────────── */

function makeFav(overrides: Partial<CalorieLogFavorite> = {}): CalorieLogFavorite {
  return {
    id: 1,
    user_id: 1,
    item_name: 'Chicken Breast',
    type: 'lunch',
    qty: 1,
    uom: 'each',
    calories: 300,
    protein_g: 30,
    carbs_g: 0,
    fat_g: 5,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const breakfastFav = makeFav({ id: 1, item_name: 'Oatmeal', type: 'breakfast', calories: 200 })
const lunchFav     = makeFav({ id: 2, item_name: 'Chicken Breast', type: 'lunch', calories: 300 })
const dinnerFav    = makeFav({ id: 3, item_name: 'Steak', type: 'dinner', calories: 500 })
const exerciseFav  = makeFav({ id: 4, item_name: 'Running', type: 'exercise', calories: 150, protein_g: null, carbs_g: null, fat_g: null })

const allFavs = [breakfastFav, lunchFav, dinnerFav, exerciseFav]

const noop = vi.fn()

beforeEach(() => { noop.mockClear() })

/* ─── scaleFavorite unit tests ───────────────────────────────────────────── */

describe('scaleFavorite', () => {
  it('scales calories and macros proportionally', () => {
    const fav = makeFav({ qty: 1, calories: 300, protein_g: 30, carbs_g: 10, fat_g: 5 })
    const scaled = scaleFavorite(fav, 2)
    expect(scaled.calories).toBe(600)
    expect(scaled.protein_g).toBe(60)
    expect(scaled.carbs_g).toBe(20)
    expect(scaled.fat_g).toBe(10)
    expect(scaled.qty).toBe(2)
  })

  it('handles fractional quantities', () => {
    const fav = makeFav({ qty: 2, calories: 400, protein_g: 20, carbs_g: null, fat_g: 10 })
    const scaled = scaleFavorite(fav, 1)
    expect(scaled.calories).toBe(200)
    expect(scaled.protein_g).toBe(10)
    expect(scaled.fat_g).toBe(5)
  })

  it('passes through null macros as null', () => {
    const fav = makeFav({ qty: 1, calories: 150, protein_g: null, carbs_g: null, fat_g: null })
    const scaled = scaleFavorite(fav, 3)
    expect(scaled.calories).toBe(450)
    expect(scaled.protein_g).toBeNull()
    expect(scaled.carbs_g).toBeNull()
    expect(scaled.fat_g).toBeNull()
  })

  it('handles null base qty — defaults to 1', () => {
    const fav = makeFav({ qty: null, calories: 200 })
    const scaled = scaleFavorite(fav, 2)
    expect(scaled.calories).toBe(400)
  })

  it('handles zero base qty without divide-by-zero', () => {
    const fav = makeFav({ qty: 0, calories: 200, protein_g: 10 })
    // When base qty is 0, ratio = qty (avoid division by zero)
    const scaled = scaleFavorite(fav, 3)
    expect(scaled.calories).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(scaled.calories)).toBe(true)
  })

  it('rounds calories to nearest integer', () => {
    const fav = makeFav({ qty: 3, calories: 100, protein_g: null, carbs_g: null, fat_g: null })
    const scaled = scaleFavorite(fav, 1) // 100/3 ≈ 33.33
    expect(Number.isInteger(scaled.calories)).toBe(true)
    expect(scaled.calories).toBe(33)
  })

  it('rounds macros to one decimal place', () => {
    const fav = makeFav({ qty: 3, calories: 90, protein_g: 10, carbs_g: null, fat_g: null })
    const scaled = scaleFavorite(fav, 1) // 10/3 ≈ 3.333
    expect(scaled.protein_g).toBe(3.3)
  })
})

/* ─── Filter logic ───────────────────────────────────────────────────────── */

describe('FavoritesDropdown filter logic', () => {
  it('food section (lunch) shows only lunch favorites by default', () => {
    render(
      <FavoritesDropdown
        favorites={allFavs}
        mealType="lunch"
        onSelect={noop}
        onManage={noop}
        onClose={noop}
      />
    )
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument()
    expect(screen.queryByText('Oatmeal')).not.toBeInTheDocument()
    expect(screen.queryByText('Steak')).not.toBeInTheDocument()
    expect(screen.queryByText('Running')).not.toBeInTheDocument()
  })

  it('exercise section shows only exercise favorites', () => {
    render(
      <FavoritesDropdown
        favorites={allFavs}
        mealType="exercise"
        onSelect={noop}
        onManage={noop}
        onClose={noop}
      />
    )
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument()
    expect(screen.queryByText('Oatmeal')).not.toBeInTheDocument()
  })

  it('filter toggle shows all non-exercise favorites for a food section', () => {
    render(
      <FavoritesDropdown
        favorites={allFavs}
        mealType="lunch"
        onSelect={noop}
        onManage={noop}
        onClose={noop}
      />
    )
    // Click the filter toggle button
    const toggle = screen.getByTitle(/Showing lunch only/)
    fireEvent.click(toggle)

    // Now all food types should show, but not exercise
    expect(screen.getByText('Oatmeal')).toBeInTheDocument()
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument()
    expect(screen.getByText('Steak')).toBeInTheDocument()
    expect(screen.queryByText('Running')).not.toBeInTheDocument()
  })

  it('filter toggle is hidden for exercise sections', () => {
    render(
      <FavoritesDropdown
        favorites={allFavs}
        mealType="exercise"
        onSelect={noop}
        onManage={noop}
        onClose={noop}
      />
    )
    // No filter toggle visible (title contains "Showing")
    expect(screen.queryByTitle(/Showing/)).not.toBeInTheDocument()
  })
})

/* ─── Search ─────────────────────────────────────────────────────────────── */

describe('FavoritesDropdown search', () => {
  it('filters by substring (case-insensitive)', () => {
    render(
      <FavoritesDropdown
        favorites={allFavs}
        mealType="lunch"
        onSelect={noop}
        onManage={noop}
        onClose={noop}
      />
    )
    const input = screen.getByPlaceholderText('Search favorites…')
    fireEvent.change(input, { target: { value: 'CHICK' } })
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument()
  })

  it('shows "No results" when search has no matches', () => {
    render(
      <FavoritesDropdown
        favorites={allFavs}
        mealType="lunch"
        onSelect={noop}
        onManage={noop}
        onClose={noop}
      />
    )
    const input = screen.getByPlaceholderText('Search favorites…')
    fireEvent.change(input, { target: { value: 'xyzzy' } })
    expect(screen.getByText('No results')).toBeInTheDocument()
  })

  it('shows "No favorites yet" when no favorites exist at all', () => {
    render(
      <FavoritesDropdown
        favorites={[]}
        mealType="lunch"
        onSelect={noop}
        onManage={noop}
        onClose={noop}
      />
    )
    expect(screen.getByText('No favorites yet')).toBeInTheDocument()
  })
})

/* ─── Row interactions ───────────────────────────────────────────────────── */

describe('FavoritesDropdown row interactions', () => {
  it('clicking a row calls onSelect with the favorite and its default qty', () => {
    const onSelect = vi.fn()
    render(
      <FavoritesDropdown
        favorites={[lunchFav]}
        mealType="lunch"
        onSelect={onSelect}
        onManage={noop}
        onClose={noop}
      />
    )
    fireEvent.click(screen.getByText('Chicken Breast'))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(lunchFav, 1)
  })

  it('×qty expand → updating qty shows scaled calories live', () => {
    render(
      <FavoritesDropdown
        favorites={[lunchFav]}  // 300 cal, qty=1
        mealType="lunch"
        onSelect={noop}
        onManage={noop}
        onClose={noop}
      />
    )
    // Click ×qty button to expand
    const xqtyBtn = screen.getByTitle('Adjust serving')
    fireEvent.click(xqtyBtn)

    // Find the serving qty input
    const qtyInput = screen.getByDisplayValue('1')
    fireEvent.change(qtyInput, { target: { value: '2' } })

    // Should now show 600 cal
    expect(screen.getByText('600 cal')).toBeInTheDocument()
  })
})

/* ─── Footer ─────────────────────────────────────────────────────────────── */

describe('FavoritesDropdown footer', () => {
  it('"Manage Favorites…" button calls onManage', () => {
    const onManage = vi.fn()
    render(
      <FavoritesDropdown
        favorites={[lunchFav]}
        mealType="lunch"
        onSelect={noop}
        onManage={onManage}
        onClose={noop}
      />
    )
    fireEvent.click(screen.getByText('Manage Favorites…'))
    expect(onManage).toHaveBeenCalledOnce()
  })
})
