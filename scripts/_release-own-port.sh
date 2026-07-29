#!/bin/bash
# Free TCP listen port only if the listener is this project's bridge.
# Never kill foreign processes (dev servers, other apps, etc.).
#
# Usage: release_own_port <PORT> <ROOT>
#   PORT — e.g. 5174
#   ROOT — absolute path to the glyph-ui install
#
# Exit 1 if a non-project process holds the port.
# Sourced by install-service.sh and start-service.sh — keep logic here only.
#
# Copyright (c) 2026 Alexander Hubert — MIT License

release_own_port() {
  local port="${1:?port required}"
  local root="${2:?root required}"
  local pid cmd

  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi

  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    if [[ "$cmd" == *"$root/server/index.js"* ]] || \
       [[ "$cmd" == *"glyph-ui/server/index.js"* ]] || \
       [[ "$cmd" == *"grok-chat-ui/server/index.js"* ]]; then
      echo "Releasing port $port (stale pid $pid)" >&2
      kill "$pid" 2>/dev/null || true
      sleep 0.4
      kill -9 "$pid" 2>/dev/null || true
    else
      echo "Port $port held by pid $pid ($cmd) — not killing foreign process" >&2
      return 1
    fi
  done
  return 0
}
