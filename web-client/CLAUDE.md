# web-client/CLAUDE.md

React 19 + Vite web app — the primary Stride frontend. See the root `CLAUDE.md` for project-wide conventions.

## Commands

```bash
npm run dev          # Vite dev server on :5173, proxies /api → :3000
npm run build        # tsc -b && vite build (type-check + production build)
npm run lint         # eslint
npm run typecheck    # tsc -b (type-check only, no bundle)
npm run test         # vitest run (one-shot)
npm run test:watch   # vitest in watch mode
npm run preview      # preview the production build
```

**Pre-commit invariant:** run `npm run build && npm run lint` before committing. Don't commit code that fails either.

## Architecture

- **React 19 + TypeScript + Vite 7 + Tailwind CSS 4.** Tailwind loaded via `@tailwindcss/vite`.
- **Router:** `react-router` v7 (config in `src/router.tsx`). Token-based auth guard in `src/components/RequireAuth.tsx`.
- **API client:** `src/api.ts`. All fetches funnel through `request<T>()` which attaches the JWT and parses JSON. Shared types come from `@stride/shared`.
- **PWA:** `vite-plugin-pwa` (`generateSW` mode, `autoUpdate`). Produces `sw.js` at build time.
- **Build SHA:** injected via `import.meta.env.VITE_BUILD_SHA` — set by Railway at Docker build (`VITE_BUILD_SHA` env) or falls back to the current git SHA locally.
- **Dev proxy:** Vite forwards `/api` to `http://localhost:3000` (override with `API_PORT` env — the E2E suite uses this).

**Component tree:** `AppShell.tsx` provides the desktop sidebar + mobile nav shell. Module pages live in `src/pages/` and their feature components live in `src/components/<module>/`. Per-module custom hooks are in `src/hooks/`.

## Platform policy

**Desktop + mobile web are both first-class.** The same codebase serves both, with layout adapted via Tailwind responsive prefixes. The main breakpoint split is `sm:` (640px). Examples:

- Desktop rows show hover-gated `···` menus; mobile shows them always (see `tasks-mobile.spec.ts`).
- Desktop has an inline add row (`InlineAddRow`); mobile uses a FAB + bottom sheet.

**Guidelines:**
- Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) rather than JS media-query hooks. Cheaper and less flicker.
- Hover is OK for progressive disclosure on desktop, but every primary action must also be reachable via tap.
- When rendering lists inside a `<table>`, the same row component renders on both; hide desktop-only columns with `hidden sm:table-cell`.

**Capacitor (Android)** is planned — see `plan/capacitor-mobile-plan.md` — but not yet integrated. The `mobile-client/` Expo scaffold is inactive. Until Capacitor lands, treat this as a responsive PWA only.

## Pages / features

One file per module page in `src/pages/`:

- `CalorieLog.tsx` — daily/weekly/progress tabs, item CRUD, recipe logging, favorites, ghost rows from meal plan
- `HabitsPage.tsx` + `HabitDetail.tsx` — habit logging with proportional levels (L1/L2/L3)
- `JournalPage.tsx` — timeline + Summary tab with Week/Month/6M/1Y/All ranges, mood/mental-state scoring, tags, calendar picker
- `TasksPage.tsx` — Today / Upcoming / All tabs, scheduled_date + deadline chips, recurrence, Complete-Forever
- `RecipeList.tsx` + `RecipeDetail.tsx` + `RecipeExecution.tsx` — recipe CRUD, AI generate/modify/copy/nutrition, step-by-step execution with a cook timer
- `MealPlanPage.tsx` — weekly grid with food/takeout/recipe entries, copy-from-last-week
- `Login.tsx`, `settings/` — auth + user settings (profile, TDEE, budget mode, weight log)

## Markdown

All multi-line description/body fields use a markdown-aware editor (the same one used by the journal). Never use a plain `<textarea>` for a description field. If you add a new module with a description field, reuse the journal's editor component.

## Testing

**Tools:** Vitest (Vite-native). `@testing-library/react` with `renderHook`. `msw` (Mock Service Worker) for hook tests — intercepts at the network level so real fetch logic runs.

**Test:**
- Pure utilities (`today`, `getMondayOf`, `shiftWeek`, TDEE helpers).
- Custom hooks (`useDailySummary`, `useMealPlanDay`, etc.) — loading state, error handling, refetch-on-deps-change.
- Components with non-trivial logic where bugs are non-obvious: form validation (`AddItemSheet` create vs edit), type/unit relationships, keyboard navigation (`InlineAddRow`), computed display thresholds (`DailySummary` budget bar), conditional rendering (ghost row show/hide).

**Skip:**
- Purely presentational components — if it just renders props into JSX, E2E covers it.
- Snapshot tests.
- "Renders without crashing."
- CSS classes or visual appearance.

Rule of thumb: ask "could this component behave incorrectly in a way that's hard to spot manually?" — if yes, write a test.

## Mobile testing caveats

- Responsive layout bugs (breakpoint-gated components, column hiding) are covered by the E2E `Mobile Chrome` project, which runs `*-mobile.spec.ts` files in a Pixel 7 viewport. See `e2e/CLAUDE.md` for details.
- True native-device UX (scrolling feel, keyboard avoiding, gesture nav) can only be verified on-device. This is not a current concern while Capacitor isn't integrated, but will matter once it is.
