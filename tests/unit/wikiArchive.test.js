/**
 * Session-Schließen schreibt nicht mehr nach sources/grok-sessions.
 * Copyright (c) 2026 Alexander Hubert · MIT
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeSessionArchive } from "../../server/wiki-archive.js";
import { closeSession } from "../../server/sessions.js";

test("writeSessionArchive legt keine grok-sessions-Datei an", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "glyph-wiki-"));
  const result = await writeSessionArchive(
    { title: "Test session", body: "# Test session\n\nbody\n" },
    { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", title: "Test session" },
    root,
  );
  assert.equal(result.written, false);
  assert.equal(result.relativePath, null);
  let names = [];
  try {
    names = await readdir(path.join(root, "sources", "grok-sessions"));
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err;
  }
  assert.deepEqual(names, []);
});

test("closeSession mit writeWiki wirft — Pfad tot", async () => {
  await assert.rejects(
    () =>
      closeSession("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", {
        writeWiki: true,
        deleteDisk: true,
      }),
    /Wiki-Archiv tot/,
  );
});
