/**
 * Composer Prompt-History (TUI ↑ auf leerem Feld).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

const HISTORY_MAX = 50;
const KEY_PREFIX = "gbt-prompt-history:";

function storageKey(profile) {
  const id = String(profile || "grok").trim() || "grok";
  return `${KEY_PREFIX}${id}`;
}

function normalizeText(text) {
  return String(text || "").trim();
}

/** Slash-Befehle, die Glyph selbst abfängt — nicht in die History. */
export function isLocalSlashCommand(text) {
  const t = normalizeText(text);
  if (!t.startsWith("/")) return false;
  return /^(?:rewind|undo|rename|title|quit|exit)(?:\s|$)/i.test(t.slice(1));
}

export function loadPromptHistory(profile) {
  try {
    const raw = localStorage.getItem(storageKey(profile));
    if (!raw) return [];
    const data = JSON.parse(raw);
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) return [];
    return items
      .map((x) => (typeof x === "string" ? x : x?.text))
      .map(normalizeText)
      .filter(Boolean)
      .slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

export function persistPromptHistory(profile, items) {
  try {
    const list = (Array.isArray(items) ? items : [])
      .map(normalizeText)
      .filter(Boolean)
      .slice(0, HISTORY_MAX);
    if (!list.length) {
      localStorage.removeItem(storageKey(profile));
      return;
    }
    localStorage.setItem(
      storageKey(profile),
      JSON.stringify({ v: 1, items: list }),
    );
  } catch {
    /* private mode / quota */
  }
}

/**
 * Neueste zuerst. Identischer Folgetext wird nicht verdoppelt.
 */
export function pushPromptHistory(profile, text) {
  const t = normalizeText(text);
  if (!t || isLocalSlashCommand(t)) return loadPromptHistory(profile);
  const prev = loadPromptHistory(profile);
  if (prev[0] === t) return prev;
  const next = [t, ...prev.filter((x) => x !== t)].slice(0, HISTORY_MAX);
  persistPromptHistory(profile, next);
  return next;
}

/**
 * ↑ = älter (höherer Index), ↓ = neuer.
 * index null = noch nicht in der History; nach ↑ landet man auf 0 (neuestes).
 * ↓ unter 0 schließt (index: null).
 */
export function stepPromptHistory(entries, index, direction) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return { index: null, text: null, closed: true };
  const dir = direction === "down" ? 1 : -1;
  let next;
  if (index == null) {
    next = dir < 0 ? 0 : null;
  } else {
    next = index - dir;
  }
  if (next == null || next < 0) {
    return { index: null, text: null, closed: true };
  }
  if (next >= list.length) {
    return { index: list.length - 1, text: list[list.length - 1], closed: false };
  }
  return { index: next, text: list[next], closed: false };
}

export { HISTORY_MAX, KEY_PREFIX };
