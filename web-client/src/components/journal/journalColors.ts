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

/* ─── TAG_META — single source of truth for emoji + color per tag ────── */

// TAG_META is the single source of truth for emoji and color for every emotion
// and condition tag. Used everywhere a tag needs visual representation: chips,
// bar charts, tooltips, calendar dots.
// Entry-type tags are not included here — they have no color, only an emoji
// (see ENTRY_TYPE_EMOJIS below).
// Colors are grouped by score band so chips visually communicate valence:
//   Positive (delta ≥ 0.75)  → green / teal / amber
//   Neutral  (|delta| < 0.75) → blue / gray / slate
//   Negative (delta ≤ -0.75) → red / orange / purple
// Within each band, slight tint variations reflect sub-group delta weight.
export const TAG_META: Partial<Record<JournalTag, { emoji: string; color: string }>> = {
  // ── Positive emotions (delta ≥ 0.75) ─ green / teal / amber family ────
  excited:     { emoji: '🤩', color: '#fbbf24' },  // amber-400  (+1.00)
  happy:       { emoji: '😊', color: '#4ade80' },  // green-400  (+1.00)
  well_rested: { emoji: '😴', color: '#34d399' },  // emerald-400 (+1.00)
  proud:       { emoji: '🏆', color: '#facc15' },  // yellow-400 (+0.75)
  motivated:   { emoji: '💪', color: '#86efac' },  // green-300  (+0.75)
  energized:   { emoji: '⚡', color: '#2dd4bf' },  // teal-400   (+0.75)
  // ── Neutral emotions (|delta| < 0.75) ─ blue / gray / slate family ────
  calm:        { emoji: '😌', color: '#67e8f9' },  // cyan-300   (+0.50)
  content:     { emoji: '🙂', color: '#93c5fd' },  // blue-300   (+0.50)
  grateful:    { emoji: '🙏', color: '#a5b4fc' },  // indigo-300 (+0.50)
  hopeful:     { emoji: '🌱', color: '#5eead4' },  // teal-300   (+0.50)
  neutral:     { emoji: '😐', color: '#94a3b8' },  // slate-400  ( 0.00)
  confused:    { emoji: '😕', color: '#d6d3d1' },  // stone-300  (-0.50)
  bored:       { emoji: '😑', color: '#d1d5db' },  // gray-300   (-0.50)
  unmotivated: { emoji: '😕', color: '#cbd5e1' },  // slate-300  (-0.50)
  annoyed:     { emoji: '😒', color: '#fdba74' },  // orange-300 (-0.50)
  lonely:      { emoji: '🌧️', color: '#93c5fd' },  // blue-300   (-0.50)
  // ── Negative emotions (delta ≤ -0.75) ─ red / orange / purple family ─
  low:         { emoji: '😞', color: '#c4b5fd' },  // violet-300 (-0.75)
  sad:         { emoji: '😢', color: '#fb7185' },  // rose-400   (-1.00)
  overwhelmed: { emoji: '😩', color: '#c084fc' },  // purple-400 (-1.00)
  angry:       { emoji: '😠', color: '#f87171' },  // red-400    (-1.00)
  frustrated:  { emoji: '😤', color: '#fb923c' },  // orange-400 (-1.00)
  stressed:    { emoji: '😤', color: '#f97316' },  // orange-500 (-1.00)
  anxious:     { emoji: '😰', color: '#a78bfa' },  // violet-400 (-1.00)
  depressed:   { emoji: '😔', color: '#e879f9' },  // fuchsia-400 (-1.25)
  // ── Conditions (all negative) ─ red / orange / purple family ──────────
  tired:        { emoji: '😴', color: '#94a3b8' },  // slate-400  (-0.75)
  brain_fog:    { emoji: '🌫️', color: '#c4b5fd' },  // violet-300 (-0.75)
  fatigue:      { emoji: '🥱', color: '#94a3b8' },  // slate-400  (-0.75)
  sick:         { emoji: '🤒', color: '#f87171' },  // red-400    (-1.25)
  stomach_ache: { emoji: '🤢', color: '#ef4444' },  // red-500    (-1.25)
  nausea:       { emoji: '🤮', color: '#fb923c' },  // orange-400 (-1.25)
}

// ENTRY_TYPE_EMOJIS maps each entry-type tag to a representative emoji.
// Entry types have no color, so they are not included in TAG_META.
export const ENTRY_TYPE_EMOJIS: Partial<Record<JournalTag, string>> = {
  thoughts:    '💭',
  idea:        '💡',
  venting:     '😤',
  open_loop:   '🔄',
  reminder:    '🔔',
  life_update: '📰',
  feelings:    '❤️',
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
    .map(t => TAG_META[t]?.color)
    .filter((c): c is string => !!c)

  if (emotionColors.length === 0) return FALLBACK_COLOR
  if (emotionColors.length === 1) return emotionColors[0]
  return `linear-gradient(to bottom, ${emotionColors.join(', ')})`
}
