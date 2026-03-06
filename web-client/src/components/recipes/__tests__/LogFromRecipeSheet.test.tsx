import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LogFromRecipeSheet from '../LogFromRecipeSheet'
import type { RecipeDetail } from '../../../types'

// Mock the API so we don't actually POST
vi.mock('../../../api', () => ({
  logFromRecipe: vi.fn().mockResolvedValue({}),
}))

// Pin "today" so date defaults are deterministic
const FIXED_NOW = new Date('2026-03-01T12:00:00Z').getTime()
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW) })
afterEach(() => { vi.useRealTimers() })

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

// A recipe with 1 serving and known nutrition values
const baseRecipe: RecipeDetail = {
  id: 1,
  user_id: 1,
  name: 'Test Pasta',
  emoji: '🍝',
  category: 'dinner',
  notes: null,
  servings: 1,
  calories: 400,
  protein_g: 20,
  carbs_g: 60,
  fat_g: 10,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ingredients: [],
  tools: [],
  steps: [],
}

const noop = vi.fn()

/* ─── Tests ───────────────────────────────────────────────────────────────── */

describe('LogFromRecipeSheet', () => {
  describe('serving-based nutrition scaling', () => {
    it('shows recipe calories for default (1) serving', () => {
      render(<LogFromRecipeSheet open recipe={baseRecipe} onClose={noop} />)
      expect(screen.getByTestId('scaled-calories')).toHaveTextContent('400')
    })

    it('doubles calories when servings increased to 2', () => {
      render(<LogFromRecipeSheet open recipe={baseRecipe} onClose={noop} />)
      // Click the + button twice (0.5 step each → +1 total)
      fireEvent.click(screen.getByLabelText('Increase servings'))
      fireEvent.click(screen.getByLabelText('Increase servings'))
      expect(screen.getByTestId('servings-display')).toHaveTextContent('2')
      expect(screen.getByTestId('scaled-calories')).toHaveTextContent('800')
    })

    it('halves calories when servings decreased to 0.5', () => {
      render(<LogFromRecipeSheet open recipe={baseRecipe} onClose={noop} />)
      // Click − once: 1 − 0.5 = 0.5
      fireEvent.click(screen.getByLabelText('Decrease servings'))
      expect(screen.getByTestId('servings-display')).toHaveTextContent('0.5')
      expect(screen.getByTestId('scaled-calories')).toHaveTextContent('200')
    })

    it('cannot go below 0.5 servings', () => {
      render(<LogFromRecipeSheet open recipe={baseRecipe} onClose={noop} />)
      const decreaseBtn = screen.getByLabelText('Decrease servings')
      fireEvent.click(decreaseBtn)
      fireEvent.click(decreaseBtn)  // should clamp at 0.5
      expect(screen.getByTestId('servings-display')).toHaveTextContent('0.5')
      expect(decreaseBtn).toBeDisabled()
    })
  })

  describe('sheet visibility', () => {
    it('renders inner panel when open=true', () => {
      render(<LogFromRecipeSheet open recipe={baseRecipe} onClose={noop} />)
      expect(screen.getByRole('heading', { name: 'Log to Calorie Log' })).toBeInTheDocument()
    })

    it('hides inner panel when open=false', () => {
      render(<LogFromRecipeSheet open={false} recipe={baseRecipe} onClose={noop} />)
      expect(screen.queryByRole('heading', { name: 'Log to Calorie Log' })).not.toBeInTheDocument()
    })
  })
})
