#!/bin/bash
# Start Grok Build Terminal bridge + static UI as a background service.
# Designed for launchd: absolute paths, no TTY required.
# App launcher "Grok Build Terminal" → http://localhost:5174/
#
# Copyright (c) 2026 Alexander Hubert — MIT License

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${HOME:-$(eval echo ~)}"

# Prefer user-local and Homebrew paths without hardcoding a specific username.
export PATH="${HOME_DIR}/.local/bin:${HOME_DIR}/.grok/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${PATH:-}"

export NODE_ENV=production
export HOST="${HOST:-127.0.0.1}"
# Match Safari Web App start_url (http://localhost:5174/)
export PORT="${PORT:-5174}"

if [[ -z "${GROK_BIN:-}" ]]; then
  if [[ -x "${HOME_DIR}/.grok/bin/grok" ]]; then
    export GROK_BIN="${HOME_DIR}/.grok/bin/grok"
  else
    export GROK_BIN="$(command -v grok 2>/dev/null || echo grok)"
  fi
fi

export GROK_CHAT_CWD="${GROK_CHAT_CWD:-${HOME_DIR}}"
export NO_COLOR=1

cd "$ROOT"

if [[ ! -d "$ROOT/client/dist" ]]; then
  echo "client/dist missing — run: npm run build" >&2
  exit 1
fi

if [[ ! -x "$GROK_BIN" ]] && ! command -v grok >/dev/null 2>&1; then
  echo "grok binary not found (set GROK_BIN or install grok in PATH)" >&2
  exit 1
fi

# Resolve node binary (portable).
if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}" ]]; then
  NODE_EXEC="$NODE_BIN"
elif command -v node >/dev/null 2>&1; then
  NODE_EXEC="$(command -v node)"
elif [[ -x "${HOME_DIR}/.local/bin/node" ]]; then
  NODE_EXEC="${HOME_DIR}/.local/bin/node"
else
  echo "node not found in PATH" >&2
  exit 1
fi

# Free our port if a leftover node from a previous crash still holds it.
# Only kill listeners whose cwd/command is this project (never random apps).
if command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true); do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    if [[ "$cmd" == *"$ROOT/server/index.js"* ]] || [[ "$cmd" == *"grok-chat-ui/server/index.js"* ]]; then
      echo "Releasing port $PORT (stale pid $pid)" >&2
      kill "$pid" 2>/dev/null || true
      sleep 0.4
      kill -9 "$pid" 2>/dev/null || true
    else
      echo "Port $PORT held by pid $pid ($cmd) — not killing foreign process" >&2
      exit 1
    fi
  done
fi

exec "$NODE_EXEC" "$ROOT/server/index.js"
