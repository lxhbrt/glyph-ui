/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * Write Grok session archives into OpenClaw memory-wiki as raw sources.
 * Uses a dedicated folder so OpenClaw managed index blocks stay untouched.
 */

import { promises as fs } from "node:fs";
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

/**
 * Wiki root for session archives.
 * Override with OPENCLAW_WIKI_PATH (e.g. an Obsidian vault).
 * Default is app-local under ~/.glyph-ui — no personal vault path in repo.
 */
const DEFAULT_WIKI = expandHome(
  process.env.OPENCLAW_WIKI_PATH ||
    path.join(os.homedir(), ".glyph-ui", "wiki"),
);

const ARCHIVE_DIR_NAME = "sources/grok-sessions";

function slugify(text) {
  return String(text || "session")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase() || "session";
}

export function getWikiRoot() {
  return DEFAULT_WIKI;
}

export async function ensureWikiArchiveLayout(wikiRoot = DEFAULT_WIKI) {
  const archiveDir = path.join(wikiRoot, ARCHIVE_DIR_NAME);
  await fs.mkdir(archiveDir, { recursive: true });

  const indexPath = path.join(archiveDir, "00 Index - Grok Sessions.md");
  try {
    await fs.access(indexPath);
  } catch {
    await fs.writeFile(
      indexPath,
      [
        `<!-- openclaw:wiki:raw-source -->`,
        `---`,
        `pageType: source`,
        `sourceType: grok-session-index`,
        `title: "Grok Sessions Archive"`,
        `status: active`,
        `---`,
        ``,
        `# Grok Sessions Archive`,
        ``,
        `Schließen über **Glyph UI → Sessions (Lupe)** legt hier Zusammenfassungen ab`,
        `und kann den lokalen Session-Ordner unter \`~/.grok/sessions\` entfernen (Notebook entlasten).`,
        ``,
        `OpenClaw managed blocks werden nicht angefasst — nur dieser Ordner.`,
        ``,
        `## Sessions`,
        ``,
        `<!-- glyph-ui:session-index:start -->`,
        `<!-- glyph-ui:session-index:end -->`,
        ``,
      ].join("\n"),
      "utf8",
    );
  }
  return { wikiRoot, archiveDir, indexPath };
}

async function upsertIndexLink(indexPath, { title, fileName, sessionId, closedAt }) {
  let content;
  try {
    content = await fs.readFile(indexPath, "utf8");
  } catch {
    return;
  }

  const markers = [
    ["<!-- glyph-ui:session-index:start -->", "<!-- glyph-ui:session-index:end -->"],
    ["<!-- grok-chat-ui:session-index:start -->", "<!-- grok-chat-ui:session-index:end -->"],
  ];
  let start;
  let i0 = -1;
  let i1 = -1;
  for (const [s, e] of markers) {
    i0 = content.indexOf(s);
    i1 = content.indexOf(e);
    if (i0 !== -1 && i1 !== -1 && i1 >= i0) {
      start = s;
      break;
    }
  }
  if (!start || i0 === -1 || i1 === -1 || i1 < i0) return;

  const before = content.slice(0, i0 + start.length);
  const after = content.slice(i1);
  const middle = content.slice(i0 + start.length, i1);
  const link = `- [[${fileName.replace(/\.md$/, "")}|${title}]] — \`${sessionId.slice(0, 8)}\` · ${closedAt.slice(0, 10)}`;

  // Avoid duplicates for same session id
  const lines = middle
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !l.includes(sessionId.slice(0, 8)));
  lines.unshift(link);

  const next = `${before}\n${lines.join("\n")}\n${after}`;
  await fs.writeFile(indexPath, next, "utf8");
}

/**
 * @param {{ title: string, body: string }} doc
 * @param {{ id: string, title: string }} meta
 */
export async function writeSessionArchive(doc, meta, wikiRoot = DEFAULT_WIKI) {
  const { archiveDir, indexPath } = await ensureWikiArchiveLayout(wikiRoot);
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `${date}-${slugify(meta.title)}-${meta.id.slice(0, 8)}.md`;
  const filePath = path.join(archiveDir, fileName);

  await fs.writeFile(filePath, doc.body, "utf8");
  await upsertIndexLink(indexPath, {
    title: doc.title || meta.title,
    fileName,
    sessionId: meta.id,
    closedAt: new Date().toISOString(),
  });

  return {
    wikiRoot,
    relativePath: path.join(ARCHIVE_DIR_NAME, fileName),
    absolutePath: filePath,
    indexPath,
  };
}
