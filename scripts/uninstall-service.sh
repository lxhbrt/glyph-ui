#!/bin/bash
# Unload and remove the Glyph UI LaunchAgent (and legacy label if present).

set -euo pipefail

LABEL="com.lxndrhbrt.glyph-ui"
OLD_LABEL="com.lxndrhbrt.grok-chat-ui"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
OLD_PLIST="$HOME/Library/LaunchAgents/${OLD_LABEL}.plist"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"

for L in "$LABEL" "$OLD_LABEL"; do
  if launchctl print "${DOMAIN}/${L}" >/dev/null 2>&1; then
    echo "Unloading ${L}…"
    launchctl bootout "${DOMAIN}/${L}" 2>/dev/null || true
  else
    echo "Service not loaded: ${L} (ok)."
  fi
done

for P in "$PLIST_DST" "$OLD_PLIST"; do
  if [[ -f "$P" ]]; then
    rm -f "$P"
    echo "Removed $P"
  fi
done

echo "Done. Dev mode still available: npm run dev"
