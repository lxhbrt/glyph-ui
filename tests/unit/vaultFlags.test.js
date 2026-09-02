/**
 * Unit tests: ACP → /chat vault_search flags.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agentVaultBodyFromMeta } from "../../server/vaultFlags.mjs";

describe("agentVaultBodyFromMeta", () => {
  it("defaults vault_search off when meta is missing", () => {
    assert.deepEqual(agentVaultBodyFromMeta(undefined), { vault_search: false });
    assert.deepEqual(agentVaultBodyFromMeta({}), { vault_search: false });
    assert.deepEqual(agentVaultBodyFromMeta({ vaultSearch: false }), {
      vault_search: false,
    });
  });

  it("enables only on explicit true", () => {
    assert.deepEqual(agentVaultBodyFromMeta({ vaultSearch: true }), {
      vault_search: true,
    });
  });

  it("forwards selected hits", () => {
    const hits = [{ path: "/HSEQ/PSA.md", kind: "file" }];
    assert.deepEqual(
      agentVaultBodyFromMeta({ vaultSearch: true, vaultSelected: hits }),
      { vault_search: true, vault_selected: hits },
    );
  });

  it("skips flags in code mode", () => {
    assert.deepEqual(
      agentVaultBodyFromMeta({ vaultSearch: true }, { isCode: true }),
      {},
    );
  });
});
