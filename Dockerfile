# Stage 1: build the React frontend
FROM node:22-alpine AS frontend
WORKDIR /app/web-client
COPY web-client/package*.json ./
RUN npm ci
COPY web-client/ ./
RUN npm run build

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
