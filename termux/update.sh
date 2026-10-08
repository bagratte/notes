#!/usr/bin/env bash
# Pull the latest code and do only the install steps it needs:
# pip install if requirements.txt changed, npm ci if the lockfile changed,
# then apply migrations. Restarts the app if it was running.
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
cd "$ROOT"

old=$(git rev-parse HEAD)
git pull --ff-only
new=$(git rev-parse HEAD)

changed() { ! git diff --quiet "$old" "$new" -- "$@"; }

if changed backend/requirements.txt || [ ! -d backend/.venv ]; then
  cd "$ROOT/backend"
  [ -d .venv ] || python -m venv .venv
  if [ -n "${TERMUX_VERSION:-}" ]; then
    # Rust extensions built as abi3 (e.g. watchfiles) don't link libpython,
    # and Android's loader then can't resolve Python's symbols at import.
    pyver=$(.venv/bin/python -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
    export RUSTFLAGS="-C link-arg=-lpython$pyver"
  fi
  .venv/bin/pip install -r requirements.txt
fi

if changed frontend/package.json frontend/package-lock.json || [ ! -d frontend/node_modules ]; then
  cd "$ROOT/frontend"
  npm ci
fi

cd "$ROOT/backend"
.venv/bin/alembic upgrade head

if curl -sf -o /dev/null http://localhost:8000/health || curl -sf -o /dev/null http://localhost:5173/; then
  bash "$ROOT/termux/stop.sh"
  sleep 1
  bash "$ROOT/termux/start.sh" --no-open
fi
