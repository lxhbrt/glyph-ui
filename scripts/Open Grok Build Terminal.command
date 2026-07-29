#!/bin/bash
# Double-click in Finder to open the production UI.
# Expects the LaunchAgent or `npm start` on port 5174.
#
# Copyright (c) 2026 Alexander Hubert — MIT License

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-5174}"
URL="http://127.0.0.1:${PORT}/"

# If nothing is listening, try starting the service once.
if ! curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo "Service not up on :${PORT} — starting…"
  if [[ -f "$ROOT/scripts/start-service.sh" ]]; then
    # Prefer launchd if installed
    if launchctl print "gui/$(id -u)/com.lxndrhbrt.grok-chat-ui" >/dev/null 2>&1; then
      launchctl kickstart -k "gui/$(id -u)/com.lxndrhbrt.grok-chat-ui" 2>/dev/null || true
    else
      # One-shot background start (needs client/dist)
      if [[ ! -d "$ROOT/client/dist" ]]; then
        (cd "$ROOT" && npm run build) || true
      fi
      nohup bash "$ROOT/scripts/start-service.sh" >/tmp/grok-chat-ui-start.log 2>&1 &
    fi
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      if curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
  fi
fi

if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  open "$URL"
  echo "Opened $URL"
else
  echo "Could not reach $URL" >&2
  echo "Run: cd \"$ROOT\" && npm run service:install" >&2
  echo "Or:  npm run build && npm start" >&2
  read -r -p "Press Enter to close…" _
  exit 1
fi
