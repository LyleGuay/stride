#!/usr/bin/env bash
set -e

# Starts ngrok tunnel to the local Go API, waits for it to be ready,
# then launches Expo with the tunnel URL as EXPO_PUBLIC_API_URL.
# Also sets up adb reverse for Metro bundler (port 8081).

API_PORT=3000
NGROK_API="http://localhost:4040/api/tunnels"

# Forward Metro bundler port so Expo loads over USB
adb reverse tcp:8081 tcp:8081

# Kill any existing ngrok instance
pkill -f "ngrok http" 2>/dev/null || true

# Start ngrok in background
ngrok http $API_PORT --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

echo "Starting ngrok tunnel to port $API_PORT..."

# Wait for ngrok to be ready (poll the local API up to 10 seconds)
API_URL=""
for i in $(seq 1 20); do
  sleep 0.5
  API_URL=$(curl -s $NGROK_API 2>/dev/null | grep -o '"public_url":"https://[^"]*"' | head -1 | grep -o 'https://[^"]*' || true)
  if [ -n "$API_URL" ]; then
    break
  fi
done

if [ -z "$API_URL" ]; then
  echo "Error: ngrok tunnel did not start. Is ngrok installed and authenticated?"
  kill $NGROK_PID 2>/dev/null || true
  exit 1
fi

echo "ngrok tunnel: $API_URL"
echo "Starting Expo..."

# Kill ngrok when Expo exits
trap "kill $NGROK_PID 2>/dev/null || true" EXIT

EXPO_PUBLIC_API_URL="$API_URL" npx expo start --android --localhost
