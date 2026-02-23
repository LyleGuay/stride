import { defineConfig, devices } from '@playwright/test'

const TEST_DB_URL = 'postgresql://stride:stride@localhost:5433/stride_test'

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
  // Start both the Go API (with test DB) and the Vite dev server before running tests.
  // Vite's existing /api proxy points to localhost:3000 where the test API runs.
  webServer: [
    {
      command: `DB_URL=${TEST_DB_URL} go run .`,
      cwd: '../go-api',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Alternate port so E2E tests don't clash with a running dev server on 5173
      command: 'npm run dev -- --port 5174',
      cwd: '../web-client',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
