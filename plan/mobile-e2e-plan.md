# Mobile E2E Testing with Maestro

## Goal

Set up Maestro end-to-end testing for `mobile-client`, mirroring the Playwright `e2e/` setup in structure and philosophy. Local development uses Option 1: Android Emulator running on Windows, with ADB connected over TCP from WSL. CI uses Option 3: GitHub Actions with `reactivecircus/android-emulator-runner` on an Ubuntu runner. The first flows cover auth (login happy path, failed login) — the most critical flows that exist today.

---

## Phases

### Phase A: Foundation

- [ ] **A.1 — Create `mobile-e2e/` directory structure**

  Create the following at the repo root, mirroring the `e2e/` layout:

  - `mobile-e2e/README.md` — documents local setup: installing Maestro CLI on WSL, connecting ADB to Windows emulator, running flows
  - `mobile-e2e/flows/` — directory for Maestro YAML flow files (created in A.4)
  - `mobile-e2e/setup.sh` — shell script that runs DB migrations and creates the test user; mirrors what `e2e/global-setup.ts` does (runs `go run ./cmd/migrate` and `go run ./cmd/create-user`)
  - `mobile-e2e/.env.example` — documents required env vars: `WINDOWS_HOST` (IP of Windows host, e.g. `192.168.x.x`) for local ADB and `API_URL` for the test API

- [ ] **A.2 — Set Android package name in `app.json`**

  Maestro needs a stable package name (`appId`) to target the app. Add `android.package` to `mobile-client/app.json` if not already set — e.g. `"package": "com.stride.mobile"` under the `android` key. This value will also be used in the Maestro flow files (A.3) and the CI APK install step (B.2).

- [ ] **A.3 — Add `testID` props to login screen**

  Maestro selects elements via accessibility ID, which maps to `testID` in React Native. Add `testID` props to all interactive and assertable elements in `app/(auth)/login.tsx`:

  - `username-input` on the username `TextInput`
  - `password-input` on the password `TextInput`
  - `login-button` on the submit button
  - `login-error` on the error message `Text` element

  No logic changes — purely additive prop additions.

- [ ] **A.4 — Write login Maestro flows**

  Create two flow files. Both should set `appId` to the Android package name set in A.2.

  - `mobile-e2e/flows/login.yaml` — happy path:
    1. Launch app
    2. Tap `username-input`, type `e2e_user`
    3. Tap `password-input`, type `password123`
    4. Tap `login-button`
    5. Assert `log-tab` or a screen element on the log tab is visible (add a `testID` to the log tab screen in `app/(tabs)/log.tsx`)

  - `mobile-e2e/flows/login-error.yaml` — invalid credentials:
    1. Launch app
    2. Enter wrong credentials
    3. Tap `login-button`
    4. Assert `login-error` element is visible

  - **Manual tests:** Verify both flows pass on a real Android device or emulator before committing. Verify the app resets correctly between test runs (auth token cleared).

- [ ] **A.5 — Local dev run script and README**

  Create `mobile-e2e/scripts/run-local.sh`:
  - Reads `WINDOWS_HOST` from `.env` (or env var)
  - Runs `adb connect $WINDOWS_HOST:5555`
  - Runs `maestro test flows/` from `mobile-e2e/`

  Write `mobile-e2e/README.md` covering:
  1. Install Maestro CLI on WSL: `curl -Ls "https://get.maestro.mobile.dev" | bash`
  2. Start Android Emulator on Windows and note the host IP
  3. Copy `.env.example` → `.env`, fill in `WINDOWS_HOST`
  4. Build and install the app on the emulator: `cd mobile-client && npx expo run:android` (this installs via ADB automatically)
  5. Start the Go API: `cd go-api && go run .` (or the test API — note which one)
  6. Run: `bash scripts/run-local.sh` from `mobile-e2e/`

---

### Phase B: CI Integration

- [ ] **B.1 — Configure test API URL for CI builds**

  The Android emulator in CI reaches the host machine via `10.0.2.2`. The test API runs on port `3099` (same as the Playwright `e2e` job in `ci.yml`).

  In `.github/workflows/mobile-e2e.yml` (created in B.2), set `EXPO_PUBLIC_API_URL=http://10.0.2.2:3099` as a workflow-level env var before the `expo prebuild` step. Expo inlines `EXPO_PUBLIC_*` vars at build time, so no `.env` file changes are needed — the workflow env is sufficient.

  Verify `mobile-client/.env.example` documents `EXPO_PUBLIC_API_URL=http://10.0.2.2:3099` as the correct value for emulator testing.

- [ ] **B.2 — Add `mobile-e2e.yml` GitHub Actions workflow**

  Create `.github/workflows/mobile-e2e.yml`. Trigger: `push` and `pull_request` (same as `ci.yml`).

  Steps, in order:

  1. **Checkout** code
  2. **Setup Java** (`actions/setup-java@v4`, `temurin`, Java 17) — required by Gradle
  3. **Setup Node + pnpm** (same pattern as existing `js-test` job in `ci.yml`)
  4. **Install dependencies** — `pnpm install` at root
  5. **Start PostgreSQL** — use a `services:` block with `postgres:17-alpine`, same config as the `e2e` job: port `5433:5432`, env vars `POSTGRES_USER/PASSWORD/DB`
  6. **Start Go test API** — `cd go-api && TEST_DB_URL=... TEST_API_PORT=3099 go run . &` then poll until healthy
  7. **Run setup script** — `bash mobile-e2e/setup.sh` (runs migrations + creates test user)
  8. **Expo prebuild** — `cd mobile-client && EXPO_PUBLIC_API_URL=http://10.0.2.2:3099 npx expo prebuild --platform android --clean`
  9. **Build debug APK** — `cd mobile-client/android && ./gradlew assembleDebug`
  10. **Run tests with Android Emulator** — use `reactivecircus/android-emulator-runner@v2`:
      - `api-level: 34`
      - `arch: x86_64`
      - `script: |`
        ```
        adb install mobile-client/android/app/build/outputs/apk/debug/app-debug.apk
        curl -Ls "https://get.maestro.mobile.dev" | bash
        export PATH="$PATH:$HOME/.maestro/bin"
        maestro test mobile-e2e/flows/
        ```
  11. **Upload Maestro report on failure** — `actions/upload-artifact@v4` on `if: failure()`, mirrors how the Playwright job uploads its report

  Add a `timeout-minutes: 30` at the job level — emulator boot + Gradle build can be slow.
