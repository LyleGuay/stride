/* Canonical calorie log constants — single source of truth for item types,
   unit-of-measure lists, and display labels used across web and mobile clients. */

// ITEM_TYPES is the full set of calorie log item types, in display order.
export const ITEM_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'exercise'] as const

// FOOD_UNITS is the set of UOM values shown for food entries.
export const FOOD_UNITS = ['each', 'g', 'serving'] as const

// EXERCISE_UNITS is the set of UOM values shown for exercise entries.
export const EXERCISE_UNITS = ['each', 'minutes', 'miles', 'km', 'reps'] as const

// MEAL_PLAN_MEAL_TYPES is the ordered list of meal types shown in the meal planning grid.
// Exercise is excluded — meal planning only covers food meal slots.
export const MEAL_PLAN_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealPlanMealType = typeof MEAL_PLAN_MEAL_TYPES[number]

// UNIT_LABELS maps DB UOM values (lowercase) to human-readable display strings.
export const UNIT_LABELS: Record<string, string> = {
  each: 'Each',
  g: 'g',
  serving: 'Serving',
  miles: 'Miles',
  km: 'km',
  minutes: 'Minutes',
  reps: 'Reps',
}
