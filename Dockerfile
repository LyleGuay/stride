# Stage 1: build the React frontend
FROM node:22-alpine AS frontend
RUN corepack enable
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY web-client/package.json ./web-client/
COPY mobile-client/package.json ./mobile-client/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/shared/ ./packages/shared/
COPY web-client/ ./web-client/
WORKDIR /app/web-client
# Railway injects RAILWAY_GIT_COMMIT_SHA as a build arg; we expose it as
# VITE_BUILD_SHA so vite.config.ts can bake it into the bundle.
ARG RAILWAY_GIT_COMMIT_SHA
ENV VITE_BUILD_SHA=$RAILWAY_GIT_COMMIT_SHA
RUN pnpm run build

# Stage 2: build the Go binary with the frontend embedded
FROM golang:1.25-alpine AS backend
WORKDIR /app
COPY go-api/ ./go-api/
# Copy the built frontend into go-api/static/ so go:embed picks it up
COPY --from=frontend /app/web-client/dist ./go-api/static/
WORKDIR /app/go-api
RUN go mod download && go build -o stride .

# Final minimal image — just the binary
FROM alpine:3.21
WORKDIR /app
COPY --from=backend /app/go-api/stride .
EXPOSE 8080
CMD ["./stride"]
