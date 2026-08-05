/**
 * Capability-Flags & Summarize-Einstiege (Testmatrix nach Nutzer-Spezifikation).
 *
 * Provider → verfügbare Einstiege:
 *   Grok        : Lupe(Summarize) + aktive Session (sessionList + sessionHistory + summarize)
 *   glyph-agent : nur aktive Session (sessionHistory + summarize, KEINE Lupe)
 *   claude      : keiner (alle false)
 *
 * (OpenRouter-UI-Profil entfernt B+ 2026-08-05 — Cloud nur in glyph-agent.)
 * Kein irrtümlicher Einstieg bei fehlender Fähigkeit. Copyright (c) 2026 Alexander Hubert · MIT
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentProfiles, findAgent, summarizeCapabilities } from "../../server/agents.js";

// Determine echte Eintiegs-Sichtbarkeit aus den Capabilities (Client-Logik n.backgebaut):
function entryFor(profile) {
  const c = profile.capabilities;
  return {
    lupeSummarize: Boolean(c.sessionList && c.summarize && c.sessionHistory),
    activeSession: Boolean(c.summarize && c.sessionHistory),
    any: Boolean(c.summarize && c.sessionHistory),
  };
}

test("Capability-Testmatrix (Nutzer-Tabelle)", async (t) => {
  const profiles = buildAgentProfiles({ PATH: "/nonexistent-dir-xyz" });

  const cases = {
    grok:          { lupe: true,  active: true  },
    "glyph-agent": { lupe: false, active: true },
    claude:        { lupe: false, active: false },
  };

  for (const [id, expected] of Object.entries(cases)) {
    await t.test(id, () => {
      const p = findAgent(profiles, id);
      assert.ok(p, `Profil ${id} fehlt`);
      assert.equal(entryFor(p).lupeSummarize, expected.lupe, `${id}: Lupe falsch`);
      assert.equal(entryFor(p).activeSession, expected.active, `${id}: aktive Session falsch`);
    });
  }
});

test("Keine irrtümlichen oder widersprüchlichen Einstiege", async (t) => {
  const profiles = buildAgentProfiles({ PATH: "/nonexistent-dir-xyz" });
  for (const p of profiles) {
    await t.test(p.id, () => {
      const e = entryFor(p);
      // activeSession ist Superset: wenn active false, darf lupe nie true sein.
      if (!e.activeSession) assert.equal(e.lupeSummarize, false, `${p.id}: Lupe ohne active-Session`);
      // summarize darf nie ohne sessionHistory da sein.
      assert.equal(Boolean(p.capabilities.summarize) <= Boolean(p.capabilities.sessionHistory), true);
    });
  }
});

test("summarizeCapabilities-Helper", () => {
  const profiles = buildAgentProfiles({ PATH: "/x" });
  assert.equal(summarizeCapabilities(findAgent(profiles, "grok")).activeSession, true);
  assert.equal(summarizeCapabilities(findAgent(profiles, "grok")).lupeSummarize, true);
  assert.equal(summarizeCapabilities(findAgent(profiles, "claude")).activeSession, false);
  assert.equal(summarizeCapabilities(findAgent(profiles, "claude")).lupeSummarize, false);
  assert.equal(summarizeCapabilities(findAgent(profiles, "glyph-agent")).activeSession, true);
  assert.equal(summarizeCapabilities(findAgent(profiles, "glyph-agent")).lupeSummarize, false);
  assert.equal(summarizeCapabilities(null).activeSession, false);
});
