#!/bin/bash
# Unload and remove the Grok Build Terminal LaunchAgent.

set -euo pipefail

LABEL="com.lxndrhbrt.grok-chat-ui"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"

if launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  echo "Unloading ${LABEL}…"
  launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
else
  echo "Service not loaded (ok)."
fi

if [[ -f "$PLIST_DST" ]]; then
  rm -f "$PLIST_DST"
  echo "Removed $PLIST_DST"
else
  echo "Plist already absent: $PLIST_DST"
fi

echo "Done. Dev mode still available: npm run dev"
