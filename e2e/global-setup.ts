// global-setup.ts runs once before the test suite.
// Applies pending migrations and creates the e2e test user against the test database.
// The postgres service must be running (docker-compose -f docker-compose.test.yml up -d).

import { execSync } from 'child_process'
import * as path from 'path'

const TEST_DB_URL = 'postgresql://stride:stride@localhost:5433/stride_test'
const GO_API_DIR = path.resolve(__dirname, '../go-api')

export default async function globalSetup() {
  const env = { ...process.env, DB_URL: TEST_DB_URL }

  console.log('[e2e setup] Running database migrations...')
  execSync('go run ./cmd/migrate', {
    cwd: GO_API_DIR,
    env,
    stdio: 'inherit',
  })

  console.log('[e2e setup] Creating e2e test user...')
  // Pass credentials as flags to avoid interactive stdin. Ignore errors — user
  // may already exist from a prior run.
  try {
    execSync('go run ./cmd/create-user --username e2e_user --email e2e@test.com --password password123', {
      cwd: GO_API_DIR,
      env,
      stdio: 'inherit',
    })
  } catch {
    console.log('[e2e setup] User already exists or creation skipped.')
  }

  console.log('[e2e setup] Done.')
}
