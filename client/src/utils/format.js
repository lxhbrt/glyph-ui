/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * Bridge requires ?token= on /ws (prod injects window.__GLYPH_WS_TOKEN__;
 * Vite dev fetches /api/ws-token via proxy).
 */
async function resolveWsToken() {
  if (typeof window !== "undefined" && window.__GLYPH_WS_TOKEN__) {
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
  return String(token);
}

/** @returns {Promise<string>} */
async function wsUrl() {
  const token = await resolveWsToken();
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

export { wsUrl, resolveWsToken, formatWhen };
