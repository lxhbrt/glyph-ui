/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * Local Grok session inventory + close/archive helpers.
 * Sessions live under ~/.grok/sessions/<encoded-cwd>/<session-id>/.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const GROK_HOME = process.env.GROK_HOME || path.join(os.homedir(), ".grok");
const SESSIONS_ROOT = path.join(GROK_HOME, "sessions");
const STATE_DIR =
  process.env.GLYPH_UI_STATE_DIR ||
  path.join(os.homedir(), ".glyph-ui");
const CLOSED_LOG = path.join(STATE_DIR, "closed-sessions.json");

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSessionId(id) {
  return typeof id === "string" && SESSION_ID_RE.test(id);
}

async function ensureStateDir() {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

async function readClosedLog() {
  try {
    const raw = await fs.readFile(CLOSED_LOG, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

async function appendClosedLog(entry) {
  await ensureStateDir();
  const entries = await readClosedLog();
  entries.unshift(entry);
  await fs.writeFile(
    CLOSED_LOG,
    JSON.stringify({ version: 1, entries: entries.slice(0, 500) }, null, 2),
    "utf8",
  );
}

async function dirSize(dir) {
  let total = 0;
  async function walk(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        try {
          const st = await fs.stat(full);
          total += st.size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(dir);
  return total;
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/**
 * Resolve a session directory and ensure it stays under SESSIONS_ROOT
 * (no symlink escape, no path traversal via group names).
 */
async function findSessionDir(sessionId) {
  if (!isSessionId(sessionId)) return null;
  let groups;
  try {
    groups = await fs.readdir(SESSIONS_ROOT, { withFileTypes: true });
  } catch {
    return null;
  }
  let rootReal;
  try {
    rootReal = await fs.realpath(SESSIONS_ROOT);
  } catch {
    return null;
  }
  for (const group of groups) {
    if (!group.isDirectory() || group.name.startsWith(".")) continue;
    // Group names are encoded cwd paths — never allow path segments.
    if (group.name === ".." || group.name.includes("/") || group.name.includes("\\")) {
      continue;
    }
    const candidate = path.join(SESSIONS_ROOT, group.name, sessionId);
    try {
      const st = await fs.lstat(candidate);
      if (!st.isDirectory() || st.isSymbolicLink()) continue;
      const real = await fs.realpath(candidate);
      const rel = path.relative(rootReal, real);
      if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
      // Must be exactly <root>/<group>/<uuid>
      if (rel.split(path.sep).length !== 2) continue;
      return real;
    } catch {
      /* continue */
    }
  }
  return null;
}

/** Final guard before recursive delete — never rm outside sessions root. */
async function assertSafeSessionDir(dir) {
  if (!dir || typeof dir !== "string") {
    throw new Error("Session path missing");
  }
  let rootReal;
  let dirReal;
  try {
    rootReal = await fs.realpath(SESSIONS_ROOT);
    dirReal = await fs.realpath(dir);
  } catch {
    throw new Error("Session path not resolvable");
  }
  const rel = path.relative(rootReal, dirReal);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Refusing to delete path outside sessions root");
  }
  const parts = rel.split(path.sep);
  if (parts.length !== 2 || !isSessionId(parts[1])) {
    throw new Error("Refusing to delete unexpected session path shape");
  }
  return dirReal;
}

function titleFromSummary(summary) {
  return (
    summary?.generated_title ||
    summary?.session_summary ||
    summary?.info?.id ||
    "Untitled session"
  );
}

/**
 * Extract short user/assistant turns from chat_history.jsonl.
 * Skips system prompts and synthetic reminders.
 */
export async function extractTranscript(sessionDir, { maxTurns = 80, maxChars = 120_000 } = {}) {
  const historyPath = path.join(sessionDir, "chat_history.jsonl");
  let raw;
  try {
    raw = await fs.readFile(historyPath, "utf8");
  } catch {
    return { turns: [], truncated: false };
  }

  const turns = [];
  let totalChars = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const type = row.type || row.role;
    if (type !== "user" && type !== "assistant") continue;

    let text = "";
    const content = row.content;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part?.type === "text" && typeof part.text === "string") return part.text;
          if (typeof part?.text === "string") return part.text;
          return "";
        })
        .filter(Boolean)
        .join("\n");
    } else if (typeof row.text === "string") {
      text = row.text;
    }

    text = text.trim();
    if (!text) continue;
    // Drop huge system-ish blobs accidentally tagged as user
    if (text.startsWith("<system-reminder>") || text.startsWith("<user_info>")) continue;
    if (text.includes("<user_query>") && text.length > 20_000) {
      const m = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
      if (m) text = m[1].trim();
    }

    if (totalChars + text.length > maxChars) {
      const room = Math.max(0, maxChars - totalChars);
      if (room > 80) {
        turns.push({ role: type, text: `${text.slice(0, room)}…` });
      }
      return { turns, truncated: true };
    }

    turns.push({ role: type, text });
    totalChars += text.length;
    if (turns.length >= maxTurns) return { turns, truncated: true };
  }
  return { turns, truncated: false };
}

function buildSummaryMarkdown({ meta, turns, truncated, freedBytes }) {
  const title = meta.title;
  const date = (meta.updatedAt || meta.createdAt || new Date().toISOString()).slice(0, 10);
  const userTurns = turns.filter((t) => t.role === "user");
  const assistantTurns = turns.filter((t) => t.role === "assistant");

  const highlights = [];
  for (const t of userTurns.slice(0, 3)) {
    const line = t.text.replace(/\s+/g, " ").slice(0, 220);
    if (line) highlights.push(`- (User) ${line}`);
  }
  for (const t of assistantTurns.slice(-2)) {
    const line = t.text.replace(/\s+/g, " ").slice(0, 220);
    if (line) highlights.push(`- (Grok) ${line}`);
  }

  const excerpt = turns
    .slice(0, 12)
    .map((t) => {
      const body = t.text.length > 600 ? `${t.text.slice(0, 600)}…` : t.text;
      return `### ${t.role === "user" ? "User" : "Grok"}\n\n${body}`;
    })
    .join("\n\n");

  return {
    title: `Grok Session: ${title}`,
    body: [
      `<!-- openclaw:wiki:raw-source -->`,
      `---`,
      `pageType: source`,
      `sourceType: grok-session-archive`,
      `id: source.grok-session.${meta.id}`,
      `title: ${JSON.stringify(`Grok Session: ${title}`)}`,
      `sessionId: ${meta.id}`,
      `cwd: ${JSON.stringify(meta.cwd || "")}`,
      `model: ${JSON.stringify(meta.model || "")}`,
      `agent: ${JSON.stringify(meta.agent || "")}`,
      `createdAt: ${JSON.stringify(meta.createdAt || "")}`,
      `updatedAt: ${JSON.stringify(meta.updatedAt || "")}`,
      `archivedAt: ${JSON.stringify(new Date().toISOString())}`,
      `diskBytes: ${meta.diskBytes || 0}`,
      `status: archived`,
      `---`,
      ``,
      `# Grok Session: ${title}`,
      ``,
      `Archiviert aus Glyph UI (Command Overview) am ${date}.`,
      ``,
      `## Meta`,
      ``,
      `| Feld | Wert |`,
      `| --- | --- |`,
      `| Session ID | \`${meta.id}\` |`,
      `| Workspace | \`${meta.cwd || "—"}\` |`,
      `| Model | ${meta.model || "—"} |`,
      `| Agent | ${meta.agent || "—"} |`,
      `| Messages | ${meta.messages ?? "—"} |`,
      `| Chat messages | ${meta.chatMessages ?? "—"} |`,
      `| Disk (vor Close) | ${formatBytes(meta.diskBytes || 0)} |`,
      `| Freigegeben | ${formatBytes(freedBytes || 0)} |`,
      ``,
      `## Kurzfassung`,
      ``,
      meta.summary && meta.summary !== title
        ? meta.summary
        : `Session „${title}“ — ${userTurns.length} User- und ${assistantTurns.length} Assistant-Turns extrahiert${truncated ? " (gekürzt)" : ""}.`,
      ``,
      `## Highlights`,
      ``,
      highlights.length ? highlights.join("\n") : "_Keine extrahierbaren Highlights._",
      ``,
      `## Auszug`,
      ``,
      excerpt || "_Kein Transcript gefunden._",
      truncated ? `\n\n_… Transcript gekürzt._` : "",
      ``,
    ].join("\n"),
  };
}

/**
 * True when the session has no real user chat content.
 * Setup-only shells (system + synthetic) and orphan tool debris count as empty.
 */
export async function sessionHasUserContent(sessionDir, summary = {}) {
  const nMsg = summary?.num_messages;
  const nChat = summary?.num_chat_messages;
  // Fast path: brand-new / setup shell with no agent turns
  if (nMsg === 0 && (nChat == null || nChat <= 2)) {
    return false;
  }

  const historyPath = path.join(sessionDir, "chat_history.jsonl");
  let raw;
  try {
    raw = await fs.readFile(historyPath, "utf8");
  } catch {
    // No history and no meaningful summary → empty
    return Boolean(nMsg && nMsg > 0);
  }

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const type = row.type || row.role;
    if (type !== "user") continue;
    if (row.synthetic_reason) continue;

    let text = "";
    const content = row.content;
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      text = content
        .map((part) => {
          if (typeof part === "string") return part;
          if (typeof part?.text === "string") return part.text;
          return "";
        })
        .filter(Boolean)
        .join("\n");
    } else if (typeof row.text === "string") {
      text = row.text;
    }
    text = text.trim();
    if (!text) continue;
    if (text.startsWith("<system-reminder>") || text.startsWith("<user_info>")) {
      continue;
    }
    // Real user query / message
    return true;
  }
  return false;
}

