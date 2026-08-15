/**
 * Device seat: desk | phone. Query wins, then storage, then guess.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

const STORAGE = "glyph-seat";

export function parseSeat(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  return s === "phone" || s === "desk" ? s : "desk";
}

/**
 * Desk vs phone from signals. Standalone (Mac Dock / PWA) is NOT a phone.
 * Phone = narrow or coarse pointer. Query still wins in resolveSeat.
 */
export function seatFromSignals({ query, stored, narrow, coarse } = {}) {
  if (query === "desk" || query === "phone") return query;
  const desk = !narrow && !coarse;
  if (stored === "phone" && desk) return "desk";
  if (stored === "desk" || stored === "phone") return stored;
  return desk ? "desk" : "phone";
}

function envSignals() {
  if (typeof window === "undefined") {
    return { query: "", stored: "", narrow: false, coarse: false };
  }
  let query = "";
  let stored = "";
  let narrow = false;
  let coarse = false;
  try {
    query = new URLSearchParams(window.location.search).get("seat") || "";
    stored = localStorage.getItem(STORAGE) || "";
    narrow = window.matchMedia("(max-width: 720px)").matches;
    coarse = window.matchMedia("(pointer: coarse)").matches;
  } catch {
    /* ignore */
  }
  return { query, stored, narrow, coarse };
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
