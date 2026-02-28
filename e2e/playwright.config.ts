import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

const TEST_DB_URL = 'postgresql://stride:stride@localhost:5433/stride_test'

// Use a dedicated port for the test go-api so it never conflicts with or reuses
// a local dev server on 3000 (which would point at the wrong database).
const TEST_API_PORT = '3099'

// In CI, tests run against the built Docker container (port 8080) which serves
// both the API and the embedded frontend. Locally, separate Vite dev server and
// go-api processes are used so changes are reflected without rebuilding.
const baseURL = CI ? 'http://localhost:8080' : 'http://localhost:5174'

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    // Solo app — chromium only for now
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // In CI the Docker container is started by the workflow before `playwright test`
  // runs, so no webServer config is needed. Locally, spin up the two dev servers.
  webServer: CI ? [] : [
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
