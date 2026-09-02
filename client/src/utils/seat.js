/**
 * Device seat: desk | phone | web. Query wins, then storage, then guess.
 * glyph-ui.com is always `web` — query cannot escalate to desk/phone.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

import { isWebSurfaceHost } from "./webSurface.js";

const STORAGE = "glyph-seat";

export function parseSeat(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  return s === "phone" || s === "desk" || s === "web" ? s : "desk";
}

/**
 * Desk vs phone vs web from signals. Standalone (Mac Dock / PWA) is NOT a phone.
 * Phone = narrow or coarse pointer. Public host = web (not overridable).
 */
export function seatFromSignals({
  query,
  stored,
  narrow,
  coarse,
  webHost,
} = {}) {
  if (webHost) return "web";
  if (query === "desk" || query === "phone" || query === "web") return query;
  const desk = !narrow && !coarse;
  if (stored === "phone" && desk) return "desk";
  if (stored === "web" && desk) return "desk";
  if (stored === "desk" || stored === "phone" || stored === "web") return stored;
  return desk ? "desk" : "phone";
}

function envSignals() {
  if (typeof window === "undefined") {
    return {
      query: "",
      stored: "",
      narrow: false,
      coarse: false,
      webHost: false,
    };
  }
  let query = "";
  let stored = "";
  let narrow = false;
  let coarse = false;
  let webHost = false;
  try {
    query = new URLSearchParams(window.location.search).get("seat") || "";
    stored = localStorage.getItem(STORAGE) || "";
    narrow = window.matchMedia("(max-width: 720px)").matches;
    coarse = window.matchMedia("(pointer: coarse)").matches;
    webHost = isWebSurfaceHost(window.location.hostname);
  } catch {
    /* ignore */
  }
  return { query, stored, narrow, coarse, webHost };
}

export function resolveSeat() {
  const signals = envSignals();
  const seat = seatFromSignals(signals);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE, seat);
  } catch {
    /* ignore */
  }
  return seat;
}

export function seatHeaders(extra = {}) {
  return { ...extra, "X-Glyph-Seat": resolveSeat() };
}

export async function seatFetch(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  headers.set("X-Glyph-Seat", resolveSeat());
  return fetch(url, { ...opts, headers });
}
