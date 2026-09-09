/**
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSeat, SeatHub, SEAT_IDS } from "../../server/seats.js";

describe("parseSeat", () => {
  it("accepts desk, phone and web", () => {
    assert.equal(parseSeat("desk"), "desk");
    assert.equal(parseSeat("PHONE"), "phone");
    assert.equal(parseSeat("web"), "web");
  });
  it("falls back to desk", () => {
    assert.equal(parseSeat(""), "desk");
    assert.equal(parseSeat("tablet"), "desk");
  });
  it("lists the three seats", () => {
    assert.deepEqual(SEAT_IDS, ["desk", "phone", "web"]);
  });
});

describe("SeatHub", () => {
  it("creates one bridge per seat and reuses it", () => {
    let n = 0;
    const hub = new SeatHub((seat) => {
      n += 1;
      return { seat, sessionId: null, n };
    });
    const a = hub.get("phone");
    const b = hub.get("phone");
    const c = hub.get("desk");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(n, 2);
  });

  it("finds the seat that holds a live session", () => {
    const hub = new SeatHub((seat) => ({ seat, sessionId: null }));
    hub.get("desk").sessionId = "aaa";
    hub.get("phone").sessionId = "bbb";
    assert.equal(hub.findBySession("bbb").seat, "phone");
    assert.equal(hub.findBySession("ccc"), null);
  });
});
