/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * Wiki root helper. Session-Archiv nach sources/grok-sessions ist tot —
 * Persistenz nur `/merken`. writeSessionArchive remains as a no-op.
 */

import path from "node:path";
import os from "node:os";

/** Expand leading ~/ or ~path to the user home directory. */
function expandHome(p) {
  const s = String(p || "").trim();
  if (!s) return s;
  if (s === "~") return os.homedir();
  if (s.startsWith("~/") || s.startsWith("~" + path.sep)) {
    return path.join(os.homedir(), s.slice(2));
  }
  return s;
}

const DEFAULT_WIKI = expandHome(
  process.env.WIKI_PATH ||
    process.env.OPENCLAW_WIKI_PATH ||
    path.join(os.homedir(), ".glyph-ui", "wiki"),
);

export function getWikiRoot() {
  return DEFAULT_WIKI;
}

/**
 * Retired: does not create files.
 */
export async function writeSessionArchive(doc, meta, wikiRoot = DEFAULT_WIKI) {
  void doc;
  void meta;
  return {
    written: false,
    skipped: true,
    reason: "wiki-archive-retired",
    wikiRoot,
    relativePath: null,
    absolutePath: null,
    indexPath: null,
  };
}
