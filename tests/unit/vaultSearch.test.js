/**
 * Unit tests: manuelle Ordner-Suche (Session-Toggle + Treffer).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  vaultSearchStorageKey,
  loadVaultSearchOn,
  saveVaultSearchOn,
  migrateVaultSearchOn,
  hitId,
  defaultSelectedIds,
  selectedHits,
  normalizePreviewPayload,
  toWireSelected,
} from "../../client/src/utils/vaultSearch.js";

function installSessionStorage() {
  const map = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
  return map;
}

describe("vaultSearch session toggle", () => {
  beforeEach(() => {
    installSessionStorage();
  });

  it("defaults off", () => {
    assert.equal(loadVaultSearchOn(null), false);
    assert.equal(loadVaultSearchOn("abc"), false);
  });

  it("persists per session id", () => {
    saveVaultSearchOn("s1", true);
    saveVaultSearchOn("s2", false);
    assert.equal(loadVaultSearchOn("s1"), true);
    assert.equal(loadVaultSearchOn("s2"), false);
    assert.equal(vaultSearchStorageKey("s1"), "glyph-vault-search:s1");
  });

  it("migrates new → real session", () => {
    saveVaultSearchOn("new", true);
    assert.equal(migrateVaultSearchOn("new", "sess-9"), true);
    assert.equal(loadVaultSearchOn("sess-9"), true);
    assert.equal(loadVaultSearchOn("new"), false);
  });
});

describe("vaultSearch hits", () => {
  const raw = {
    query: "PSA",
    status: "success",
    hits: [
      { id: "folder:/HSEQ/Eingang", kind: "folder", path: "/HSEQ/Eingang", title: "Eingang" },
      {
        id: "file:/HSEQ/Eingang/PSA.md",
        kind: "file",
        path: "/HSEQ/Eingang/PSA.md",
        title: "PSA.md",
        excerpt: "PSA Pflicht",
        score: 0.8,
      },
      { kind: "file", path: "" },
    ],
  };

  it("drops empty paths and defaults selection off", () => {
    const preview = normalizePreviewPayload(raw, "PSA");
    assert.equal(preview.hits.length, 2);
    assert.equal(preview.query, "PSA");
    const ids = defaultSelectedIds(preview.hits);
    assert.equal(ids.size, 0);
  });

  it("filters to selected only", () => {
    const preview = normalizePreviewPayload(raw, "PSA");
    const picked = selectedHits(preview.hits, new Set(["file:/HSEQ/Eingang/PSA.md"]));
    assert.equal(picked.length, 1);
    assert.equal(hitId(picked[0]), "file:/HSEQ/Eingang/PSA.md");
    const wire = toWireSelected(picked);
    assert.equal(wire[0].kind, "file");
    assert.equal(wire[0].excerpt, "PSA Pflicht");
  });
});
