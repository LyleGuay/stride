# Railway Deployment Plan

## Strategy: One App (Go serves the frontend)

**Recommendation:** Deploy as a single Railway service. Go builds the React app
at container build time, embeds the `dist/` folder, and serves it as static
files alongside the API. One service = one bill, no CORS configuration, single
domain, simpler deploys.

Separate services (e.g. Vercel for frontend + Railway for API) add cross-origin
complexity and a second billing item for no real benefit on a hobby app.

## Build Method: Multi-stage Dockerfile

**Recommendation:** Use a multi-stage Dockerfile rather than Railway's nixpacks
auto-detection. Nixpacks handles pure Go or pure Node fine but doesn't know how
to combine both build steps. A Dockerfile gives us full control and is
straightforward:

1. Stage 1 — Node: `npm ci && npm run build` → produces `web-client/dist/`
2. Stage 2 — Go: `go build` with the dist folder copied in → produces a single
   binary
3. Final image: copy the binary only, keep the image minimal

Railway picks up the `Dockerfile` at the repo root automatically.

---

## Tasks

- [x] **1 — Fix Go API port binding**
  `router.Run("localhost:3000")` hardcodes localhost and port. Railway injects a
  `PORT` env var and requires binding to `0.0.0.0`. Change to:
  ```go
  port := os.Getenv("PORT")
  if port == "" { port = "3000" }
  router.Run(":" + port)
  ```

- [x] **2 — Serve frontend from Go using go:embed**
  In `go-api/main.go`, embed the built frontend and serve it as static files.
  The Go binary needs to serve `web-client/dist/` at `/` and fall back to
  `index.html` for client-side routes (react-router). API routes under `/api`
  take priority.
  ```go
  //go:embed ../web-client/dist
  var staticFiles embed.FS
  ```
  Use `http.FS` + a fallback handler so that navigating directly to `/calorie-log`
  still serves `index.html`.

- [x] **3 — Write the Dockerfile**
  Create `Dockerfile` at the repo root (Railway looks here by default):
  ```dockerfile
  # Stage 1: build the React frontend
  FROM node:22-alpine AS frontend
  WORKDIR /app/web-client
  COPY web-client/package*.json ./
  RUN npm ci
  COPY web-client/ ./
  RUN npm run build

  # Stage 2: build the Go binary
  FROM golang:1.24-alpine AS backend
  WORKDIR /app
  COPY go-api/ ./go-api/
  COPY --from=frontend /app/web-client/dist ./web-client/dist
  WORKDIR /app/go-api
  RUN go mod download && go build -o stride .

  # Final image
  FROM alpine:3.21
  WORKDIR /app
  COPY --from=backend /app/go-api/stride .
  EXPOSE 8080
  CMD ["./stride"]
  ```

- [x] **4 — Fix date timezone bug in CalorieLog.tsx**
  `new Date().toISOString().split('T')[0]` returns the UTC date, which is wrong
  for users east of UTC after midnight (or west before midnight). Fix the
  `today()` helper to use local time:
  ```ts
  function today(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  ```

- [x] **5 — Normalize exercise calories to positive**
  Convention confirmed: exercise calories stored as positive integers; `type` is
  the source of truth for direction. Migration added at
  `db/2026-02-21-001-normalize-exercise-calories.sql`. abs() workaround removed
  from Go totals calculation. **Run the migration before deploying.**

- [x] **6 — Audit JWT auth on Go routes**
  All calorie log routes are registered under the `/api` group which applies
  `authMiddleware()`. Unauthenticated requests return 401. No changes needed.

- [X] **7 — Set up Railway project**
  - Create a new Railway project, connect the GitHub repo.
  - Add environment variable: `DB_URL` (Neon connection string).
  - Railway will detect the `Dockerfile` and build automatically on push to
    `master`.
  - Assign a public domain (Railway provides a `.railway.app` subdomain for
    free).

- [X] **8 — Smoke test production build locally**
  Before first Railway deploy, test the Docker build locally:
  ```bash
  docker build -t stride .
  docker run -e DB_URL="..." -e PORT=8080 -p 8080:8080 stride
  ```
  Then verify the app loads at `localhost:8080` and API calls work.
