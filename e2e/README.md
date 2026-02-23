# E2E Tests

Playwright end-to-end tests for Stride. Tests run against a real browser, a real Go API, and a real PostgreSQL database. Covers critical user flows only — login, adding calorie log items, and verifying totals update.

## How it works

Before the test suite runs, `global-setup.ts` automatically:
1. Applies any pending database migrations
2. Creates the `e2e_user` test account (safe to re-run — ignored if the user already exists)

Playwright then starts two local servers (if they aren't already running):
- **Go API** on `localhost:3000`, pointed at the test database
- **Vite dev server** on `localhost:5174`

## Prerequisites

- Docker (for the test database)
- Go (to run the API and migration scripts)
- Node.js 22+

## Running locally

**1. Start the test database**

From the repo root:

```bash
docker compose -f docker-compose.test.yml up -d
```

**2. Run the tests**

```bash
cd e2e
npx playwright test          # headless
npx playwright test --ui     # interactive UI (recommended for debugging)
npx playwright test --headed # headed mode (watch the browser)
```

**3. Tear down the database when done**

```bash
docker compose -f docker-compose.test.yml down
```

## Test files

| File | What it covers |
|------|----------------|
| `tests/auth.spec.ts` | Login with valid/invalid credentials, unauthenticated redirect |
| `tests/calorie-log.spec.ts` | Add item via FAB, verify item appears and totals update |
