/**
 * Session-Summaries — nicht-destruktiver, bestätigter Speichervorgang in den
 * zentralen Wiki-Vault (OpenClaw memory-wiki), Unterordner `summaries/`.
 *
 * Prinzip (Nutzer-Spezifikation):
 *  - Zielpfad AUSSCHLIESSLICH aus `OPENCLAW_WIKI_PATH` abgeleitet.
 *  - Nur in `summaries/` schreiben; bestehende OpenClaw-Strukturen
 *    (index.md, sources/, concepts/, entities/, managed blocks) NIE anfassen.
 *  - Pfad-Traversal + unsichere Dateinamen verhindern.
 *  - Bestehende Datei NIEMALS überschreiben — jeder Commit = neuer Snapshot
 *    (Zeitstempel im Namen), damit man nach weiteren Turns erneut
 *    zusammenfassen kann (Checkpoints für °_Agent / ^_Code ohne Grok-Verlauf).
 *  - Atomar speichern: Temp-Datei + exklusives rename.
 *  - Kein automatischer Index-Eingriff (zunächst ohne Index-Update).
 *
 * Ablauf: Draft (ohne Schreiben) → Vorschau → Commit (erst nach Bestätigung).
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

/** Alias-Mapping: Profil → KI-Kürzel (für Dateiname + Frontmatter). */
export const AGENT_SLUGS = {
  grok: "Grok",
  claude: "Code", // legacy
  _code: "Code",
  code: "Code",
  // openrouter: nur Legacy-Alias für alte Summary-Dateinamen (kein UI-Profil mehr)
  openrouter: "Glyph-Agent",
  "glyph-agent": "Glyph-Agent",
  // UI-Label °_Agent (id bleibt glyph-agent)
  "-_agent": "Glyph-Agent",
  _agent: "Glyph-Agent",
  agent: "Glyph-Agent",
};

/** Standard-Alias (Fallback, wenn Profil unbekannt). */
function agentSlug(profile) {
  const p = String(profile || "").toLowerCase();
  return AGENT_SLUGS[p] || "Agent";
}

/** Expandiert `~/...` und leitet Zielpfad aus OPENCLAW_WIKI_PATH ab. */
function expandHome(p) {
  const s = String(p || "").trim();
  if (!s) return s;
  if (s === "~") return os.homedir();
  if (s.startsWith("~/") || s.startsWith("~" + path.sep)) {
    return path.join(os.homedir(), s.slice(2));
  }
  return s;
}

export function getWikiRoot() {
  const env = process.env.OPENCLAW_WIKI_PATH;
  if (env && env.trim()) return expandHome(env.trim());
  // Fallback ist der App-lokale Wiki (kein Suchen von Obsidian-Pfaden im Repo).
  return expandHome(path.join(os.homedir(), ".glyph-ui", "wiki"));
}

/** Nur ASCII-Slug für Dateinamen (sicher gegen Traversal/Sonderzeichen). */
function slugify(text, max = 50) {
  return String(text || "topic")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .toLowerCase() || "topic";
}

/** Lokales Datum/Zeit (nicht UTC) — Dateinamen folgen der Nutzer-Zeitzone. */
export function localDateParts(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    /** HHmmss — macht jeden Commit innerhalb eines Tages eindeutig. */
    time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
  };
}

/**
 * Baut einen sicheren Dateinamen:
 *   YYYY-MM-DD-HHmmss--Titel--KI-Kürzel--SessionID.md
 * Zeitstempel = neuer Snapshot bei erneutem Zusammenfassen derselben Session.
 * Verhindert Pfad-Traversal: nur der (validierte) Basisname wird zurückgegeben.
 */
export function buildFileName({ title, sessionId, profile, date, time, stamp }) {
  const parts = localDateParts();
  const d = String(date || parts.date);
  // stamp: voller Zeit-Teil (default HHmmss); time: Alias für stamp.
  const s = String(stamp || time || parts.time).replace(/[^0-9A-Za-z-]/g, "").slice(0, 16);
  const t = slugify(title);
  const slug = agentSlug(profile);
  const sid = String(sessionId || crypto.randomBytes(4).toString("hex")).slice(0, 8);
  const base = `${d}-${s}--${t}--${slug}--${sid}.md`;
  // Sicherheits-Check: darf keinen Pfad-Trick enthalten.
  if (base !== path.basename(base) || base.includes("..")) {
    throw new Error("Unsicherer Dateiname.");
  }
  return base;
}

/**
 * Erzeugt den Zielpfad (nur innerhalb von <wikiRoot>/summaries/).
 * Leitet den absoluten summaries-Pfad aus OPENCLAW_WIKI_PATH ab.
 */
export function resolveSummariesDir(wikiRoot = getWikiRoot()) {
  return path.join(wikiRoot, "summaries");
}

