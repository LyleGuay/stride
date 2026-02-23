import { defineConfig, devices } from '@playwright/test'

const TEST_DB_URL = 'postgresql://stride:stride@localhost:5433/stride_test'

// Use a dedicated port for the test go-api so it never conflicts with or reuses
// a local dev server on 3000 (which would point at the wrong database).
const TEST_API_PORT = '3099'

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [
    // Solo app — chromium only for now
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // Run go-api on TEST_API_PORT with the test DB — separate from any dev server.
      command: `PORT=${TEST_API_PORT} DB_URL=${TEST_DB_URL} go run .`,
      cwd: '../go-api',
      url: `http://localhost:${TEST_API_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Alternate port so E2E tests don't clash with a running dev server on 5173.
      // API_PORT tells Vite's proxy to forward /api to the test go-api port.
      command: `API_PORT=${TEST_API_PORT} npm run dev -- --port 5174`,
      cwd: '../web-client',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
