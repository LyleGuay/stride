# @stride/shared

Shared domain types and pure utility functions used by both `web-client` and `mobile-client`. Nothing in here should depend on browser or React Native APIs — Node-compatible only.

## Exports

### Types

```ts
import type {
  CalorieLogItem,
  CalorieLogUserSettings,
  DailySummary,
  WeekDaySummary,
  AISuggestion,
} from '@stride/shared'
```

These mirror the Go structs in `go-api/` and the PostgreSQL schema. If the API response shape changes, update here first and fix the compile errors in both clients.

### Date utilities

```ts
import { todayString, getMondayOf, shiftWeek, formatWeekRange, dayLabel, dayNumber } from '@stride/shared'
```

All functions work in **local time** (not UTC) to avoid date shifts for users east of UTC.

| Function | Description |
|---|---|
| `todayString()` | Today as `"YYYY-MM-DD"` |
| `getMondayOf(date)` | Monday of the week containing `date` |
| `shiftWeek(monday, n)` | Shift a Monday string by ±n weeks |
| `formatWeekRange(monday)` | `"Feb 9 – Feb 15"` from a Monday string |
| `dayLabel(date)` | 3-letter weekday abbreviation (`"Mon"`) |
| `dayNumber(date)` | Day-of-month number |

## Development

```bash
pnpm --filter @stride/shared run test   # run tests
```

Tests live in `src/utils/dates.test.ts`. No build step — both clients consume the TypeScript source directly via the `main`/`types` fields pointing to `src/index.ts`.
