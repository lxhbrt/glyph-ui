/**
 * Session-Summary Snapshots: eindeutige Dateinamen + kein Überschreiben.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  buildDraftFromTurns,
  buildFileName,
  isTrivialTitle,
  localDateParts,
  writeSummaryAtomically,
  resolveSummariesDir,
  proposeSkillFromDraft,
  skillNameFromTitle,
  writeSkillFromProposal,
} from "../../server/summaries.js";

test("buildFileName enthält Datum + Zeitstempel", () => {
  const name = buildFileName({
    title: "Hallo Welt",
    sessionId: "code-1",
    profile: "_code",
    date: "2026-08-11",
    stamp: "153045",
  });
  assert.equal(name, "2026-08-11-153045--hallo-welt--Code--code-1.md");
  assert.ok(!name.includes(".."));
  assert.equal(name, path.basename(name));
});

test("zwei Stamps → zwei Dateinamen (erneutes Zusammenfassen)", () => {
  const a = buildFileName({
    title: "test",
    sessionId: "code-1",
    profile: "code",
    date: "2026-08-11",
    stamp: "120000",
  });
  const b = buildFileName({
    title: "test",
    sessionId: "code-1",
    profile: "code",
    date: "2026-08-11",
    stamp: "120500",
  });
  assert.notEqual(a, b);
});

test("writeSummaryAtomically: zweiter Commit schreibt neuen Snapshot", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "glyph-sum-"));
  try {
    const data = {
      title: "checkpoint",
      summary: "erste Fassung",
      decisions: [],
      open_items: [],
      next_steps: [],
      references: [],
      meta: {
        sessionId: "code-1",
        profile: "_code",
        stamp: "101010",
      },
    };
    const r1 = await writeSummaryAtomically(data, tmpRoot);
    assert.equal(r1.written, true);
    assert.ok(r1.fileName.includes("101010"));

    const r2 = await writeSummaryAtomically(
      {
        ...data,
        summary: "nach weiteren turns",
        meta: { ...data.meta, stamp: "101010" }, // gleiche Sekunde → Suffix
      },
      tmpRoot,
    );
    assert.equal(r2.written, true);
    assert.notEqual(r1.fileName, r2.fileName);
    assert.ok(r2.fileName.includes("101010-2") || r2.fileName !== r1.fileName);

    const dir = resolveSummariesDir(tmpRoot);
    const files = await fs.readdir(dir);
    assert.ok(files.length >= 2, `erwartet ≥2 Snapshots, got ${files.join(",")}`);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test("localDateParts liefert date + time", () => {
  const p = localDateParts(new Date("2026-08-11T15:30:45"));
  // local TZ dependent for date — only check shape of time
  assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(p.time, /^\d{6}$/);
});

test("skillNameFromTitle slugt und schützt reservierte Namen", () => {
  assert.equal(skillNameFromTitle("Deploy Production Pipeline"), "deploy-production-pipeline");
  assert.equal(skillNameFromTitle("merken"), "session-merken");
});

test("proposeSkillFromDraft: zu kurz → nicht eligible", () => {
  const p = proposeSkillFromDraft({
    title: "Langer genug Titel für Skill",
    summary: "x",
    decisions: ["a"],
    next_steps: [],
    turn_counts: { user: 1, assistant: 1 },
  });
  assert.equal(p.eligible, false);
  assert.match(p.reason, /kurz/i);
});

test("proposeSkillFromDraft: mehrstufig → eligible", () => {
  const p = proposeSkillFromDraft({
    title: "Workspaces Kabelsalat Phase 2 API",
    summary: "Session mit 4 Nutzer-Turns. Workspaces UI und Agent API.",
    decisions: ["API bauen", "UI Proxy", "Tests"],
    next_steps: ["Commit und push"],
    turn_counts: { user: 4, assistant: 4 },
  });
  assert.equal(p.eligible, true);
  assert.ok(p.name.length >= 2);
  assert.ok(p.body.includes("## Schritte"));
});

test("writeSkillFromProposal: create + extend + hand-skill reference", async () => {
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "glyph-skill-home-"));
  try {
    const proposal = proposeSkillFromDraft({
      title: "Elevated Shell Confirm Flow",
      summary: "Popup und resume_token für elevated commands.",
      decisions: ["Klassifikation", "pending_confirmation", "Banner bei Fail"],
      next_steps: ["Live testen"],
      turn_counts: { user: 5, assistant: 5 },
    });
    assert.equal(proposal.eligible, true);

    const r1 = await writeSkillFromProposal(proposal, {
      home: tmpHome,
      sessionId: "code-9",
      profile: "_code",
    });
    assert.equal(r1.written, true);
    assert.equal(r1.action, "create");
    const skillPath = r1.path;
    const body1 = await fs.readFile(skillPath, "utf8");
    assert.match(body1, /source: session-summary/);
    assert.match(body1, /Elevated|Schritte|Klassifikation/i);

    const r2 = await writeSkillFromProposal(proposal, {
      home: tmpHome,
      sessionId: "code-10",
    });
    assert.equal(r2.action, "extend");
    const body2 = await fs.readFile(skillPath, "utf8");
    assert.match(body2, /Nachtrag/);

    // Hand-kuratiertes Skill: kein Überschreiben
    const handDir = path.join(tmpHome, ".glyph", "skills", "hand-deploy");
    await fs.mkdir(handDir, { recursive: true });
    const handPath = path.join(handDir, "SKILL.md");
    await fs.writeFile(
      handPath,
      "---\nname: hand-deploy\ndescription: hand\n---\n# hand\n\nManuell.\n",
      "utf8",
    );
    const handProp = {
      ...proposal,
      name: "hand-deploy",
      eligible: true,
    };
    const r3 = await writeSkillFromProposal(handProp, { home: tmpHome, sessionId: "x" });
    assert.equal(r3.action, "reference");
    const handAfter = await fs.readFile(handPath, "utf8");
    assert.equal(handAfter.includes("Manuell."), true);
    assert.ok(!handAfter.includes("source: session-summary"));
    const refs = await fs.readdir(path.join(handDir, "references"));
    assert.ok(refs.length >= 1);
  } finally {
    await fs.rm(tmpHome, { recursive: true, force: true });
  }
});

test("isTrivialTitle: Test-Ping und Wiederholung", () => {
  assert.equal(isTrivialTitle("TEST TEST TEST"), true);
  assert.equal(isTrivialTitle("test"), true);
  assert.equal(isTrivialTitle("test test"), true);
  assert.equal(isTrivialTitle("hallo"), true);
  assert.equal(isTrivialTitle("Workspaces Kabelsalat Phase 2"), false);
});

test("buildDraftFromTurns: erster Test-Ping wird nicht Titel", () => {
  const draft = buildDraftFromTurns([
    { role: "user", text: "TEST TEST TEST" },
    { role: "assistant", text: "ok" },
    { role: "user", text: "Timeout nach 120s — Idle statt Wall-Clock" },
    { role: "assistant", text: "Idle-Timer in acpIdle.mjs." },
  ]);
  assert.ok(!/test test test/i.test(draft.title), draft.title);
  assert.match(draft.title, /Idle|Timeout|Wall-Clock/i);
  assert.ok(!/Start: „TEST TEST TEST"/i.test(draft.summary), draft.summary);
  assert.match(draft.summary, /Idle|Timeout/i);
  assert.ok(!draft.decisions.some((d) => /test test test/i.test(d)));
});

test("buildDraftFromTurns: nur Test-Pings → kein Test als Überschrift", () => {
  const draft = buildDraftFromTurns([
    { role: "user", text: "TEST TEST TEST" },
    { role: "assistant", text: "pong" },
    { role: "user", text: "test" },
    { role: "assistant", text: "pong" },
  ]);
  assert.ok(!/test/i.test(draft.title), draft.title);
  assert.equal(draft.title, "Unbenannte Session");
});

test("proposeSkillFromDraft: TEST TEST TEST ist nicht eligible", () => {
  const p = proposeSkillFromDraft({
    title: "TEST TEST TEST",
    summary: "Session mit 4 Nutzer-Turns. TEST TEST TEST.",
    decisions: ["TEST TEST TEST", "test", "test"],
    next_steps: ["pong"],
    turn_counts: { user: 4, assistant: 4 },
  });
  assert.equal(p.eligible, false);
  assert.match(p.reason, /generisch|trivial|Titel/i);
});
