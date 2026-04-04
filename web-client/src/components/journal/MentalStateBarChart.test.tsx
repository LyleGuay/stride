import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MentalStateBarChart from './MentalStateBarChart'
import type { JournalMentalStateBar } from '../../types'

/* ─── Fixtures ───────────────────────────────────────────────────────── */

function makeBar(i: number, score: number | null): JournalMentalStateBar {
  return {
    label: `L${i}`,
    date:  `2026-04-${String(i + 1).padStart(2, '0')}`,
    score,
    entry_count: score !== null ? 2 : 0,
    emotions: score !== null ? ['happy'] : [],
  }
}

/* ─── Tests ──────────────────────────────────────────────────────────── */

describe('MentalStateBarChart', () => {
  it('renders empty state when bars array is empty', () => {
    render(<MentalStateBarChart bars={[]} range="week" onBarClick={() => {}} />)
    expect(screen.getByText('No entries yet')).toBeTruthy()
  })

  it('renders one hit-area rect per bar (data-testid="bar-N")', () => {
    const bars = [makeBar(0, 4.0), makeBar(1, null), makeBar(2, 2.0)]
    render(<MentalStateBarChart bars={bars} range="week" onBarClick={() => {}} />)
    expect(screen.getByTestId('bar-0')).toBeTruthy()
    expect(screen.getByTestId('bar-1')).toBeTruthy()
    expect(screen.getByTestId('bar-2')).toBeTruthy()
  })

  it('renders the correct total bar count for a week range', () => {
    const bars = Array.from({ length: 7 }, (_, i) => makeBar(i, i < 4 ? 3.0 : null))
    const { container } = render(
      <MentalStateBarChart bars={bars} range="week" onBarClick={() => {}} />,
    )
    const hitAreas = container.querySelectorAll('[data-testid^="bar-"]')
    expect(hitAreas.length).toBe(7)
  })

  it('renders the correct total bar count for 6m (26 bars)', () => {
    const bars = Array.from({ length: 26 }, (_, i) => makeBar(i, null))
    const { container } = render(
      <MentalStateBarChart bars={bars} range="6m" onBarClick={() => {}} />,
    )
    const hitAreas = container.querySelectorAll('[data-testid^="bar-"]')
    expect(hitAreas.length).toBe(26)
  })

  it('calls onBarClick with the correct bar when clicked', () => {
    const bars = [makeBar(0, 4.5), makeBar(1, 2.0), makeBar(2, null)]
    const onBarClick = vi.fn()
    render(<MentalStateBarChart bars={bars} range="week" onBarClick={onBarClick} />)

    fireEvent.click(screen.getByTestId('bar-1'))

    expect(onBarClick).toHaveBeenCalledOnce()
    // First arg is the bar object
    expect(onBarClick.mock.calls[0][0]).toEqual(bars[1])
    // Second arg is barCenterPct — a number in 0–100
    const pct = onBarClick.mock.calls[0][1] as number
    expect(pct).toBeGreaterThan(0)
    expect(pct).toBeLessThan(100)
  })

  it('uses gray fill for null-score (empty) bars', () => {
    const bars = [makeBar(0, null)]
    const { container } = render(
      <MentalStateBarChart bars={bars} range="week" onBarClick={() => {}} />,
    )
    // The visible bar rect (not the transparent hit area) should have the gray-200 fill
    const rects = container.querySelectorAll('rect[fill="#e5e7eb"]')
    expect(rects.length).toBeGreaterThan(0)
  })
})
