import { describe, it, expect } from 'vitest'
import { EMOTION_COLORS, emotionGradient, tagLabel } from './journalColors'
import { EMOTION_TAGS } from '../../types'
import type { JournalTag } from '../../types'

describe('emotionGradient', () => {
  it('returns a solid hex for a single emotion tag', () => {
    const result = emotionGradient(['happy'])
    expect(result).toBe('#4ade80')
    expect(result).not.toContain('gradient')
  })

  it('ignores entry-type tags and returns solid hex for the one emotion', () => {
    const result = emotionGradient(['happy', 'thoughts'])
    expect(result).toBe('#4ade80')
    expect(result).not.toContain('gradient')
  })

  it('returns a gradient containing both colors for two emotion tags', () => {
    const result = emotionGradient(['happy', 'anxious'])
    expect(result).toContain('#4ade80')
    expect(result).toContain('#a78bfa')
    expect(result).toContain('gradient')
  })

  it('returns the fallback color when no emotion tags are present', () => {
    const result = emotionGradient(['thoughts', 'idea'] as JournalTag[])
    expect(result).toBe('#e2e8f0')
  })

  it('returns the fallback color for an empty tags array', () => {
    expect(emotionGradient([])).toBe('#e2e8f0')
  })
})

describe('EMOTION_COLORS', () => {
  it('every emotion tag has a defined non-empty color', () => {
    for (const tag of EMOTION_TAGS) {
      const color = EMOTION_COLORS[tag]
      expect(color, `EMOTION_COLORS["${tag}"] should be defined`).toBeTruthy()
      expect(color!.length, `EMOTION_COLORS["${tag}"] should be non-empty`).toBeGreaterThan(0)
    }
  })
})

describe('tagLabel', () => {
  it('returns "Open Loop" for open_loop', () => {
    expect(tagLabel('open_loop')).toBe('Open Loop')
  })

  it('returns "Life Update" for life_update', () => {
    expect(tagLabel('life_update')).toBe('Life Update')
  })

  it('title-cases single-word tags', () => {
    expect(tagLabel('happy')).toBe('Happy')
    expect(tagLabel('excited')).toBe('Excited')
    expect(tagLabel('thoughts')).toBe('Thoughts')
  })
})
