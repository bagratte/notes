#!/usr/bin/env bash
# Start the backend and the Vite dev server (each only if not already
# running), wait until both answer, then open the app.
# Pass --no-open to skip opening the browser.
set -euo pipefail

# Termux:Widget runs scripts without the shell's usual setup, so call
# interpreters explicitly instead of relying on #! lines like
# "#!/usr/bin/env node" (Android has no /usr/bin/env).
export PATH="${PREFIX:-/data/data/com.termux/files/usr}/bin:$PATH"

ROOT="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
LOGS="$HOME/.cache/notes"
APP_URL="http://localhost:5173/"
mkdir -p "$LOGS"

up() { curl -sf -o /dev/null "$1"; }

termux-wake-lock

if ! up http://localhost:8000/health; then
  cd "$ROOT/backend"
  nohup .venv/bin/python -m uvicorn app.main:app --port 8000 >"$LOGS/backend.log" 2>&1 &
fi

if ! up http://localhost:5173/; then
  cd "$ROOT/frontend"
  nohup node node_modules/vite/bin/vite.js --port 5173 --strictPort >"$LOGS/frontend.log" 2>&1 &
fi

for _ in $(seq 1 120); do
  if up http://localhost:8000/health && up http://localhost:5173/; then
    [ "${1:-}" = "--no-open" ] || termux-open-url "$APP_URL"
    exit 0
  fi
  sleep 0.5
done

echo "notes did not start within 60s; see $LOGS/backend.log and $LOGS/frontend.log" >&2
termux-toast "Notes failed to start" 2>/dev/null || true
exit 1
