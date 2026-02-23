/* Shared constants for the calorie log.
   Single source of truth for values duplicated across AddItemSheet and InlineAddRow. */

// ITEM_TYPES is the canonical list of calorie log item types.
export const ITEM_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'exercise'] as const

// ALL_UNITS covers all supported unit-of-measure options.
export const ALL_UNITS = ['each', 'g', 'miles', 'km', 'minutes'] as const

// EXERCISE_UNITS is the subset shown when the item type is exercise.
export const EXERCISE_UNITS = ['each', 'minutes', 'miles', 'km'] as const
