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
  isSameVaultTopic,
  hitKindLabel,
  hitVaultLabel,
  vaultFindHttpError,
  appleToggleLabel,
  hubSearchScopeLabel,
  isPickerVaultVisible,
  filterPickerHits,
  PICKER_VAULT_ALLOWLIST,
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

  it("apple labels allowlist hubs; off is wiki + enable allowlist", () => {
    const off = appleToggleLabel(false);
    assert.match(off, /Wiki läuft/);
    assert.match(off, /Enable Allowlist-Hubs/);
    assert.match(off, /kein Privat/);
    assert.doesNotMatch(off, /Arbeits-Vault/);
    const on = appleToggleLabel(true);
    assert.match(on, /Allowlist-Hubs/);
    assert.match(on, /HSEQ Sync/);
    assert.match(on, /ASI/);
    assert.match(on, /DGUV/);
    assert.doesNotMatch(on, /Arbeits-Vault/);
    assert.doesNotMatch(on, /soziale/);
  });
});

describe("vaultSearch hits", () => {
  const raw = {
    query: "PSA",
    status: "success",
    hits: [
      { id: "folder:/HSEQ Sync/Eingang", kind: "folder", path: "/HSEQ Sync/Eingang", title: "Eingang" },
      {
        id: "file:/HSEQ Sync/Eingang/PSA.md",
        kind: "file",
        path: "/HSEQ Sync/Eingang/PSA.md",
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
    const picked = selectedHits(preview.hits, new Set(["file:/HSEQ Sync/Eingang/PSA.md"]));
    assert.equal(picked.length, 1);
    assert.equal(hitId(picked[0]), "file:/HSEQ Sync/Eingang/PSA.md");
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

describe("hitVaultLabel", () => {
  it("takes the first path segment", () => {
    assert.equal(
      hitVaultLabel({ kind: "file", path: "/ASI, BS. UWS, QM, EM/Schulung/x.md" }),
      "ASI, BS. UWS, QM, EM",
    );
    assert.equal(
      hitVaultLabel({ kind: "folder", path: "/HSEQ Sync/Schulung" }),
      "HSEQ Sync",
    );
    assert.equal(hitVaultLabel({ kind: "web", path: "https://dguv.de/x" }), "");
  });
});

describe("isSameVaultTopic", () => {
  it("exact match (case-insensitive)", () => {
    assert.equal(isSameVaultTopic("PSA Helm", "psa helm"), true);
  });

  it("short follow-up with no new tokens", () => {
    assert.equal(isSameVaultTopic("016 Krane auslesen", "Krane"), true);
  });

  it("clear new topic is not same", () => {
    assert.equal(isSameVaultTopic("016 Krane", "Brandschutz Übung"), false);
  });

  it("high token overlap counts as same", () => {
    assert.equal(
      isSameVaultTopic(
        "Arbeitsschutz Unterweisung PSA Helm",
        "PSA Helm Unterweisung Arbeitsschutz",
      ),
      true,
    );
  });
});

describe("vaultSendIntent last pick", () => {
  it("same-topic follow-up after a pick sends, does not open a second picker", () => {
    assert.equal(
      vaultSendIntent({
        appleOn: true,
        query: "016 Krane auslesen",
        lastPickedCount: 1,
        lastPickedQuery: "016 Krane",
      }),
      "send",
    );
  });

  it("new topic with prior pick searches again", () => {
    assert.equal(
      vaultSendIntent({
        appleOn: true,
        query: "Brandschutz Übung",
        lastPickedCount: 1,
        lastPickedQuery: "016 Krane",
      }),
      "search",
    );
  });

  it("exact same query with picks sends", () => {
    assert.equal(
      vaultSendIntent({
        appleOn: true,
        query: "016 Krane",
        lastPickedCount: 2,
        lastPickedQuery: "016 Krane",
      }),
      "send",
    );
  });

  it("no previous pick still searches", () => {
    assert.equal(
      vaultSendIntent({
        appleOn: true,
        query: "Krane",
        lastPickedCount: 0,
      }),
      "search",
    );
  });
});

describe("hub + picker allowlist", () => {
  it("hub label only shows allowlist (short ASI)", () => {
    assert.equal(hubSearchScopeLabel(), "sucht in: HSEQ Sync · ASI…");
    assert.equal(
      hubSearchScopeLabel(["HSEQ Sync", "Privat", "memory-wiki", "ASI, BS. UWS, QM, EM"]),
      "sucht in: HSEQ Sync · ASI…",
    );
  });

  it("deny Privat, Peniel, memory-wiki, hygiene paths", () => {
    assert.equal(isPickerVaultVisible("HSEQ Sync"), true);
    assert.equal(isPickerVaultVisible("ASI, BS. UWS, QM, EM"), true);
    assert.equal(isPickerVaultVisible("Privat"), false);
    assert.equal(isPickerVaultVisible("Peniel"), false);
    assert.equal(isPickerVaultVisible("memory-wiki"), false);
    assert.equal(isPickerVaultVisible("_RECOVERY"), false);
    assert.equal(isPickerVaultVisible("_hygiene-trash"), false);
    assert.equal(isPickerVaultVisible("lxndrhbrt"), false);
    assert.ok(PICKER_VAULT_ALLOWLIST.includes("HSEQ Sync"));
  });

  it("filterPickerHits keeps web + allowlist, drops private", () => {
    const filtered = filterPickerHits([
      { kind: "file", path: "/HSEQ Sync/a.md", title: "a.md", id: "1" },
      { kind: "file", path: "/Privat/secret.md", title: "secret.md", id: "2" },
      { kind: "file", path: "/memory-wiki/x.md", title: "x.md", id: "3" },
      { kind: "file", path: "/Peniel/p.md", title: "p.md", id: "4" },
      {
        kind: "web",
        path: "https://www.komnet.nrw.de/x",
        title: "web",
        id: "5",
        source: "komnet",
      },
    ]);
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].id, "1");
    assert.equal(filtered[1].id, "5");
  });

  it("normalizePreviewPayload strips denied vaults", () => {
    const preview = normalizePreviewPayload(
      {
        query: "x",
        status: "success",
        hits: [
          { kind: "file", path: "/Privat/a.md", title: "a.md" },
          { kind: "file", path: "/HSEQ Sync/b.md", title: "b.md" },
        ],
      },
      "x",
    );
    assert.equal(preview.hits.length, 1);
    assert.equal(hitVaultLabel(preview.hits[0]), "HSEQ Sync");
  });
});