/**
 * Erzeugt den vollständigen, sicheren Zielpfad. Wirft, wenn er außerhalb
 * von summaries/ läge (Pfad-Traversal-Schutz).
 */
export function resolveTargetPath(fileName, wikiRoot = getWikiRoot()) {
  const summaries = resolveSummariesDir(wikiRoot);
  const resolved = path.resolve(summaries, fileName);
  const base = path.resolve(summaries);
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error("Zielpfad außerhalb von summaries/ — abgelehnt.");
  }
  return resolved;
}

/**
 * Baut das YAML-Frontmatter + Markdown-Body aus der zusammengefassten Struktur.
 * @param {object} data siehe Spezifikations-JSON
 */
export function renderSummaryDocument(data) {
  const meta = data.meta || {};
  const profile = meta.profile || "agent";
  const front = [
    "---",
    "type: glyph-session-summary",
    `title: ${JSON.stringify(data.title || "")}`,
    `session_id: ${JSON.stringify(meta.sessionId || "")}`,
    `created_at: ${JSON.stringify(new Date().toISOString())}`,
    `profile: ${JSON.stringify(profile)}`,
    `agent: ${JSON.stringify(agentSlug(profile))}`,
    `model: ${JSON.stringify(meta.model || "")}`,
    `status: confirmed`,
    `external_processing: ${meta.external_processing ? "true" : "false"}`,
  ];
  const tags = Array.isArray(data.tags) ? data.tags : [];
  if (!tags.includes("session-summary")) tags.unshift("session-summary");
  front.push("tags:");
  for (const t of tags) front.push(`  - ${String(t).toLowerCase()}`);
  front.push("---", "");

  const body = [front.join("\n")];
  body.push(`# ${data.title || "Session-Zusammenfassung"}`);
  body.push("");
  body.push((data.summary || "").trim());
  body.push("");

  if (Array.isArray(data.decisions) && data.decisions.length) {
    body.push("## Entscheidungen");
    for (const d of data.decisions) body.push(`- ${String(d)}`);
    body.push("");
  }
  if (Array.isArray(data.open_items) && data.open_items.length) {
    body.push("## Offene Punkte");
    for (const o of data.open_items) body.push(`- [ ] ${String(o)}`);
    body.push("");
  }
  if (Array.isArray(data.next_steps) && data.next_steps.length) {
    body.push("## Nächste Schritte");
    for (const n of data.next_steps) body.push(`- [ ] ${String(n)}`);
    body.push("");
  }
  if (Array.isArray(data.references) && data.references.length) {
    body.push("## Referenzen / Anhänge");
    for (const r of data.references) body.push(`- ${String(r)}`);
    body.push("");
  }
  body.push(`_Erstellt per Glyph Session-Zusammenfassung (${new Date().toISOString()})._`);
  return body.join("\n");
}

/**
 * ATOMAR speichern: Temp-Datei + rename. Nie überschreiben.
 * Dateiname enthält HHmmss — erneutes Zusammenfassen derselben Session
 * erzeugt einen neuen Snapshot (Checkpoints nach weiteren Turns).
 * Bei Kollision (gleicher Sekunde / Race): Suffix -2, -3, …
 * @returns {Promise<{path:string, fileName:string, existed:boolean, written:boolean}>}
 */
export async function writeSummaryAtomically(data, wikiRoot = getWikiRoot()) {
  const summaries = resolveSummariesDir(wikiRoot);
  await fs.mkdir(summaries, { recursive: true });

  const parts = localDateParts();
  const baseStamp = data.meta?.stamp || data.meta?.time || parts.time;
  const common = {
    title: data.title,
    sessionId: data.meta?.sessionId,
    profile: data.meta?.profile,
    date: data.meta?.date || parts.date,
  };

  let lastErr = null;
  for (let i = 0; i < 40; i++) {
    const stamp = i === 0 ? baseStamp : `${baseStamp}-${i + 1}`;
    const fileName = buildFileName({ ...common, stamp });
    const target = resolveTargetPath(fileName, wikiRoot);

    try {
      await fs.access(target);
      // belegt → nächster Stamp
      continue;
    } catch {
      /* free */
    }

    const tmp = path.join(summaries, `.tmp-${crypto.randomBytes(6).toString("hex")}`);
    try {
      await fs.writeFile(tmp, renderSummaryDocument(data), "utf8");
      await fs.rename(tmp, target);
      return { path: target, fileName, existed: false, written: true };
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      // EEXIST/race → nächster Versuch; sonst raus
      if (err && (err.code === "EEXIST" || err.code === "ENOTEMPTY")) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error("Kein freier Dateiname für die Zusammenfassung (zu viele Snapshots/s).");
}