export async function listSessions({ includeClosed = false } = {}) {
  const closed = await readClosedLog();
  const closedIds = new Set(closed.map((e) => e.id));
  const sessions = [];

  let groups;
  try {
    groups = await fs.readdir(SESSIONS_ROOT, { withFileTypes: true });
  } catch {
    return { sessions: [], closed, totalBytes: 0, sessionsRoot: SESSIONS_ROOT };
  }

  for (const group of groups) {
    if (!group.isDirectory() || group.name.startsWith(".") || group.name.endsWith(".sqlite")) {
      continue;
    }
    const groupPath = path.join(SESSIONS_ROOT, group.name);
    let children;
    try {
      children = await fs.readdir(groupPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const child of children) {
      if (!child.isDirectory() || !isSessionId(child.name)) continue;
      if (!includeClosed && closedIds.has(child.name)) continue;

      const sessionDir = path.join(groupPath, child.name);
      let summary = {};
      try {
        summary = JSON.parse(
          await fs.readFile(path.join(sessionDir, "summary.json"), "utf8"),
        );
      } catch {
        summary = {};
      }

      const diskBytes = await dirSize(sessionDir);
      const createdAt =
        summary.created_at || summary.info?.created_at || null;
      const updatedAt =
        summary.updated_at ||
        summary.last_active_at ||
        summary.info?.updated_at ||
        null;

      const hasContent = await sessionHasUserContent(sessionDir, summary);

      sessions.push({
        id: child.name,
        title: titleFromSummary(summary),
        summary: summary.session_summary || titleFromSummary(summary),
        cwd: summary.info?.cwd || "",
        model: summary.current_model_id || "",
        agent: summary.agent_name || "",
        messages: summary.num_messages ?? null,
        chatMessages: summary.num_chat_messages ?? null,
        createdAt,
        updatedAt,
        diskBytes,
        diskLabel: formatBytes(diskBytes),
        kind: summary.session_kind || "session",
        path: sessionDir,
        closed: closedIds.has(child.name),
        empty: !hasContent,
      });
    }
  }

  sessions.sort((a, b) => {
    const ta = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
    const tb = Date.parse(b.updatedAt || b.createdAt || 0) || 0;
    return tb - ta;
  });

  const totalBytes = sessions.reduce((sum, s) => sum + (s.diskBytes || 0), 0);
  return {
    sessions,
    closed: closed.slice(0, 50),
    totalBytes,
    totalLabel: formatBytes(totalBytes),
    sessionsRoot: SESSIONS_ROOT,
    count: sessions.length,
  };
}

/**
 * Delete empty/setup sessions (no real user content). No wiki archive.
 * Skips protectId (active chat). Returns closed entries.
 */
export async function cleanupEmptySessions({
  protectId = null,
  deleteDisk = true,
} = {}) {
  const inventory = await listSessions({ includeClosed: false });
  const empties = inventory.sessions.filter((s) => {
    if (!s.empty) return false;
    if (protectId && s.id === protectId) return false;
    return true;
  });

  const closed = [];
  let freedBytes = 0;
  for (const meta of empties) {
    try {
      const result = await closeSession(meta.id, {
        deleteDisk,
        writeWiki: false,
        protectId,
      });
      closed.push({
        id: meta.id,
        title: meta.title,
        freedBytes: result.freedBytes || 0,
        freedLabel: result.freedLabel,
      });
      freedBytes += result.freedBytes || 0;
    } catch (err) {
      closed.push({
        id: meta.id,
        title: meta.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: true,
    removed: closed.filter((c) => !c.error).length,
    failed: closed.filter((c) => c.error).length,
    freedBytes,
    freedLabel: formatBytes(freedBytes),
    sessions: closed,
  };
}

export async function getSession(sessionId, {
  maxTurns = 40,
  maxChars = 40_000,
} = {}) {
  const dir = await findSessionDir(sessionId);
  if (!dir) return null;
  const list = await listSessions({ includeClosed: true });
  const meta = list.sessions.find((s) => s.id === sessionId);
  if (!meta) return null;
  const { turns, truncated } = await extractTranscript(dir, {
    maxTurns,
    maxChars,
  });
  return { ...meta, transcriptPreview: turns, turns, truncated };
}

/**
 * Full-ish transcript for opening a session in the chat UI.
 */
export async function getSessionForOpen(sessionId) {
  return getSession(sessionId, { maxTurns: 200, maxChars: 400_000 });
}

/**
 * Close session: optional wiki summary → optional disk delete.
 * Modes:
 *   writeWiki + deleteDisk  → Ja + Wiki (archive then remove folder)
 *   !writeWiki + deleteDisk → TUI /delete (disk only, no wiki)
 * Does NOT delete if sessionId === protectId (active chat session).
 */
export async function closeSession(sessionId, {
  deleteDisk = true,
  writeWiki = true,
  protectId = null,
  wikiWriter,
} = {}) {
  if (!isSessionId(sessionId)) {
    throw new Error("Invalid session id");
  }
  if (protectId && sessionId === protectId) {
    throw new Error("Aktive Chat-Session kann nicht geschlossen werden. Starte zuerst eine neue Session.");
  }
  if (!writeWiki && !deleteDisk) {
    throw new Error("Nichts zu tun: writeWiki und deleteDisk sind beide false");
  }

  const dir = await findSessionDir(sessionId);
  if (!dir) throw new Error("Session not found on disk");

  const inventory = await listSessions({ includeClosed: true });
  const meta = inventory.sessions.find((s) => s.id === sessionId);
  if (!meta) throw new Error("Session metadata missing");

  const freedBytes = deleteDisk ? meta.diskBytes : 0;
  let wikiPath = null;

  if (writeWiki) {
    if (typeof wikiWriter !== "function") {
      throw new Error("Wiki writer missing");
    }
    const { turns, truncated } = await extractTranscript(dir);
    const doc = buildSummaryMarkdown({ meta, turns, truncated, freedBytes });
    wikiPath = await wikiWriter(doc, meta);
  }

  if (deleteDisk) {
    const safeDir = await assertSafeSessionDir(dir);
    await fs.rm(safeDir, { recursive: true, force: true });
  }

  const entry = {
    id: sessionId,
    title: meta.title,
    closedAt: new Date().toISOString(),
    wikiPath,
    freedBytes,
    diskDeleted: Boolean(deleteDisk),
    wikiWritten: Boolean(writeWiki && wikiPath),
  };
  await appendClosedLog(entry);

  return {
    ok: true,
    session: meta,
    wikiPath,
    freedBytes,
    freedLabel: formatBytes(freedBytes),
    diskDeleted: Boolean(deleteDisk),
    wikiWritten: Boolean(writeWiki && wikiPath),
  };
}

export { formatBytes, SESSIONS_ROOT, STATE_DIR };
