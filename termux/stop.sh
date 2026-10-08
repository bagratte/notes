#!/usr/bin/env bash
# Stop the backend and the Vite dev server started by start.sh.
pkill -f "uvicorn app.main:app --port 8000" || true
pkill -f "vite.js --port 5173" || true
termux-wake-unlock
