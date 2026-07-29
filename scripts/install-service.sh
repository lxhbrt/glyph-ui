#!/bin/bash
# Install & load Glyph UI as a macOS LaunchAgent (survives Terminal close / reboot login).
# Generates a machine-local plist from the current install paths (no hardcoded usernames).
#
# Copyright (c) 2026 Alexander Hubert — MIT License

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${HOME:-$(eval echo ~)}"
LABEL="com.lxndrhbrt.glyph-ui"
OLD_LABEL="com.lxndrhbrt.grok-chat-ui"
PLIST_DST="$HOME_DIR/Library/LaunchAgents/${LABEL}.plist"
OLD_PLIST="$HOME_DIR/Library/LaunchAgents/${OLD_LABEL}.plist"
LOG_DIR="$HOME_DIR/Library/Logs/glyph-ui"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"
PORT="${PORT:-5174}"
HOST="${HOST:-127.0.0.1}"
GLYPH_UI_CWD="${GLYPH_UI_CWD:-$HOME_DIR}"
GLYPH_UI_STATE_DIR="${GLYPH_UI_STATE_DIR:-$HOME_DIR/.glyph-ui}"

if [[ -n "${GROK_BIN:-}" ]]; then
  GROK_RESOLVED="$GROK_BIN"
elif [[ -x "${HOME_DIR}/.grok/bin/grok" ]]; then
  GROK_RESOLVED="${HOME_DIR}/.grok/bin/grok"
else
  GROK_RESOLVED="$(command -v grok 2>/dev/null || echo "${HOME_DIR}/.grok/bin/grok")"
fi

PATH_VALUE="${HOME_DIR}/.local/bin:${HOME_DIR}/.grok/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"

# Always rebuild so UI changes are not served from a stale client/dist.
echo "Building production client…"
(cd "$ROOT" && npm run build)

mkdir -p "$HOME_DIR/Library/LaunchAgents" "$LOG_DIR" "$GLYPH_UI_STATE_DIR"

# Free our port only if a leftover Glyph bridge holds it (never kill strangers).
# shellcheck source=scripts/_release-own-port.sh
source "$ROOT/scripts/_release-own-port.sh"
release_own_port "$PORT" "$ROOT"

# Unload new label if present
if launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  echo "Unloading existing ${LABEL}…"
  launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
  sleep 0.5
fi

# Unload & remove legacy LaunchAgent label
if launchctl print "${DOMAIN}/${OLD_LABEL}" >/dev/null 2>&1; then
  echo "Unloading legacy ${OLD_LABEL}…"
  launchctl bootout "${DOMAIN}/${OLD_LABEL}" 2>/dev/null || true
  sleep 0.5
fi
if [[ -f "$OLD_PLIST" ]]; then
  rm -f "$OLD_PLIST"
  echo "Removed legacy plist $OLD_PLIST"
fi

# Write a portable plist for this machine/user.
cat > "$PLIST_DST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>Comment</key>
    <string>Glyph UI — Node bridge + ACP agent (by Alexander Hubert)</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>ThrottleInterval</key>
    <integer>5</integer>

    <key>ProcessType</key>
    <string>Background</string>

    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>${ROOT}/scripts/start-service.sh</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${ROOT}</string>

    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${PATH_VALUE}</string>
      <key>HOME</key>
      <string>${HOME_DIR}</string>
      <key>PORT</key>
      <string>${PORT}</string>
      <key>HOST</key>
      <string>${HOST}</string>
      <key>GROK_BIN</key>
      <string>${GROK_RESOLVED}</string>
      <key>GLYPH_UI_CWD</key>
      <string>${GLYPH_UI_CWD}</string>
      <key>GLYPH_UI_STATE_DIR</key>
      <string>${GLYPH_UI_STATE_DIR}</string>
      <key>NODE_ENV</key>
      <string>production</string>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/stderr.log</string>
  </dict>
</plist>
EOF

chmod 644 "$PLIST_DST"

echo "Loading ${LABEL}…"
launchctl bootstrap "$DOMAIN" "$PLIST_DST"
launchctl enable "${DOMAIN}/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "${DOMAIN}/${LABEL}" 2>/dev/null || true

sleep 1

echo
echo "Installed LaunchAgent: $PLIST_DST"
echo "Logs: $LOG_DIR/{stdout,stderr}.log"
echo "URL:  http://127.0.0.1:${PORT}/"
echo
bash "$ROOT/scripts/status-service.sh" || true
