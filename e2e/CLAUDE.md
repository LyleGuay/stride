# e2e/CLAUDE.md

Playwright E2E tests for Stride. See the root `CLAUDE.md` for project-wide conventions and `web-client/CLAUDE.md` / `go-api/CLAUDE.md` for the code these tests exercise.

## Commands

```bash
npm run test           # dev mode: spin up test DB + run Vite + go-api + Playwright
npm run test:docker    # Docker mode: build the prod container and test against it (what CI runs)
npm run test:ui        # dev mode with Playwright UI (interactive)
npm run test:headed    # dev mode with visible browser
npm run db:up          # start the test Postgres container only (port 5433)
npm run db:down        # stop + wipe the test Postgres container
```

**`npm test` auto-manages the DB**: starts the test container before and tears it down after. `test:docker` uses `run-docker.sh` which builds the full production image and runs the suite against it — this is what CI uses.

## Running modes

| | Dev mode (`npm test`) | Docker mode (`npm run test:docker`) |
|---|---|---|
| Frontend | Vite dev server on `:5174` | Production build served at `:8080` |
| Backend | `go run .` on `:3099` with `DB_URL` pointing at test DB | Same container as frontend |
| DB | `postgresql://stride:stride@localhost:5433/stride_test` (Docker container) | Same |
| Base URL | `http://localhost:5174` | `http://localhost:8080` |
| Iteration speed | Fast — HMR, no rebuild | Slow — full image rebuild per run |
| Use when | Iterating on tests or UI | Reproducing CI failures |

Ports are chosen to avoid clashes with a local dev server on `:3000`/`:5173`.

## Global setup

`global-setup.ts` runs once per suite:

1. Applies pending migrations (`go run ./cmd/migrate`).
2. Creates all test users.
3. Seeds user profiles + baseline data via the API.

**Service workers are blocked in Docker mode** (`use.serviceWorkers: 'block'`) — the production build's PWA service worker can trigger mid-test reloads otherwise.

## Test users

**Key rule:** *if a test asserts on a user-specific aggregate (total, count, list), it gets its own user.* Otherwise use the shared `e2e_user`.

Current users (all password `password123`):

| User | Used by | Why isolated |
|---|---|---|
| `e2e_user` | Most test files — auth, habits, journal, tasks, calorie-log (non-aggregate), meal-plan, progress | Shared; safe because those tests only check unique-named items or regex patterns |
| `pace_test_user` | `pace.spec.ts` | Mutates user settings (TDEE inputs) and asserts on computed pace |
| `favorites_test_user` | `favorites.spec.ts` | Cleanup-before-each relies on knowing the full favorites list |
| `recipes_test_user` | `recipes.spec.ts` | Recipe list state would otherwise drift |
| `calorie_log_test_user` | `calorie-log.spec.ts` isolated describe (Settings, add→totals, F.2 edit, F.3 delete) | Asserts on Eaten-total deltas + mutates calorie_budget |

Add a new user in `global-setup.ts` under `testUsers`, seed any baseline state, and import the name in the spec file.

## Test isolation patterns

**Within a file:** Playwright runs tests serially in one worker by default (`fullyParallel` is off). Tests in the same file don't race against each other.

**Across files:** workers run different files in parallel and share the DB. Aggregate assertions (totals, counts, lists) are where this bites — another file's writes to the same user's data can slip in between your read-before and read-after. Solution: give the aggregate-dependent tests their own user.

**Reference pattern** — `calorie-log.spec.ts`:

```typescript
async function apiLogin(request, username) { /* POST /api/login, return token */ }
async function cleanupTodayItems(request, token) { /* DELETE each item returned by /daily */ }
async function loginUI(page, username) { /* fill login form, wait for /calorie-log */ }

test.describe('... — isolated user (aggregate-dependent)', () => {
  test.beforeEach(async ({ page, request }) => {
    const token = await apiLogin(request, ISOLATED_USER)
    await cleanupTodayItems(request, token)
    await loginUI(page, ISOLATED_USER)
  })
  // tests that assert on Eaten totals, budget, etc.
})
```

`favorites.spec.ts` has a similar `cleanupUserData` helper. Mirror these when adding a new aggregate-dependent spec.

## Mobile Chrome project

`playwright.config.ts` defines two projects:

- `chromium` — Desktop Chrome, runs every `*.spec.ts` not ending in `-mobile`.
- `Mobile Chrome` — Pixel 7 viewport, runs only `*-mobile.spec.ts` (via `testMatch`).

Keep desktop-only interactions out of the mobile project. If a flow differs between desktop and mobile (e.g. FAB only on mobile, inline add row only on desktop), write two specs: `foo.spec.ts` for desktop and `foo-mobile.spec.ts` for mobile.

## What belongs in E2E

Critical user flows that exercise the real browser + API + DB:

- Auth → main-page landing
- Create → read → update → delete for each module
- Cross-module integration (e.g. meal plan entry → calorie log ghost row → logged item)
- Responsive layout sanity (via Mobile Chrome project)

**Don't E2E-test edge cases** — unit tests cover those. If a bug is non-obvious and has to do with branching logic, test it in Vitest, not here.

## Common selector patterns (hard-earned)

- **React-controlled number inputs:** `fill()` doesn't always trigger `onChange`. Use `locator.click({ clickCount: 3 })` to select the existing value, then `page.keyboard.type('…')`.
- **Modals hidden via CSS transition:** `not.toBeVisible()` can race with the opacity transition. Prefer `await expect(locator).toHaveCSS('opacity', '0')` — reads the computed style directly.
- **Multiple matches:** scope to the form (`page.locator('form').getByRole(...)`) or to a describe-block identifier (`page.locator('form').filter({ hasText: /log planned item/i })`) rather than using `nth()`.
- **Context menu items vs. cell text:** use `getByRole('button', { name: 'Delete' })` instead of `getByText('Delete')` when the item name might contain the same word.
- **API verification before UI check:** `Promise.all([page.waitForResponse(…), page.click(…)])` forces the API call to complete before the next assertion runs. Especially useful when the UI reads from a fetched aggregate.
- **Today-specific cells on a weekly grid:** the `WeeklyGrid` desktop add buttons expose `data-today="true"` + `data-meal="breakfast|lunch|dinner|snack"` so tests don't depend on which day-of-week "today" is.

## Adding a new spec

1. Decide user: shared `e2e_user` or dedicated (see the rule above).
2. If dedicated, add to `global-setup.ts` `testUsers` list + seed any required state.
3. Name the file `{module}.spec.ts` for desktop, `{module}-mobile.spec.ts` for mobile-specific flows.
4. Wrap aggregate-dependent tests in a describe block with their own `beforeEach` (login + cleanup). See `calorie-log.spec.ts` for the canonical shape.
5. Run `npm test` locally before pushing.
