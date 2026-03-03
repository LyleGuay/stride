// global-setup.ts runs once before the test suite.
// Applies pending migrations and creates the e2e test user against the test database.
// Called by playwright regardless of mode — invoked via run-docker.sh in Docker mode,
// or directly via `npm test` in dev mode.

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const TEST_DB_URL = 'postgresql://stride:stride@localhost:5433/stride_test'
const GO_API_DIR = path.resolve(__dirname, '../go-api')

export default async function globalSetup() {
  const env = { ...process.env, DB_URL: TEST_DB_URL }

  const DOCKER = !!process.env.DOCKER
  const appURL = DOCKER ? 'http://localhost:8080' : 'http://localhost:5174'
  const apiURL = DOCKER ? 'http://localhost:8080' : 'http://localhost:3099'

  // fs.writeSync to fd 2 (stderr) writes directly to the file descriptor,
  // bypassing Node stream buffering. process.stderr.write and console.log/error
  // are both captured by Playwright's global-setup worker — only direct fd
  // writes (same mechanism as stdio:'inherit' in child processes) are visible.
  const log = (msg: string) => fs.writeSync(2, msg + '\n')

  log('[e2e setup] ─────────────────────────────────────')
  log(`[e2e setup]  Mode:      ${DOCKER ? 'Docker' : 'Dev'}`)
  log(`[e2e setup]  Frontend:  ${appURL}`)
  log(`[e2e setup]  Backend:   ${apiURL}`)
  log(`[e2e setup]  Postgres:  ${TEST_DB_URL}`)
  log('[e2e setup] ─────────────────────────────────────')

  log('[e2e setup] Running database migrations...')
  execSync('go run ./cmd/migrate', {
    cwd: GO_API_DIR,
    env,
    stdio: 'inherit',
  })

  // Create all e2e test users. Each test file that patches user settings gets its
  // own dedicated user to prevent parallel workers from racing on shared state.
  // In Docker mode the DB is always fresh so users can never already exist.
  // In dev mode the DB persists across runs so "already exists" errors are harmless.
  const testUsers = [
    { username: 'e2e_user',           email: 'e2e@test.com',           password: 'password123' },
    { username: 'pace_test_user',     email: 'pace@test.com',          password: 'password123' },
    { username: 'favorites_test_user',email: 'favorites@test.com',     password: 'password123' },
  ]

  for (const user of testUsers) {
    log(`[e2e setup] Creating test user '${user.username}'...`)
    try {
      execSync(
        `go run ./cmd/create-user --username ${user.username} --email ${user.email} --password ${user.password}`,
        { cwd: GO_API_DIR, env, stdio: 'inherit' },
      )
    } catch (err) {
      if (DOCKER) {
        throw new Error(`[e2e setup] create-user failed in Docker mode: ${(err as Error).message}`)
      }
      log(`[e2e setup] User '${user.username}' already exists or creation skipped (dev mode).`)
    }
  }

  log('[e2e setup] Done.')
}
