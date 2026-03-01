import { defineConfig, devices } from '@playwright/test'

// DOCKER=1 is set by run-docker.sh (both local and CI). Without it, the dev
// server mode is used (Vite + go run).
const DOCKER = !!process.env.DOCKER

const TEST_DB_URL = 'postgresql://stride:stride@localhost:5433/stride_test'

// Use a dedicated port for the test go-api so it never conflicts with or reuses
// a local dev server on 3000 (which would point at the wrong database).
const TEST_API_PORT = '3099'

// In Docker mode, tests run against the built container (port 8080) which serves
// both the API and the embedded frontend. In dev mode, separate Vite and go-api
// processes are used so changes are reflected without rebuilding.
const baseURL = DOCKER ? 'http://localhost:8080' : 'http://localhost:5174'

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Block service workers in Docker mode — the production build registers a
    // VitePWA service worker with autoUpdate/skipWaiting that can trigger
    // mid-test page reloads, causing flaky failures.
    ...(DOCKER && { serviceWorkers: 'block' as const }),
  },
  projects: [
    // Solo app — chromium only for now
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // In Docker mode the container is already running, so no webServer config is
  // needed. In dev mode, spin up the two dev servers.
  webServer: DOCKER ? [] : [
    {
      // Run go-api on TEST_API_PORT with the test DB — separate from any dev server.
      command: `PORT=${TEST_API_PORT} DB_URL=${TEST_DB_URL} go run .`,
      cwd: '../go-api',
      url: `http://localhost:${TEST_API_PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // Alternate port so E2E tests don't clash with a running dev server on 5173.
      // API_PORT tells Vite's proxy to forward /api to the test go-api port.
      command: `API_PORT=${TEST_API_PORT} npm run dev -- --port 5174`,
      cwd: '../web-client',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
