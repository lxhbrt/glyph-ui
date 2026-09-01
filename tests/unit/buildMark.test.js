/**
 * Build mark: git count 90 → #0.9.0, 112 → #1.1.2.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatBuildMark, glyphBuildLabel } from "../../shared/buildMark.mjs";

describe("formatBuildMark", () => {
  it("maps 90 to 0.9.0 and 112 to 1.1.2", () => {
    assert.equal(formatBuildMark(90), "0.9.0");
    assert.equal(formatBuildMark(112), "1.1.2");
  });

  it("pads below 100 and keeps hundreds as major", () => {
    assert.equal(formatBuildMark(1), "0.0.1");
    assert.equal(formatBuildMark(10), "0.1.0");
    assert.equal(formatBuildMark(99), "0.9.9");
    assert.equal(formatBuildMark(100), "1.0.0");
    assert.equal(formatBuildMark(1000), "10.0.0");
  });

  it("returns empty for missing counts", () => {
    assert.equal(formatBuildMark(0), "");
    assert.equal(formatBuildMark(-1), "");
    assert.equal(formatBuildMark(null), "");
  });
});

describe("glyphBuildLabel", () => {
  it("prefixes hash", () => {
    assert.equal(glyphBuildLabel(90), "#0.9.0");
    assert.equal(glyphBuildLabel(112), "#1.1.2");
    assert.equal(glyphBuildLabel(0), "");
  });
});
