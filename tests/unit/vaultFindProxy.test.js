/**
 * Unit tests: Ordner-Suche Proxy (Timeout unter Cloudflare 100s).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VAULT_FIND_TIMEOUT_MS,
  isTimeoutError,
  vaultFindProxyCatch,
} from "../../server/vaultFindProxy.mjs";

describe("vaultFindProxy", () => {
  it("stays under Cloudflare's 100s HTTP timeout", () => {
    assert.equal(VAULT_FIND_TIMEOUT_MS, 90_000);
    assert.ok(VAULT_FIND_TIMEOUT_MS < 100_000);
  });

  it("maps Abort/Timeout to 504 with German copy", () => {
    const abort = vaultFindProxyCatch(
      Object.assign(new Error("The operation was aborted due to timeout"), {
        name: "TimeoutError",
      }),
    );
    assert.equal(abort.status, 504);
    assert.equal(abort.body.ok, false);
    assert.equal(abort.body.hits.length, 0);
    assert.equal(abort.body.error, "Ordner-Suche hat zu lange gedauert.");
  });

  it("keeps connection errors as 502", () => {
    const down = vaultFindProxyCatch(new Error("fetch failed"));
    assert.equal(down.status, 502);
    assert.equal(down.body.error, "fetch failed");
    assert.equal(isTimeoutError(new Error("fetch failed")), false);
  });
});
