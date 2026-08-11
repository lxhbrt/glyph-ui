/**
 * Session-Summary Snapshots: eindeutige Dateinamen + kein Überschreiben.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  buildFileName,
  localDateParts,
  writeSummaryAtomically,
  resolveSummariesDir,
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
