/**
 * Unit tests: dialog tab wrap (no DOM).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldWrapTab,
  wrapTabTarget,
} from "../../client/src/utils/focusTrap.js";

describe("shouldWrapTab", () => {
  const list = ["a", "b", "c"];

  it("wraps forward from last and backward from first", () => {
    assert.equal(shouldWrapTab(list, "c", false), true);
    assert.equal(shouldWrapTab(list, "a", true), true);
    assert.equal(shouldWrapTab(list, "b", false), false);
    assert.equal(shouldWrapTab(list, "b", true), false);
  });

  it("wraps when focus is outside the dialog", () => {
    assert.equal(shouldWrapTab(list, "outside", false), true);
    assert.equal(shouldWrapTab(list, null, true), true);
  });
});

describe("wrapTabTarget", () => {
  const list = ["a", "b", "c"];

  it("forward last → first, backward first → last", () => {
    assert.equal(wrapTabTarget(list, "c", false), "a");
    assert.equal(wrapTabTarget(list, "a", true), "c");
    assert.equal(wrapTabTarget(list, "b", false), "c");
    assert.equal(wrapTabTarget(list, "b", true), "a");
  });
});
