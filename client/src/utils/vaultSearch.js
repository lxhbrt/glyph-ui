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
  const kind =
    hit.kind === "folder" ? "folder" : hit.kind === "web" ? "web" : "file";
  return `${kind}:${hit.path || ""}`;
}


function hitVaultLabel(hit) {
  if (!hit || hit.kind === "web") return "";
  const path = String(hit.path || "").replace(/^\/+/, "");
  if (!path || path.startsWith("http")) return "";
  return path.split("/")[0] || "";
}

function hitKindLabel(hit) {
  if (!hit) return "Datei";
  if (hit.kind === "folder") return "Ordner";
  if (hit.kind === "web") {
    const src = String(hit.source || "").toLowerCase();
    const path = String(hit.path || "").toLowerCase();
    if (src === "dguv" || path.includes("dguv.de")) return "DGUV";
    return "KomNet";
  }
  return "Datei";
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
  const isWeb =
    raw.kind === "web" || /^https?:\/\//i.test(path);
  const kind = raw.kind === "folder" ? "folder" : isWeb ? "web" : "file";
  const excerpt = String(raw.excerpt || raw.text || "").slice(0, 280);
  let source = String(raw.source || "").slice(0, 40);
  if (kind === "web" && !source) {
    source = path.toLowerCase().includes("dguv.de") ? "dguv" : "komnet";
  }
  return {
    id: String(raw.id || `${kind}:${path}`),
    kind,
    path,
    title: String(raw.title || path.split("/").pop() || path),
    excerpt,
    score: typeof raw.score === "number" ? raw.score : null,
    source,
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
    fallback: json?.fallback ? String(json.fallback) : "",
    tried: Array.isArray(json?.tried) ? json.tried.map(String) : [],
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
    source: h.source || "",
  }));
}

/**
 * Composer send (head) with apple on: search, send, or abort the in-flight find.
 * `abort-then-search` = new query while a find is running.
 */
function vaultFindHttpError(status) {
  const code = Number(status);
  if (code === 504) return "Ordner-Suche hat zu lange gedauert.";
  if (code === 502) return "Ordner-Suche fehlgeschlagen (HTTP 502).";
  return `Suche fehlgeschlagen (HTTP ${status})`;
}

function vaultSendIntent({
  appleOn,
  searchBusy,
  query,
  hitsQuery,
  hitsStatus,
  error,
  lastPickedCount = 0,
} = {}) {
  if (!appleOn) return "send";
  const q = String(query || "").trim();
  const hq = String(hitsQuery || "").trim();
  if (searchBusy) {
    if (!q || q === hq) return "abort";
    return "abort-then-search";
  }
  const same = Boolean(q) && q === hq;
  const haveHits =
    same && hitsStatus && hitsStatus !== "error" && hitsStatus !== "pending";
  const failedThis = Boolean(error) && same;
  if (q && !haveHits && !failedThis) {
    // Follow-up after a pick: keep that context, do not open the picker again.
    if (Number(lastPickedCount) > 0) return "send";
    return "search";
  }
  return "send";
}

/** Apfel: Arbeits-Vault + KomNet/DGUV. Wiki und Web laufen immer. */
function appleToggleLabel(on) {
  return on
    ? "Ordner-Suche an — Arbeits-Vault, KomNet, DGUV"
    : "Ordner-Suche aus — Wiki und Web laufen. Klick: Arbeits-Vault, KomNet, DGUV";
}

export {
  STORAGE_PREFIX,
  vaultSearchStorageKey,
  loadVaultSearchOn,
  saveVaultSearchOn,
  migrateVaultSearchOn,
  hitId,
  hitKindLabel,
  hitVaultLabel,
  defaultSelectedIds,
  selectedHits,
  normalizeHit,
  normalizePreviewPayload,
  toWireSelected,
  vaultFindHttpError,
  vaultSendIntent,
  appleToggleLabel,
};
