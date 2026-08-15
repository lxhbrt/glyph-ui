/**
 * Unit tests: hanging-cable SVG paths.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cablePath, snackTail, tailTone } from "../../client/src/utils/cables.js";

describe("cablePath", () => {
  it("returns a quadratic from hub to node", () => {
    const d = cablePath(50, 50, 50, 14);
    assert.match(d, /^M 50 50 Q /);
    assert.match(d, / 50 14$/);
    assert.ok(d.includes("Q"));
  });

  it("sags downward (control y below midpoint)", () => {
    const d = cablePath(20, 20, 80, 20);
    const q = d.split("Q ")[1];
    const cy = Number(q.split(" ")[1]);
    assert.ok(cy > 20, `expected sag below 20, got ${cy}`);
  });

  it("treats missing coords as 0", () => {
    assert.equal(cablePath(), "M 0 0 Q 0 3 0 0");
  });
});

describe("tailTone", () => {
  it("keeps live tails in gold shades", () => {
    assert.equal(tailTone({ t: 0.9, live: true, towardHead: true }), "is-gold-bright");
    assert.equal(tailTone({ t: 0.6, live: true, towardHead: true }), "is-gold");
    assert.equal(tailTone({ t: 0.35, live: true, towardHead: true }), "is-gold-dim");
    assert.equal(tailTone({ t: 0.1, live: true, towardHead: true }), "is-gold-deep");
  });

  it("uses dark for inactive and locked", () => {
    assert.equal(tailTone({ t: 0.9, live: false }), "is-dark");
    assert.equal(tailTone({ t: 0.9, live: true, hidden: true }), "is-dark");
    assert.equal(tailTone({ t: 0.9, live: true, mode: "private" }), "is-dark");
  });

  it("dims read-only gold, never jumps to gray", () => {
    assert.equal(tailTone({ t: 0.9, live: true, mode: "r" }), "is-gold-dim");
    assert.equal(tailTone({ t: 0.2, live: true, mode: "r" }), "is-gold-deep");
  });
});

describe("snackTail", () => {
  it("returns stones along the sag", () => {
    const pts = snackTail(0, 0, 200, 0, { maxSag: 40, minSag: 10, count: 9 });
    assert.equal(pts.length, 9);
    const long = snackTail(0, 0, 800, 0, { maxSag: 40, minSag: 10, count: 9 });
    assert.equal(long.length, 9);
  });

  it("keeps a gap at the sun when insetFrom is set", () => {
    const pts = snackTail(0, 0, 200, 0, {
      maxSag: 10,
      minSag: 10,
      count: 10,
      insetFrom: 0.2,
    });
    assert.equal(pts.length, 10);
    assert.ok(pts[0].x > 30, pts[0].x);
  });
});
