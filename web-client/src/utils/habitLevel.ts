/* habitLevel — level computation utilities for the habit tracker.
   Implements the proportional level formula used across the Today and Progress views. */

import type { Habit, HabitWithLog } from '../types'

/* ─── Helpers ───────────────────────────────────────────────────────────── */

// Returns the max level tier defined for a habit (1, 2, or 3).
export function getHabitMaxLevel(habit: Habit): 1 | 2 | 3 {
  if (habit.level3_label) return 3
  if (habit.level2_label) return 2
  return 1
}

/* ─── Level result type ─────────────────────────────────────────────────── */

export interface LevelResult {
  score: number    // sum of logged levels in scope
  possible: number // sum of max possible levels in scope
  level: number    // proportional level = (score/possible) × playerMax
}

/* ─── Daily level ───────────────────────────────────────────────────────── */

// Computes the daily level score from today's daily habits only.
// Each habit contributes log.level to score and maxLevel to possible.
// playerMax is the highest max level tier across all daily habits.
// Returns null if there are no daily habits.
export function computeDailyLevel(dailyHabits: HabitWithLog[]): LevelResult | null {
  if (dailyHabits.length === 0) return null

  let score = 0
  let possible = 0
  let playerMax = 0

  for (const h of dailyHabits) {
    const maxLevel = getHabitMaxLevel(h)
    if (maxLevel > playerMax) playerMax = maxLevel
    score += h.log?.level ?? 0
    possible += maxLevel
  }

  if (possible === 0) return { score: 0, possible: 0, level: 0 }

  return { score, possible, level: (score / possible) * playerMax }
}

/* ─── Weekly level ──────────────────────────────────────────────────────── */

// Computes the weekly level score across all habits for Mon–Sun.
//   Daily habits: contribute week_level_sum / (7 × maxLevel)
//   Weekly habits: contribute min(week_level_sum, target×max) / (target × maxLevel)
// playerMax is the highest max level tier across all habits.
// Returns null if there are no habits.
export function computeWeeklyLevel(habits: HabitWithLog[]): LevelResult | null {
  if (habits.length === 0) return null

  let score = 0
  let possible = 0
  let playerMax = 0

  for (const h of habits) {
    const maxLevel = getHabitMaxLevel(h)
    if (maxLevel > playerMax) playerMax = maxLevel

    if (h.frequency === 'daily') {
      score += h.week_level_sum
      possible += 7 * maxLevel
    } else {
      // Weekly habit: server already caps week_level_sum at target × maxLevel.
      const target = h.weekly_target ?? 1
      score += Math.min(h.week_level_sum, target * maxLevel)
      possible += target * maxLevel
    }
  }

  if (possible === 0) return { score: 0, possible: 0, level: 0 }

  return { score, possible, level: (score / possible) * playerMax }
}
