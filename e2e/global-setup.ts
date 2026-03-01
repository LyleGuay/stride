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

  log('[e2e setup] Creating e2e test user...')
  // Pass credentials as flags to avoid interactive stdin.
  // In Docker mode the DB is always fresh (down -v wipes it), so the user can
  // never already exist — any error here is a real failure and should surface.
  // In dev mode the DB persists across runs, so "user already exists" is harmless.
  try {
    execSync('go run ./cmd/create-user --username e2e_user --email e2e@test.com --password password123', {
      cwd: GO_API_DIR,
      env,
      stdio: 'inherit',
    })
  } catch (err) {
    if (DOCKER) {
      throw new Error(`[e2e setup] create-user failed in Docker mode: ${(err as Error).message}`)
    }
    log('[e2e setup] User already exists or creation skipped (dev mode).')
  }

  log('[e2e setup] Done.')
}
