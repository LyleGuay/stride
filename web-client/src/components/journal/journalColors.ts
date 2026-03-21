import type { JournalTag } from '../../types'
import { EMOTION_TAGS } from '../../types'

/* ─── Tag display labels ─────────────────────────────────────────────── */

// Explicit overrides for tags that need formatting (snake_case values).
// All other tags fall back to title-casing the value (e.g. 'happy' → 'Happy').
const TAG_LABEL_OVERRIDES: Partial<Record<JournalTag, string>> = {
  open_loop:    'Open Loop',
  life_update:  'Life Update',
  well_rested:  'Well Rested',
  stomach_ache: 'Stomach Ache',
  brain_fog:    'Brain Fog',
}

// tagLabel returns the human-readable display label for a tag.
export function tagLabel(tag: JournalTag): string {
  if (TAG_LABEL_OVERRIDES[tag]) return TAG_LABEL_OVERRIDES[tag]!
  return tag.charAt(0).toUpperCase() + tag.slice(1)
}

/* ─── Emotion colors ─────────────────────────────────────────────────── */

// EMOTION_COLORS maps emotion tags to their hex accent colors.
// Entry-type and condition tags have no color entry here.
export const EMOTION_COLORS: Partial<Record<JournalTag, string>> = {
  excited:     '#fbbf24',  // amber-400
  happy:       '#4ade80',  // green-400
  motivated:   '#4ade80',  // green-400
  energized:   '#2dd4bf',  // teal-400
  calm:        '#67e8f9',  // cyan-300
  content:     '#86efac',  // green-300
  grateful:    '#a7f3d0',  // emerald-200
  well_rested: '#86efac',  // green-300
  hopeful:     '#6ee7b7',  // emerald-300
  proud:       '#fde68a',  // amber-200
  neutral:     '#94a3b8',  // slate-400
  confused:    '#fcd34d',  // amber-300
  bored:       '#93c5fd',  // blue-300
  unmotivated: '#cbd5e1',  // slate-300
  stressed:    '#f97316',  // orange-500
  annoyed:     '#fb923c',  // orange-400
  lonely:      '#93c5fd',  // blue-300
  anxious:     '#a78bfa',  // violet-400
  overwhelmed: '#c084fc',  // purple-400
  low:         '#a78bfa',  // violet-400
  sad:         '#fb7185',  // rose-400
  angry:       '#f87171',  // red-400
  frustrated:  '#fb923c',  // orange-400
  depressed:   '#818cf8',  // indigo-400
}

// ENTRY_TYPE_EMOJIS maps each entry-type tag to a representative emoji.
export const ENTRY_TYPE_EMOJIS: Partial<Record<JournalTag, string>> = {
  thoughts:    '💭',
  idea:        '💡',
  venting:     '😤',
  open_loop:   '🔄',
  reminder:    '🔔',
  life_update: '📰',
  feelings:    '❤️',
}

// EMOTION_EMOJIS maps each emotion tag to a representative emoji for use in chip labels.
export const EMOTION_EMOJIS: Partial<Record<JournalTag, string>> = {
  excited:     '🤩',
  happy:       '😊',
  motivated:   '💪',
  energized:   '⚡',
  calm:        '😌',
  content:     '🙂',
  grateful:    '🙏',
  well_rested: '😴',
  hopeful:     '🌱',
  proud:       '🏆',
  neutral:     '😐',
  confused:    '😕',
  bored:       '😑',
  unmotivated: '😕',
  stressed:    '😤',
  annoyed:     '😒',
  lonely:      '🌧️',
  anxious:     '😰',
  overwhelmed: '😩',
  low:         '😞',
  sad:         '😢',
  angry:       '😠',
  frustrated:  '😤',
  depressed:   '😔',
}

// CONDITION_COLORS maps physical condition tags to their amber/orange accent colors.
export const CONDITION_COLORS: Partial<Record<JournalTag, string>> = {
  stomach_ache: '#f97316',  // orange-500
  nausea:       '#fb923c',  // orange-400
  brain_fog:    '#d1d5db',  // gray-300
  fatigue:      '#94a3b8',  // slate-400
  tired:        '#94a3b8',  // slate-400
  sick:         '#86efac',  // green-300 (muted/desaturated feel)
}

// CONDITION_EMOJIS maps each condition tag to a representative emoji.
export const CONDITION_EMOJIS: Partial<Record<JournalTag, string>> = {
  stomach_ache: '🤢',
  nausea:       '🤮',
  brain_fog:    '🌫️',
  fatigue:      '🥱',
  tired:        '😴',
  sick:         '🤒',
}

const FALLBACK_COLOR = '#e2e8f0' // slate-200 — used when no emotion tags are present

// emotionGradient returns a CSS background value for the card accent bar.
// Filters tags to emotion tags only, then:
//   - single emotion → solid hex color
//   - multiple emotions → linear-gradient(to bottom, color1, color2, ...)
//   - no emotion tags → fallback slate-200
export function emotionGradient(tags: JournalTag[]): string {
  const emotionColors = tags
    .filter(t => EMOTION_TAGS.has(t))
    .map(t => EMOTION_COLORS[t])
    .filter((c): c is string => !!c)

  if (emotionColors.length === 0) return FALLBACK_COLOR
  if (emotionColors.length === 1) return emotionColors[0]
  return `linear-gradient(to bottom, ${emotionColors.join(', ')})`
}
