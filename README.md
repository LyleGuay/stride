# Stride

A personal life & productivity dashboard — habits, tasks, journal, calorie logging, meal planning, recipes.

**This is a personal hobby project built for one user (me).** There is no multi-tenancy roadmap, no design-by-committee, and no requirement to optimize for hypothetical future users. Decisions are made for the current use case.

## Features

- **Calorie Log** — daily/weekly/progress views, AI-powered nutrition + exercise suggestions, favorites, weight tracking, TDEE-based budget auto-compute.
- **Recipes** — CRUD + AI generate/modify/copy/nutrition, step-by-step execution with cook timer.
- **Habits** — proportional level logging (L1/L2/L3), weekly progress, streaks.
- **Journal** — daily entries (Markdown), mood + mental-state scoring, tags, Summary tab with range pills.
- **Tasks** — Today/Upcoming/All tabs, scheduled_date + deadline, recurrence, Complete-Forever.
- **Meal Planning** — weekly grid with food/takeout/recipe entries, copy-from-last-week, ghost rows in the calorie log for planned-but-unlogged items.

## Structure

```
stride/
  go-api/           — Go backend (Gin + PostgreSQL)
  web-client/       — React web app (responsive — desktop + mobile web)
  e2e/              — Playwright E2E suite
  packages/
    shared/         — Shared TypeScript types and utilities
  mobile-client/    — Expo React Native scaffold (inactive)
  db/migrations/    — SQL migrations (run via go-api/cmd/migrate)
```

Each folder has its own `CLAUDE.md` with detailed agent guidance. This README is the human-oriented overview.

## Platform Strategy

**`web-client` is a responsive PWA.** The same codebase serves desktop browsers and mobile web, with layout adapted via Tailwind responsive prefixes (`sm:` at 640px is the primary breakpoint). Desktop gets hover-gated affordances and inline add rows; mobile gets a FAB and bottom sheets.

**Android via Capacitor is planned** (see `plan/capacitor-mobile-plan.md`) but not yet integrated. The existing `mobile-client/` Expo scaffold is kept as a fallback but isn't actively developed.

## Getting Started

### Go API

```bash
cd go-api
go run .                 # Start server on localhost:3000
go run ./cmd/migrate     # Run pending DB migrations
go run ./cmd/create-user # Create a user (prompts for username/email/password)
```

Requires a `.env` file with `DB_URL` and `OPENAI_API_KEY`. See `go-api/CLAUDE.md`.

### Web Client

```bash
cd web-client
npm run dev              # Dev server with HMR (proxies /api to localhost:3000)
npm run build            # TypeScript check + production build
npm run lint             # ESLint
npm run test             # Vitest
```

See `web-client/CLAUDE.md`.

### E2E

```bash
cd e2e
npm run test             # Dev mode — starts test DB + servers + runs Playwright
npm run test:docker      # Docker mode — what CI runs (full image build)
```

See `e2e/CLAUDE.md`.

## Notes

### pnpm `onlyBuiltDependencies`

`package.json` sets `pnpm.onlyBuiltDependencies: ["esbuild"]`. pnpm v10 blocks postinstall scripts by default; this opt-in allows esbuild to run its postinstall, which downloads the platform-specific binary that Vite depends on.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go, Gin, pgx, PostgreSQL (Neon) |
| Web frontend | React 19, Vite 7, Tailwind CSS 4, TypeScript, PWA |
| Shared | TypeScript, pnpm workspaces |
| E2E | Playwright (chromium + Mobile Chrome viewports) |
| AI | OpenAI `gpt-4o-mini` (calorie suggestions, recipe generation) |
| CI | GitHub Actions |
