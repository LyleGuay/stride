#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Always tear down on exit (success or failure)
cleanup() {
  docker compose -f "$ROOT/docker-compose.e2e.yml" down -v
}
trap cleanup EXIT

# Build and start postgres + app, wait for both to be healthy.
# --build ensures the app image is always rebuilt from source (not a stale
# compose-managed image). docker compose maintains its own image separate from
# any manually-tagged image, so skipping --build can run old binaries.
docker compose -f "$ROOT/docker-compose.e2e.yml" up -d --build --wait

# Install e2e deps (no-op if already installed)
cd "$ROOT/e2e"
npm ci --prefer-offline

# Install Playwright browsers if not already cached.
# --with-deps runs apt-get for OS-level deps — skip the whole step when a
# chromium build is already present in the local Playwright cache.
if [ -z "$(find "${HOME}/.cache/ms-playwright" -maxdepth 1 -name 'chromium-*' -type d 2>/dev/null | head -1)" ]; then
  npx playwright install chromium --with-deps
fi

# Run tests — DOCKER=1 tells playwright.config.ts to use port 8080.
# Any extra args (e.g. --ui, --headed, --grep) are forwarded to playwright.
DOCKER=1 npx playwright test "$@"
