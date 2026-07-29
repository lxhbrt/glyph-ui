/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * Bridge requires ?token= on /ws.
 * Prod injects window.__GLYPH_WS_TOKEN__ into index.html; Vite dev (and
 * post-restart reconnect) fetch /api/ws-token. Token rotates each process
 * start, so a stale injected value must be discarded after a failed handshake.
 */

/** Drop cached / injected token so the next resolve hits /api/ws-token. */
function invalidateWsToken() {
  if (typeof window === "undefined") return;
  try {
    delete window.__GLYPH_WS_TOKEN__;
  } catch {
    window.__GLYPH_WS_TOKEN__ = "";
  }
}

/**
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<string>}
 */
async function resolveWsToken(opts = {}) {
  const forceRefresh = Boolean(opts.forceRefresh);
  if (forceRefresh) {
    invalidateWsToken();
  } else if (typeof window !== "undefined" && window.__GLYPH_WS_TOKEN__) {
    return String(window.__GLYPH_WS_TOKEN__);
  }
  const res = await fetch("/api/ws-token", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`WS-Token holen fehlgeschlagen (HTTP ${res.status})`);
  }
  const json = await res.json();
  const token = json?.token;
  if (!token) throw new Error("WS-Token fehlt in /api/ws-token Antwort");
  const value = String(token);
  if (typeof window !== "undefined") {
    window.__GLYPH_WS_TOKEN__ = value;
  }
  return value;
}

/**
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<string>}
 */
async function wsUrl(opts = {}) {
  const token = await resolveWsToken(opts);
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${proto}//${window.location.host}/ws`);
  url.searchParams.set("token", token);
  return url.toString();
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export { wsUrl, resolveWsToken, invalidateWsToken, formatWhen };
