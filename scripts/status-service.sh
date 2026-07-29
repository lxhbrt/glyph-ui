#!/bin/bash
# Show LaunchAgent + HTTP health for Grok Build Terminal.

set -euo pipefail

LABEL="com.lxndrhbrt.grok-chat-ui"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/grok-chat-ui"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"
PORT=5173

if [[ -f "$PLIST_DST" ]]; then
  PORT="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:PORT' "$PLIST_DST" 2>/dev/null || echo 5173)"
fi

echo "=== LaunchAgent ==="
if [[ -f "$PLIST_DST" ]]; then
  echo "plist: $PLIST_DST (present)"
else
  echo "plist: missing — run: npm run service:install"
fi

if launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  echo "launchd: loaded"
  # PID + last exit code
  launchctl print "${DOMAIN}/${LABEL}" 2>/dev/null | awk '
    /state =/ { print "  " $0 }
    /pid =/ { print "  " $0 }
    /last exit code/ { print "  " $0 }
    /runs =/ { print "  " $0 }
  '
else
  echo "launchd: NOT loaded"
fi

echo
echo "=== Port ${PORT} ==="
if command -v lsof >/dev/null 2>&1; then
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || echo "nothing listening on $PORT"
else
  echo "(lsof not available)"
fi

echo
echo "=== Health ==="
if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null; then
  echo
else
  echo "HTTP health check failed (service down or starting)"
  echo "  try: npm run service:install"
  echo "  logs: $LOG_DIR/stderr.log"
fi

echo
echo "=== Recent logs ==="
if [[ -f "$LOG_DIR/stderr.log" ]]; then
  echo "--- stderr (last 20) ---"
  tail -n 20 "$LOG_DIR/stderr.log" 2>/dev/null || true
else
  echo "no stderr log yet"
fi
if [[ -f "$LOG_DIR/stdout.log" ]]; then
  echo "--- stdout (last 10) ---"
  tail -n 10 "$LOG_DIR/stdout.log" 2>/dev/null || true
fi
