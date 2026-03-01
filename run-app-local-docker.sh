#!/usr/bin/env bash
# Builds and starts the app + postgres in Docker for local manual testing.
# App runs at http://localhost:8080 with a fresh test database.
# Postgres is also exposed on localhost:5433 (user: stride, pass: stride, db: stride_test).
# Press Ctrl+C to stop and tear down.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping containers..."
  docker compose -f "$ROOT/docker-compose.e2e.yml" down -v
}
trap cleanup EXIT

echo "Building image and starting services..."
echo ""
echo "  App:      http://localhost:8080"
echo "  Postgres: localhost:5433  (stride / stride / stride_test)"
echo ""
echo "To seed the database, run in a separate terminal:"
echo "  DB_URL=postgresql://stride:stride@localhost:5433/stride_test go run ./go-api/cmd/migrate"
echo "  DB_URL=postgresql://stride:stride@localhost:5433/stride_test go run ./go-api/cmd/create-user"
echo ""

docker compose -f "$ROOT/docker-compose.e2e.yml" up --build
