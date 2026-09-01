/**
 * Unit tests: manual session title.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyManualTitle,
  titleFromSummary,
} from "../../server/sessions.js";

describe("titleFromSummary / applyManualTitle", () => {
  it("prefers generated_title when not manual", () => {
    assert.equal(
      titleFromSummary({
        generated_title: "Auto",
        session_summary: "Sum",
      }),
      "Auto",
    );
  });

  it("pins manual title over later auto fields", () => {
    const next = applyManualTitle(
      { generated_title: "Old auto", session_summary: "Sum" },
      "  Mein Name  ",
    );
    assert.equal(next.title_is_manual, true);
    assert.equal(next.title, "Mein Name");
    assert.equal(titleFromSummary(next), "Mein Name");
  });

  it("rejects empty / too long", () => {
    assert.throws(() => applyManualTitle({}, "  "), /Titel fehlt/);
    assert.throws(
      () => applyManualTitle({}, "x".repeat(121)),
      /zu lang/,
    );
  });
});
