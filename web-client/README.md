# web-client

React frontend for Stride. Built with Vite and configured as a PWA.

## Stack

- **React 19** + **TypeScript**
- **Vite 7** — dev server and bundler
- **Tailwind CSS 4** — utility-first styling
- **react-router 7** — client-side routing
- **vite-plugin-pwa** — PWA manifest and service worker
- **Vitest** + **@testing-library/react** + **msw** — unit and hook tests

## Commands

```bash
npm run dev        # Vite dev server with HMR (localhost:5173, proxies /api → localhost:3000)
npm run build      # TypeScript check + production build → dist/
npm run lint       # ESLint
npm run preview    # Preview the production build locally
npm run test       # Run unit tests (Vitest, single run)
npm run test:watch # Run unit tests in watch mode
```

## Project layout

```
src/
  main.tsx              # App entry point — mounts <Router> inside <ErrorBoundary>
  router.tsx            # Route definitions and RequireAuth guard
  api.ts                # Typed fetch wrappers for all API endpoints
  types.ts              # Shared TypeScript interfaces (CalorieLogItem, DailySummary, etc.)
  constants.ts          # Shared constants (ITEM_TYPES, ALL_UNITS, EXERCISE_UNITS)
  components/
    RequireAuth.tsx     # Redirects unauthenticated users to /login
    ErrorBoundary.tsx   # React error boundary — catches render errors
    calorie-log/        # Calorie log UI components
      DailySummary.tsx  # Calorie totals bar (budget, eaten, remaining, pace)
      WeeklySummary.tsx # 7-day bar chart (presentational)
      AddItemSheet.tsx  # Slide-up sheet for adding/editing an item
      InlineAddRow.tsx  # Inline row for quick-adding items to the log
  hooks/
    useDailySummary.ts  # Hook for fetching daily summary data
  pages/
    Login.tsx           # Login page
    CalorieLog.tsx      # Main calorie log page — orchestrates data fetching and state
    Settings.tsx        # User settings (TDEE inputs, calorie budget)
  utils/
    dates.ts            # Date utilities: todayString, getMondayOf, shiftWeek, etc.
    dates.test.ts       # Unit tests for date utilities
```

## Auth

Token-based. On successful login the API returns a token stored in `localStorage`. The `RequireAuth` component checks for its presence and redirects to `/login` if missing. The token is sent as an `Authorization: Bearer <token>` header by `api.ts`.

## Dev proxy

The Vite dev server proxies all `/api` requests to `localhost:3000` (the Go API). Configured in `vite.config.ts`. No CORS setup needed in development.

## Building for production

```bash
npm run build
```

Outputs to `dist/`. The Go API embeds this directory at build time to serve the frontend as a single binary — copy `dist/` into `go-api/static/` before running `go build` in the API.
