# Stride

A personal life & productivity dashboard — habits, tasks, goals, calorie logging, and more.

**This is a personal hobby project built for one user (me).** There is no multi-tenancy roadmap, no design-by-committee, and no requirement to optimize for hypothetical future users. Decisions are made for the current use case.

## Structure

```
stride/
  go-api/           — Go backend (Gin + PostgreSQL)
  web-client/       — React web app (desktop only)
  mobile-client/    — Expo React Native app (mobile only)
  packages/
    shared/         — Shared TypeScript types and utilities
```

## Platform Strategy

**`web-client` is desktop primary.** Mobile is tolerated as a fallback but not optimized for — no responsive breakpoints, no mobile-specific layout work. Avoid patterns that actively break on mobile (fixed pixel widths, hover-only primary actions), but don't fix things that merely look suboptimal on small screens.

**`mobile-client` is mobile only.** It is a native Android app via Expo. iOS is not a target — the only device is a Google Pixel. Do not attempt to make it work on desktop.

Each platform has its own UI built for that context. Shared business logic (types, date utilities) lives in `packages/shared` and is consumed by both.

## Getting Started

### Go API

```bash
cd go-api
go run .                 # Start server on localhost:3000
go run ./cmd/migrate     # Run pending DB migrations
```

Requires a `.env` file with `DB_URL` and `OPENAI_API_KEY`. See `go-api/` for details.

### Web Client

```bash
cd web-client
npm run dev              # Dev server with HMR (proxies /api to localhost:3000)
npm run build            # Production build
```

### Mobile Client

```bash
cd mobile-client
npm run android:usb:local-api   # Run on Android device via USB + ngrok (local API)
npm run android:usb:live-api    # Run on Android device via USB (live API)
```

See `mobile-client/RUNNING_ON_DEVICE.md` for full setup instructions.

## Notes

### pnpm `onlyBuiltDependencies`

`package.json` sets `pnpm.onlyBuiltDependencies: ["esbuild"]`. pnpm v10 blocks postinstall scripts by default; this opt-in allows esbuild to run its postinstall, which downloads the platform-specific binary that Vite depends on.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go, Gin, pgx, PostgreSQL (Neon) |
| Web frontend | React 19, Vite, Tailwind CSS 4, TypeScript |
| Mobile frontend | Expo SDK 55, React Native, NativeWind, TypeScript |
| Shared | TypeScript, pnpm workspaces |
| CI | GitHub Actions |
