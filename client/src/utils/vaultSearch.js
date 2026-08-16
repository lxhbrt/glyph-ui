/**
 * Session-Toggle + Treffer-Normalisierung für die manuelle Ordner-Suche (°_Agent).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

const STORAGE_PREFIX = "glyph-vault-search:";

function vaultSearchStorageKey(sessionId) {
  return `${STORAGE_PREFIX}${sessionId || "new"}`;
}

function loadVaultSearchOn(sessionId) {
  try {
    return sessionStorage.getItem(vaultSearchStorageKey(sessionId)) === "1";
  } catch {
    return false;
  }
}

function saveVaultSearchOn(sessionId, on) {
  try {
    sessionStorage.setItem(vaultSearchStorageKey(sessionId), on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

function migrateVaultSearchOn(fromId, toId) {
  const on = loadVaultSearchOn(fromId);
  if (toId && toId !== fromId) {
    saveVaultSearchOn(toId, on);
    try {
      sessionStorage.removeItem(vaultSearchStorageKey(fromId));
    } catch {
      /* ignore */
    }
  }
  return on;
}

function hitId(hit) {
  if (!hit) return "";
  if (hit.id) return String(hit.id);
  return `${hit.kind === "folder" ? "folder" : "file"}:${hit.path || ""}`;
}

function defaultSelectedIds(_hits) {
  // Explizit: nichts vorgewählt. Agent sieht Treffer erst nach Klick im Panel.
  return new Set();
}

function selectedHits(hits, selectedIds) {
  const set = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  return (hits || []).filter((h) => set.has(hitId(h)));
}

function normalizeHit(raw) {
  if (!raw || typeof raw !== "object") return null;
  const path = String(raw.path || "").trim();
  if (!path) return null;
  const kind = raw.kind === "folder" ? "folder" : "file";
  const excerpt = String(raw.excerpt || raw.text || "").slice(0, 280);
  return {
    id: String(raw.id || `${kind}:${path}`),
    kind,
    path,
    title: String(raw.title || path.split("/").pop() || path),
    excerpt,
    score: typeof raw.score === "number" ? raw.score : null,
  };
}

function normalizePreviewPayload(json, query) {
  const hits = Array.isArray(json?.hits)
    ? json.hits.map(normalizeHit).filter(Boolean)
    : [];
  return {
    query: String(json?.query || query || ""),
    hits,
    status: json?.status || (hits.length ? "success" : "empty"),
    error: json?.error ? String(json.error) : "",
  };
}

function toWireSelected(hits) {
  return (hits || []).map((h) => ({
    id: h.id,
    kind: h.kind,
    path: h.path,
    title: h.title,
    excerpt: h.excerpt || "",
    score: h.score,
  }));
}

export {
  STORAGE_PREFIX,
  vaultSearchStorageKey,
  loadVaultSearchOn,
  saveVaultSearchOn,
  migrateVaultSearchOn,
  hitId,
  defaultSelectedIds,
  selectedHits,
  normalizeHit,
  normalizePreviewPayload,
  toWireSelected,
};
