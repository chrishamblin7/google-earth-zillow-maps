#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
PORT="${PORT:-3000}"

cd "$ROOT_DIR"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install --no-audit --no-fund --silent
else
  # Ensure newly added deps are present (e.g., jsdom, google-auth-library)
  if ! node -e "require('jsdom'); require('google-auth-library')" >/dev/null 2>&1; then
    echo "Installing updated dependencies..."
    npm install --no-audit --no-fund --silent
  fi
fi

echo "Starting server..."
NODE_ENV=production node server/index.js &
SERVER_PID=$!

cleanup() {
  if ps -p $SERVER_PID > /dev/null 2>&1; then
    kill $SERVER_PID >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Waiting for server to be ready on port $PORT..."
for i in {1..60}; do
  if curl -sf "http://localhost:$PORT/health" >/dev/null; then
    break
  fi
  sleep 0.5
done

if ! curl -sf "http://localhost:$PORT/health" >/dev/null; then
  echo "Server did not become ready in time." >&2
  exit 1
fi

echo "Opening http://localhost:$PORT ..."
if command -v open >/dev/null 2>&1; then
  open "http://localhost:$PORT"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:$PORT"
else
  echo "Please open http://localhost:$PORT in your browser."
fi

wait $SERVER_PID


