#!/usr/bin/env bash
# Runs the same checks CI runs: Go vet + tests, JS typecheck/lint/test, and E2E.
# Usage: ./check.sh [--skip-e2e]
#   --skip-e2e  Skip the E2E suite (which builds Docker and takes the longest).
set -euo pipefail

SKIP_E2E=false
for arg in "$@"; do
  [[ "$arg" == "--skip-e2e" ]] && SKIP_E2E=true
done

ROOT="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0

# Print a section header
header() { echo; echo "── $1 ──────────────────────────────────────────"; }

# Run a named step; track pass/fail but don't abort on failure so all steps run.
run() {
  local name="$1"; shift
  echo "▶ $name"
  if "$@"; then
    echo "✓ $name"
    ((PASS++)) || true
  else
    echo "✗ $name"
    ((FAIL++)) || true
  fi
}

# ── Go ──────────────────────────────────────────────────────────────────────

header "Go"
run "go vet"  bash -c "cd '$ROOT/go-api' && go vet ./..."
run "go test" bash -c "cd '$ROOT/go-api' && go test ./..."

# ── JS/TS ───────────────────────────────────────────────────────────────────

header "JS/TS (pnpm install)"
# Install once; all filter commands below share the workspace.
run "pnpm install" bash -c "cd '$ROOT' && pnpm install"

header "Shared package"
run "shared — typecheck" bash -c "cd '$ROOT' && pnpm --filter @stride/shared run typecheck"
run "shared — lint"      bash -c "cd '$ROOT' && pnpm --filter @stride/shared run lint"
run "shared — test"      bash -c "cd '$ROOT' && pnpm --filter @stride/shared run test"

header "Web client"
run "web — typecheck" bash -c "cd '$ROOT' && pnpm --filter stride-client run typecheck"
run "web — lint"      bash -c "cd '$ROOT' && pnpm --filter stride-client run lint"
run "web — test"      bash -c "cd '$ROOT' && pnpm --filter stride-client run test"

header "Mobile client"
run "mobile — typecheck" bash -c "cd '$ROOT' && pnpm --filter mobile-client run typecheck"
run "mobile — lint"      bash -c "cd '$ROOT' && pnpm --filter mobile-client run lint"
run "mobile — test"      bash -c "cd '$ROOT' && pnpm --filter mobile-client run test"

# ── E2E ─────────────────────────────────────────────────────────────────────

if $SKIP_E2E; then
  echo
  echo "── E2E (skipped) ───────────────────────────────────────────────"
else
  header "E2E (Docker)"
  run "playwright e2e" bash "$ROOT/e2e/run-docker.sh"
fi

# ── Summary ─────────────────────────────────────────────────────────────────

echo
echo "════════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════════════════"
echo

[[ $FAIL -eq 0 ]]
