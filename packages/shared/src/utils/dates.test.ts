import { describe, it, expect } from 'vitest'
import { todayString, getMondayOf, shiftWeek, formatWeekRange } from './dates'

describe('todayString', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = todayString()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns today in local time', () => {
    const d = new Date()
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(todayString()).toBe(expected)
  })
})

describe('getMondayOf', () => {
  it('returns same day when input is Monday', () => {
    // Feb 16, 2026 is a Monday
    expect(getMondayOf('2026-02-16')).toBe('2026-02-16')
  })

  it('returns previous Monday when input is Sunday', () => {
    // Feb 22, 2026 is a Sunday — Monday is Feb 16
    expect(getMondayOf('2026-02-22')).toBe('2026-02-16')
  })

  it('returns previous Monday when input is Wednesday', () => {
    // Feb 18, 2026 is a Wednesday — Monday is Feb 16
    expect(getMondayOf('2026-02-18')).toBe('2026-02-16')
  })

  it('crosses month boundary correctly', () => {
    // Feb 1, 2026 is a Sunday — previous Monday is Jan 26
    expect(getMondayOf('2026-02-01')).toBe('2026-01-26')
  })

  it('handles Saturday correctly', () => {
    // Feb 21, 2026 is a Saturday — Monday is Feb 16
    expect(getMondayOf('2026-02-21')).toBe('2026-02-16')
  })
})

describe('shiftWeek', () => {
  it('advances by 1 week', () => {
    expect(shiftWeek('2026-02-16', 1)).toBe('2026-02-23')
  })

  it('goes back by 1 week', () => {
    expect(shiftWeek('2026-02-16', -1)).toBe('2026-02-09')
  })

  it('crosses month boundary when going forward', () => {
    expect(shiftWeek('2026-02-23', 1)).toBe('2026-03-02')
  })

  it('crosses month boundary when going back', () => {
    expect(shiftWeek('2026-02-02', -1)).toBe('2026-01-26')
  })
})

describe('formatWeekRange', () => {
  it('formats a standard week', () => {
    // Feb 16–22, 2026
    const result = formatWeekRange('2026-02-16')
    expect(result).toContain('Feb 16')
    expect(result).toContain('Feb 22')
  })

  it('formats a range that spans two months', () => {
    // Jan 26 – Feb 1
    const result = formatWeekRange('2026-01-26')
    expect(result).toContain('Jan 26')
    expect(result).toContain('Feb 1')
  })
})
