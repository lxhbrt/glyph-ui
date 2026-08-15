/**
 * Unit tests: device seat (desk / phone).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { seatFromSignals } from "../../client/src/utils/seat.js";

describe("seatFromSignals", () => {
  it("query wins", () => {
    assert.equal(
      seatFromSignals({ query: "phone", stored: "desk", narrow: false, coarse: false }),
      "phone",
    );
    assert.equal(
      seatFromSignals({ query: "desk", stored: "phone", narrow: true, coarse: true }),
      "desk",
    );
  });

  it("Mac standalone / Dock is desk (wide + fine pointer)", () => {
    assert.equal(
      seatFromSignals({ query: "", stored: "", narrow: false, coarse: false }),
      "desk",
    );
  });

  it("corrects stored phone when the window is a desktop", () => {
    assert.equal(
      seatFromSignals({ query: "", stored: "phone", narrow: false, coarse: false }),
      "desk",
    );
  });

  it("narrow or coarse pointer guesses phone", () => {
    assert.equal(
      seatFromSignals({ query: "", stored: "", narrow: true, coarse: false }),
      "phone",
    );
    assert.equal(
      seatFromSignals({ query: "", stored: "", narrow: false, coarse: true }),
      "phone",
    );
  });
});
