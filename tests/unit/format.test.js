/**
 * Unit tests: format helpers.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatWhen } from "../../client/src/utils/format.js";

describe("formatWhen", () => {
  it("returns em dash for empty", () => {
    assert.equal(formatWhen(""), "—");
    assert.equal(formatWhen(null), "—");
    assert.equal(formatWhen(undefined), "—");
  });

  it("formats a valid ISO timestamp as de-DE locale string", () => {
    const out = formatWhen("2026-03-15T12:30:00.000Z");
    assert.equal(typeof out, "string");
    assert.notEqual(out, "—");
    // Day and year should appear in de-DE short form
    assert.match(out, /2026|15|3|03/);
  });
});
