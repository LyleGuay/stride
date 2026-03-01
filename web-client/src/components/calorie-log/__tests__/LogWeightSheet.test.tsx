import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import LogWeightSheet from '../LogWeightSheet'
import type { WeightEntry } from '../../../types'

// Pin "today" so date defaults are deterministic
const FIXED_NOW = new Date('2026-03-01T12:00:00Z').getTime()
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW) })
afterEach(() => { vi.useRealTimers() })

const noop = vi.fn()

/* ─── Helpers ────────────────────────────────────────────────────────────── */

// A minimal existing weight entry (in lbs, as stored)
const mockEntry: WeightEntry = {
  id: 1,
  user_id: 1,
  date: '2026-02-15',
  weight_lbs: 176.4,  // ≈80 kg
  created_at: '2026-02-15T12:00:00Z',
}

/* ─── Tests ──────────────────────────────────────────────────────────────── */

describe('LogWeightSheet', () => {
  describe('open/close behaviour', () => {
    it('renders sheet content when open=true', () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} units="imperial" />)
      expect(screen.getByRole('heading', { name: 'Log Weight' })).toBeInTheDocument()
    })

    it('does not remove sheet from DOM when open=false, but it is visually hidden', () => {
      const { container } = render(<LogWeightSheet open={false} onClose={noop} onSave={noop} units="imperial" />)
      // The backdrop has pointer-events-none when closed — check the outer div
      const backdrop = container.firstChild as HTMLElement
      expect(backdrop.className).toContain('pointer-events-none')
    })
  })

  describe('default state (create mode)', () => {
    it("defaults date field to today's date", () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} units="imperial" />)
      const dateInput = screen.getByLabelText('Date') as HTMLInputElement
      expect(dateInput.value).toBe('2026-03-01')
    })

    it('shows "Log Weight" title in create mode', () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} units="imperial" />)
      expect(screen.getByRole('heading', { name: 'Log Weight' })).toBeInTheDocument()
    })

    it('shows the correct unit label (lbs) for imperial', () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} units="imperial" />)
      expect(screen.getByText(/Weight \(lbs\)/)).toBeInTheDocument()
    })

    it('shows the correct unit label (kg) for metric', () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} units="metric" />)
      expect(screen.getByText(/Weight \(kg\)/)).toBeInTheDocument()
    })
  })

  describe('save button validation', () => {
    it('save button is disabled when weight is empty', () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} units="imperial" />)
      expect(screen.getByRole('button', { name: 'Save Weight' })).toBeDisabled()
    })

    it('save button is enabled when a valid weight is entered', async () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} units="imperial" />)
      const weightInput = screen.getByPlaceholderText('e.g. 165.5')
      fireEvent.change(weightInput, { target: { value: '170' } })
      expect(screen.getByRole('button', { name: 'Save Weight' })).not.toBeDisabled()
    })

    it('save button is disabled when weight is 0', () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} units="imperial" />)
      const weightInput = screen.getByPlaceholderText('e.g. 165.5')
      fireEvent.change(weightInput, { target: { value: '0' } })
      expect(screen.getByRole('button', { name: 'Save Weight' })).toBeDisabled()
    })
  })

  describe('save callback', () => {
    it('calls onSave with the entered date and weight (lbs) for imperial units', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined)
      render(<LogWeightSheet open={true} onClose={noop} onSave={onSave} units="imperial" />)

      const weightInput = screen.getByPlaceholderText('e.g. 165.5')
      fireEvent.change(weightInput, { target: { value: '175.0' } })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save Weight' }))
      })

      expect(onSave).toHaveBeenCalledOnce()
      expect(onSave).toHaveBeenCalledWith('2026-03-01', 175.0)
    })

    it('converts kg to lbs before calling onSave for metric units', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined)
      render(<LogWeightSheet open={true} onClose={noop} onSave={onSave} units="metric" />)

      const weightInput = screen.getByPlaceholderText('e.g. 75.5')
      fireEvent.change(weightInput, { target: { value: '80' } })  // 80 kg

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save Weight' }))
      })

      expect(onSave).toHaveBeenCalledOnce()
      // 80 kg × 2.20462 ≈ 176.4 lbs
      const [, calledLbs] = onSave.mock.calls[0]
      expect(calledLbs).toBeCloseTo(176.37, 0)
    })
  })

  describe('close button', () => {
    it('calls onClose without calling onSave when close button is clicked', () => {
      const onSave = vi.fn()
      const onClose = vi.fn()
      render(<LogWeightSheet open={true} onClose={onClose} onSave={onSave} units="imperial" />)

      // The close button is hidden on mobile but visible on desktop (sm:flex)
      // Find it by aria-label
      const closeBtn = screen.getByRole('button', { name: 'Close' })
      fireEvent.click(closeBtn)

      expect(onClose).toHaveBeenCalledOnce()
      expect(onSave).not.toHaveBeenCalled()
    })
  })

  describe('edit mode', () => {
    it('shows "Edit Weight" title when editEntry is provided', () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} editEntry={mockEntry} units="imperial" />)
      expect(screen.getByRole('heading', { name: 'Edit Weight' })).toBeInTheDocument()
    })

    it('pre-fills date field from editEntry.date', () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} editEntry={mockEntry} units="imperial" />)
      const dateInput = screen.getByLabelText('Date') as HTMLInputElement
      expect(dateInput.value).toBe('2026-02-15')
    })

    it('pre-fills weight in lbs for imperial units', () => {
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} editEntry={mockEntry} units="imperial" />)
      const weightInput = screen.getByPlaceholderText('e.g. 165.5') as HTMLInputElement
      expect(parseFloat(weightInput.value)).toBeCloseTo(176.4, 0)
    })

    it('pre-fills weight converted to kg for metric units', () => {
      // 176.4 lbs ÷ 2.20462 ≈ 80.0 kg
      render(<LogWeightSheet open={true} onClose={noop} onSave={noop} editEntry={mockEntry} units="metric" />)
      const weightInput = screen.getByPlaceholderText('e.g. 75.5') as HTMLInputElement
      expect(parseFloat(weightInput.value)).toBeCloseTo(80.0, 0)
    })

    it('calls onSave with "Save Changes" button', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined)
      render(<LogWeightSheet open={true} onClose={noop} onSave={onSave} editEntry={mockEntry} units="imperial" />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
      })

      expect(onSave).toHaveBeenCalledOnce()
    })
  })
})
