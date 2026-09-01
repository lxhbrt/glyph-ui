/**
 * Idle-Timer für ACP-Chat: Reset bei Stream-Aktivität, Pause bei Freigabe.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIdleTimer } from "../../server/acpIdle.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe("createIdleTimer", () => {
  it("fires once after timeoutMs", async () => {
    let n = 0;
    const t = createIdleTimer({ timeoutMs: 25, onFire: () => { n += 1; } });
    t.arm();
    await wait(10);
    assert.equal(n, 0);
    await wait(30);
    assert.equal(n, 1);
    assert.equal(t.fired, true);
    t.stop();
  });

  it("arm() resets the deadline (long coding turn stays alive)", async () => {
    let n = 0;
    const t = createIdleTimer({ timeoutMs: 40, onFire: () => { n += 1; } });
    t.arm();
    await wait(25);
    t.arm();
    await wait(25);
    assert.equal(n, 0);
    t.stop();
  });

  it("pause() during permission wait does not fire", async () => {
    let n = 0;
    const t = createIdleTimer({ timeoutMs: 20, onFire: () => { n += 1; } });
    t.arm();
    t.pause();
    await wait(40);
    assert.equal(n, 0);
    assert.equal(t.fired, false);
    t.arm();
    await wait(10);
    assert.equal(n, 0);
    t.stop();
  });
});
