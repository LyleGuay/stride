import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProgressView from '../ProgressView'
import type { ProgressViewProps } from '../ProgressView'
import type { ProgressResponse } from '../../../types'

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const noop = async () => {}

// Minimal valid ProgressResponse with one tracked day
const mockProgressData: ProgressResponse = {
  days: [
    {
      date: '2026-03-01',
      calorie_budget: 2000,
      calories_food: 1500,
      calories_exercise: 200,
      net_calories: 1300,
      calories_left: 700,
      protein_g: 80,
      carbs_g: 150,
      fat_g: 50,
      has_data: true,
    },
  ],
  stats: {
    days_tracked: 1,
    days_on_budget: 1,
    avg_calories_food: 1500,
    avg_calories_exercise: 200,
    avg_net_calories: 1300,
    total_calories_left: 700,
  },
}

function defaultProps(overrides: Partial<ProgressViewProps> = {}): ProgressViewProps {
  return {
    range: 'month',
    onRangeChange: noop as unknown as (r: ProgressViewProps['range']) => void,
    progressData: mockProgressData,
    weightEntries: [],
    loading: false,
    error: null,
    rangeStart: '2026-03-01',
    rangeEnd: '2026-03-31',
    onLogWeight: noop,
    onUpdateWeight: noop as unknown as (id: number, date: string, lbs: number) => Promise<void>,
    onDeleteWeight: noop as unknown as (id: number) => Promise<void>,
    units: 'imperial',
    ...overrides,
  }
}

/* ─── Tests ──────────────────────────────────────────────────────────────── */

describe('ProgressView', () => {
  describe('range selector', () => {
    it('renders all five range buttons', () => {
      render(<ProgressView {...defaultProps()} />)
      expect(screen.getByRole('button', { name: '1M' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '6M' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'YTD' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '1Y' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    })

    it('calls onRangeChange with "ytd" when "YTD" is clicked', () => {
      const onRangeChange = vi.fn()
      render(<ProgressView {...defaultProps({ onRangeChange })} />)
      fireEvent.click(screen.getByRole('button', { name: 'YTD' }))
      expect(onRangeChange).toHaveBeenCalledWith('ytd')
    })

    it('calls onRangeChange with "all" when "All" is clicked', () => {
      const onRangeChange = vi.fn()
      render(<ProgressView {...defaultProps({ onRangeChange })} />)
      fireEvent.click(screen.getByRole('button', { name: 'All' }))
      expect(onRangeChange).toHaveBeenCalledWith('all')
    })

    it('calls onRangeChange with "month" when "1M" is clicked', () => {
      const onRangeChange = vi.fn()
      render(<ProgressView {...defaultProps({ range: 'ytd', onRangeChange })} />)
      fireEvent.click(screen.getByRole('button', { name: '1M' }))
      expect(onRangeChange).toHaveBeenCalledWith('month')
    })

    it('calls onRangeChange with "6months" when "6M" is clicked', () => {
      const onRangeChange = vi.fn()
      render(<ProgressView {...defaultProps({ onRangeChange })} />)
      fireEvent.click(screen.getByRole('button', { name: '6M' }))
      expect(onRangeChange).toHaveBeenCalledWith('6months')
    })

    it('calls onRangeChange with "lastyear" when "1Y" is clicked', () => {
      const onRangeChange = vi.fn()
      render(<ProgressView {...defaultProps({ onRangeChange })} />)
      fireEvent.click(screen.getByRole('button', { name: '1Y' }))
      expect(onRangeChange).toHaveBeenCalledWith('lastyear')
    })
  })

  describe('loading state', () => {
    it('renders a spinner when loading=true', () => {
      render(<ProgressView {...defaultProps({ loading: true })} />)
      // Chart content is absent but Period Summary card is still rendered
      expect(screen.queryByText('Calories')).not.toBeInTheDocument()
    })

    it('Period Summary card (with range selector) is visible during loading', () => {
      render(<ProgressView {...defaultProps({ loading: true })} />)
      expect(screen.getByText('Period Summary')).toBeInTheDocument()
      // Range pills still accessible
      expect(screen.getByRole('button', { name: '1M' })).toBeInTheDocument()
    })

    it('does not render stats body or chart cards when loading', () => {
      render(<ProgressView {...defaultProps({ loading: true })} />)
      expect(screen.queryByText('Avg Daily Net')).not.toBeInTheDocument()
      expect(screen.queryByText('Calories')).not.toBeInTheDocument()
      expect(screen.queryByText('Weight')).not.toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows error message when error is set', () => {
      render(<ProgressView {...defaultProps({ error: 'Network error' })} />)
      expect(screen.getByText('Failed to load progress data')).toBeInTheDocument()
    })

    it('Period Summary card (with range selector) is visible during error', () => {
      render(<ProgressView {...defaultProps({ error: 'oops' })} />)
      expect(screen.getByText('Period Summary')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'YTD' })).toBeInTheDocument()
    })

    it('does not render stats body or chart cards when in error state', () => {
      render(<ProgressView {...defaultProps({ error: 'oops' })} />)
      expect(screen.queryByText('Avg Daily Net')).not.toBeInTheDocument()
      expect(screen.queryByText('Calories')).not.toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows no-data placeholder when progressData has no days', () => {
      const emptyData: ProgressResponse = {
        days: [],
        stats: { days_tracked: 0, days_on_budget: 0, avg_calories_food: 0, avg_calories_exercise: 0, avg_net_calories: 0, total_calories_left: 0 },
      }
      render(<ProgressView {...defaultProps({ progressData: emptyData })} />)
      expect(screen.getByText('No data for this period')).toBeInTheDocument()
    })

    it('shows stats placeholder when progressData is null', () => {
      render(<ProgressView {...defaultProps({ progressData: null })} />)
      const placeholders = screen.getAllByText('No data for this period')
      expect(placeholders.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('data loaded', () => {
    it('renders the Calories chart card', () => {
      render(<ProgressView {...defaultProps()} />)
      expect(screen.getByText('Calories')).toBeInTheDocument()
    })

    it('renders the Period Summary card with calorie stats', () => {
      render(<ProgressView {...defaultProps()} />)
      expect(screen.getByText('Period Summary')).toBeInTheDocument()
      expect(screen.getByText('Avg Daily Net')).toBeInTheDocument()
      expect(screen.getByText('Days Tracked')).toBeInTheDocument()
    })

    it('renders the Weight Change / Start / End stat labels', () => {
      render(<ProgressView {...defaultProps()} />)
      expect(screen.getByText('Weight Change')).toBeInTheDocument()
      expect(screen.getByText('Start Weight')).toBeInTheDocument()
      expect(screen.getByText('End Weight')).toBeInTheDocument()
    })

    it('renders the Weight card with Graph/Table toggle', () => {
      render(<ProgressView {...defaultProps()} />)
      // The "Weight" heading is an h3 inside the card; use role to avoid matching FAB label
      expect(screen.getByRole('heading', { name: 'Weight' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /graph/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /table/i })).toBeInTheDocument()
    })
  })
})
