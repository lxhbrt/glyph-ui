#!/bin/bash
# Enable Glyph remote access via Tailscale Serve (tailnet only, free).
# Keeps Glyph on 127.0.0.1; does NOT replace Serve on :443 (OpenClaw).
# Glyph → HTTPS :8443 → http://127.0.0.1:5174
#
# Copyright (c) 2026 Alexander Hubert — MIT License

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${HOME:-$(eval echo ~)}"
LABEL="com.lxndrhbrt.glyph-ui"
PLIST_DST="$HOME_DIR/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"
GLYPH_PORT="${PORT:-5174}"
SERVE_HTTPS_PORT="${GLYPH_TAILSCALE_SERVE_PORTS:-8443}"
# First port if comma-list
SERVE_HTTPS_PORT="${SERVE_HTTPS_PORT%%,*}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale CLI fehlt. Installiere Tailscale App + CLI." >&2
  exit 1
fi

if ! tailscale status >/dev/null 2>&1; then
  echo "Starte Tailscale…"
  open -a Tailscale 2>/dev/null || true
  # Prefer existing node settings; fall back to interactive up
  if ! tailscale up --reset=false 2>/dev/null; then
    tailscale up 2>&1 || true
  fi
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    tailscale status >/dev/null 2>&1 && break
    sleep 1
  done
fi

if ! tailscale status >/dev/null 2>&1; then
  echo "Tailscale läuft nicht. Öffne die Tailscale-App und melde dich an, dann erneut:" >&2
  echo "  $0" >&2
  exit 1
fi

DNS_NAME="$(
  tailscale status --json 2>/dev/null | /usr/bin/python3 -c '
import sys, json
d = json.load(sys.stdin)
print(str(d.get("Self", {}).get("DNSName") or "").rstrip("."))
' 2>/dev/null || true
)"
if [[ -z "$DNS_NAME" ]]; then
  echo "MagicDNS-Name nicht lesbar (tailscale status --json)." >&2
  exit 1
fi

# Preserve existing Serve (e.g. OpenClaw on :443). Only set Glyph on :8443.
echo "Serve: https://${DNS_NAME}:${SERVE_HTTPS_PORT} → http://127.0.0.1:${GLYPH_PORT}"
tailscale serve --bg --https="${SERVE_HTTPS_PORT}" "http://127.0.0.1:${GLYPH_PORT}"

# Patch LaunchAgent env (keep other keys). Prefer plutil when present.
if [[ -f "$PLIST_DST" ]]; then
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:GLYPH_ALLOW_TAILSCALE_ORIGIN string 1" "$PLIST_DST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:GLYPH_ALLOW_TAILSCALE_ORIGIN 1" "$PLIST_DST"
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:GLYPH_TAILSCALE_SERVE_PORTS string ${SERVE_HTTPS_PORT}" "$PLIST_DST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:GLYPH_TAILSCALE_SERVE_PORTS ${SERVE_HTTPS_PORT}" "$PLIST_DST"
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:GLYPH_TAILSCALE_HOST string ${DNS_NAME}" "$PLIST_DST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:GLYPH_TAILSCALE_HOST ${DNS_NAME}" "$PLIST_DST"

  echo "Lade ${LABEL} neu…"
  launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
  sleep 0.5
  launchctl bootstrap "${DOMAIN}" "$PLIST_DST"
  launchctl enable "${DOMAIN}/${LABEL}" 2>/dev/null || true
  launchctl kickstart -k "${DOMAIN}/${LABEL}" 2>/dev/null || true
else
  echo "Hinweis: $PLIST_DST fehlt — setze Env manuell und starte den Bridge-Prozess." >&2
  export GLYPH_ALLOW_TAILSCALE_ORIGIN=1
  export GLYPH_TAILSCALE_SERVE_PORTS="${SERVE_HTTPS_PORT}"
  export GLYPH_TAILSCALE_HOST="${DNS_NAME}"
fi

# Wait for local health
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -fsS --max-time 2 "http://127.0.0.1:${GLYPH_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo
echo "=== Fertig (Mac-Seite) ==="
echo "Lokal:   http://127.0.0.1:${GLYPH_PORT}/"
echo "Remote:  https://${DNS_NAME}:${SERVE_HTTPS_PORT}/"
echo
echo "iPhone:"
echo "  1) Tailscale-App installieren, gleiches Konto, verbunden"
echo "  2) Safari: https://${DNS_NAME}:${SERVE_HTTPS_PORT}/"
echo "  3) Profil °_Agent wählen"
echo "  4) Später: Teilen → Zum Home-Bildschirm"
echo
echo "ACL (admin console): nur dieses Mac + iPhone freigeben."
echo "OpenClaw Serve auf :443 bleibt unangetastet."
echo
tailscale serve status 2>&1 || true
