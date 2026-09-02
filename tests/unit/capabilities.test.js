/**
 * Capability-Flags: Lupe nur Grok (sessionList). Kein summarize.
 * Copyright (c) 2026 Alexander Hubert · MIT
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentProfiles, findAgent } from "../../server/agents.js";

test("Capability-Testmatrix", async (t) => {
  const profiles = buildAgentProfiles({ PATH: "/nonexistent-dir-xyz" });

  const cases = {
    grok: { sessionList: true, activity: true, swarm: false },
    "glyph-agent": { sessionList: false, activity: false, swarm: true },
    _code: { sessionList: false, activity: false, swarm: true },
  };

  for (const [id, expected] of Object.entries(cases)) {
    await t.test(id, () => {
      const p = findAgent(profiles, id);
      assert.ok(p, `Profil ${id} fehlt`);
      assert.equal(p.capabilities.sessionList, expected.sessionList, `${id}: sessionList`);
      assert.equal(p.capabilities.activity, expected.activity, `${id}: activity`);
      assert.equal(p.capabilities.swarm, expected.swarm, `${id}: swarm`);
      assert.equal(p.capabilities.sessionHistory, true, `${id}: sessionHistory`);
      assert.equal(p.capabilities.summarize, undefined, `${id}: kein summarize`);
    });
  }
});
