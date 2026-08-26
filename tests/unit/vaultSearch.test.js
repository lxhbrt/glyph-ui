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
  vaultSendIntent,
  hitKindLabel,
  vaultFindHttpError,
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

  it("keeps KomNet/DGUV web hits (kind web, not file)", () => {
    const preview = normalizePreviewPayload(
      {
        query: "xyz",
        status: "success",
        fallback: "komnet",
        tried: ["komnet"],
        hits: [
          {
            id: "web:https://www.komnet.nrw.de/_sitetools/dialog/1",
            kind: "web",
            path: "https://www.komnet.nrw.de/_sitetools/dialog/1",
            title: "PSA Pflicht?",
            excerpt: "ArbSchG",
            source: "komnet",
          },
        ],
      },
      "xyz",
    );
    assert.equal(preview.fallback, "komnet");
    assert.equal(preview.hits[0].kind, "web");
    assert.equal(preview.hits[0].source, "komnet");
    assert.equal(hitKindLabel(preview.hits[0]), "KomNet");
    assert.equal(hitKindLabel({ kind: "web", source: "dguv" }), "DGUV");
    const wire = toWireSelected(preview.hits);
    assert.equal(wire[0].kind, "web");
    assert.equal(wire[0].source, "komnet");
  });
});

describe("vaultFindHttpError", () => {
  it("maps tunnel/engine 502/504 without a JSON body", () => {
    assert.equal(vaultFindHttpError(504), "Ordner-Suche hat zu lange gedauert.");
    assert.equal(
      vaultFindHttpError(502),
      "Ordner-Suche fehlgeschlagen (HTTP 502).",
    );
    assert.equal(vaultFindHttpError(500), "Suche fehlgeschlagen (HTTP 500)");
  });
});

describe("vaultSendIntent", () => {
  it("apple off → send", () => {
    assert.equal(vaultSendIntent({ appleOn: false, query: "PSA" }), "send");
  });

  it("apple on, no hits yet → search (composer must clear)", () => {
    assert.equal(
      vaultSendIntent({ appleOn: true, query: "Arbeitssicherheit" }),
      "search",
    );
  });

  it("same query while find in flight → abort, not a second blocked send", () => {
    assert.equal(
      vaultSendIntent({
        appleOn: true,
        searchBusy: true,
        query: "PSA",
        hitsQuery: "PSA",
        hitsStatus: "pending",
      }),
      "abort",
    );
  });

  it("empty send while find in flight → abort", () => {
    assert.equal(
      vaultSendIntent({
        appleOn: true,
        searchBusy: true,
        query: "",
        hitsQuery: "PSA",
        hitsStatus: "pending",
      }),
      "abort",
    );
  });

  it("new query while find in flight → abort then search", () => {
    assert.equal(
      vaultSendIntent({
        appleOn: true,
        searchBusy: true,
        query: "Brandschutz",
        hitsQuery: "PSA",
        hitsStatus: "pending",
      }),
      "abort-then-search",
    );
  });

  it("hits for this query → send", () => {
    assert.equal(
      vaultSendIntent({
        appleOn: true,
        query: "PSA",
        hitsQuery: "PSA",
        hitsStatus: "success",
      }),
      "send",
    );
  });

  it("pending hits do not count as ready to send", () => {
    assert.equal(
      vaultSendIntent({
        appleOn: true,
        query: "PSA",
        hitsQuery: "PSA",
        hitsStatus: "pending",
      }),
      "search",
    );
  });
});
