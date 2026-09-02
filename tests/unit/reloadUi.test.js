/**
 * Unit tests: in-place UI reload.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hardReloadUi } from "../../client/src/utils/reloadUi.js";

describe("hardReloadUi", () => {
  it("cache-busts same origin without logout", () => {
    const loc = {
      href: "http://127.0.0.1:5174/chat?seat=web",
      replaced: "",
      replace(url) { this.replaced = String(url); },
    };
    hardReloadUi(loc);
    const u = new URL(loc.replaced);
    assert.equal(u.origin, "http://127.0.0.1:5174");
    assert.equal(u.pathname, "/chat");
    assert.equal(u.searchParams.get("seat"), "web");
    assert.ok(u.searchParams.get("_r"));
    assert.equal(u.searchParams.has("logout"), false);
  });
});
