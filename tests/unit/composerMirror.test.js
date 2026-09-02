/**
 * Unit tests: composer overlay must share textarea metrics.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyComposerMirrorMetrics,
  COMPOSER_MIRROR_STYLE_KEYS,
} from "../../client/src/utils/composerMirror.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const css = readFileSync(join(root, "client/src/styles.css"), "utf8");

describe("applyComposerMirrorMetrics", () => {
  it("copies content-box size and padding so wrap matches the caret", () => {
    const ta = { clientWidth: 200, clientHeight: 40, scrollTop: 6, scrollLeft: 0 };
    const mirror = { style: {}, scrollTop: 0, scrollLeft: 0 };
    applyComposerMirrorMetrics(ta, mirror, {
      boxSizing: "border-box",
      paddingTop: "8px",
      paddingRight: "10px",
      paddingBottom: "8px",
      paddingLeft: "10px",
      borderTopWidth: "0px",
      borderRightWidth: "0px",
      borderBottomWidth: "0px",
      borderLeftWidth: "0px",
      font: "13.6px / 19.3px IBM Plex Sans",
      letterSpacing: "normal",
      wordSpacing: "0px",
      lineHeight: "19.312px",
      tabSize: "4",
      textIndent: "0px",
      textTransform: "none",
      textAlign: "start",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
      wordBreak: "normal",
      wordWrap: "break-word",
    });
    assert.equal(mirror.style.width, "200px");
    assert.equal(mirror.style.height, "40px");
    assert.equal(mirror.style.paddingRight, "10px");
    assert.equal(mirror.style.paddingLeft, "10px");
    assert.equal(mirror.style.font, "13.6px / 19.3px IBM Plex Sans");
    assert.equal(mirror.style.whiteSpace, "pre-wrap");
    assert.equal(mirror.scrollTop, 6);
    for (const key of COMPOSER_MIRROR_STYLE_KEYS) {
      assert.ok(mirror.style[key], `missing ${key}`);
    }
  });

  it("no-ops without nodes", () => {
    assert.equal(applyComposerMirrorMetrics(null, { style: {} }, {}), undefined);
  });
});

describe("composer overlay CSS lockstep", () => {
  it("does not extra-pad the highlight layer alone (vault apple leftover)", () => {
    // Extra padding-right on .composer-highlight without the overlay textarea
    // wraps ~2rem earlier → caret sits mid-text from line 2 (°_Agent).
    assert.equal(
      /composer-row--vault[\s\S]{0,120}padding-right/.test(css),
      false,
    );
  });

  it("paints the textarea when no slash highlight (native caret)", () => {
    assert.match(css, /composer-input-wrap--slash-hl/);
    assert.match(
      css,
      /composer-input-wrap:not\(\.composer-input-wrap--slash-hl\)[\s\S]{0,200}-webkit-text-fill-color:\s*var\(--text\)/,
    );
  });
});
