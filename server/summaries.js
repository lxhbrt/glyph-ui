/**
 * Session-Summaries — nicht-destruktiver, bestätigter Speichervorgang in den
 * zentralen Wiki-Vault (memory-wiki), Unterordner `summaries/`.
 *
 * Prinzip (Nutzer-Spezifikation):
 *  - Zielpfad aus `WIKI_PATH` (Alias: `OPENCLAW_WIKI_PATH`).
 *  - Nur in `summaries/` schreiben; bestehende Wiki-Strukturen
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

/** Expandiert `~/...` und leitet Zielpfad aus WIKI_PATH / OPENCLAW_WIKI_PATH ab. */
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
  const env = process.env.WIKI_PATH || process.env.OPENCLAW_WIKI_PATH;
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
 * Leitet den absoluten summaries-Pfad aus WIKI_PATH ab.
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
  if (data.skill?.name) {
    body.push("## Gelerntes Skill");
    body.push(
      data.skill.written
        ? `- Gespeichert: \`~/.glyph/skills/${data.skill.name}/SKILL.md\` (${data.skill.action || "write"})`
        : `- Vorschlag: \`${data.skill.name}\`${data.skill.reason ? ` — ${data.skill.reason}` : ""}`,
    );
    body.push("");
  }
  body.push(`_Erstellt per Glyph Session-Zusammenfassung (${new Date().toISOString()})._`);
  return body.join("\n");
}

/** Einzelwort-Ping (hi/test/ok…) — auch als Token in „TEST TEST TEST“. */
const TRIVIAL_TOKEN_RE =
  /^(hi|hallo|hey|test|ok|danke|thanks|ping|yo|sup|help|hilfe|\?+|…+)$/i;

/**
 * Test-Pings und Wiederholungen taugen nicht als Session-Titel / Skill-Name.
 * „TEST TEST TEST“ und „test“ sind trivial; echte Aufgabenzeilen nicht.
 */
export function isTrivialTitle(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return true;
  if (s.length < 8 && TRIVIAL_TOKEN_RE.test(s)) return true;
  if (TRIVIAL_TOKEN_RE.test(s)) return true;
  const tokens = s
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/i)
    .filter(Boolean);
  if (!tokens.length) return true;
  if (tokens.every((t) => TRIVIAL_TOKEN_RE.test(t))) return true;
  if (tokens.length >= 2 && tokens.every((t) => t === tokens[0]) && tokens[0].length <= 8) {
    return true;
  }
  return false;
}

/**
 * Deterministischer Draft aus Turns (kein LLM). Titel = letzte substanzielle
 * Nutzerzeile, nicht der erste Test-Ping. Erneutes Zusammenfassen nach weiteren
 * Turns spiegelt den aktuellen Stand (Start nur wenn nicht trivial).
 *
 * @param {Array<{role?: string, text?: string}>} turns
 * @param {{ title?: string }} [meta]
 * @returns {{title:string, summary:string, decisions:string[], open_items:string[], next_steps:string[], references:string[], turn_counts?:object}}
 */
export function buildDraftFromTurns(turns, meta = {}) {
  const userTurns = (turns || []).filter((t) => t.role === "user" && t.text && String(t.text).trim());
  const assistantTurns = (turns || []).filter(
    (t) => t.role === "assistant" && t.text && String(t.text).trim(),
  );
  const clean = (t, n) => String(t?.text || "").replace(/\s+/g, " ").trim().slice(0, n);

  const cleanedUsers = userTurns.map((t) => clean(t, 200)).filter(Boolean);
  const substantial = cleanedUsers.filter((t) => !isTrivialTitle(t));
  const metaTitle = String(meta.title || "").trim();
  const title = !isTrivialTitle(metaTitle)
    ? metaTitle.slice(0, 80)
    : substantial.length
      ? substantial[substantial.length - 1].slice(0, 80)
      : "Unbenannte Session";

  const firstUser = cleanedUsers[0] || "";
  const lastUser = cleanedUsers.length ? cleanedUsers[cleanedUsers.length - 1] : "";
  const lastAssistant = assistantTurns.length ? clean(assistantTurns[assistantTurns.length - 1], 400) : "";

  let summary = "Keine Nachrichten vorhanden.";
  if (firstUser || lastUser) {
    const parts = [
      `Session mit ${userTurns.length} Nutzer- und ${assistantTurns.length} Antwort-Turns.`,
    ];
    if (firstUser && !isTrivialTitle(firstUser)) {
      parts.push(`Start: „${firstUser.slice(0, 160)}".`);
    }
    if (lastUser && lastUser !== firstUser && !isTrivialTitle(lastUser)) {
      parts.push(`Zuletzt (Nutzer): „${lastUser.slice(0, 160)}".`);
    } else if (substantial.length && isTrivialTitle(firstUser)) {
      parts.push(`Zuletzt (Nutzer): „${substantial[substantial.length - 1].slice(0, 160)}".`);
    }
    if (lastAssistant) {
      parts.push(`Letztes Ergebnis: ${lastAssistant.slice(0, 280)}`);
    }
    summary = parts.join(" ");
  }

  const decisions = substantial.slice(-5).map((t) => t.slice(0, 180)).filter(Boolean);
  const next_steps = assistantTurns.slice(-3).map((t) => clean(t, 180)).filter(Boolean);

  return {
    title,
    summary,
    decisions,
    open_items: [],
    next_steps,
    references: [],
    turn_counts: { user: userTurns.length, assistant: assistantTurns.length },
  };
}

/**
 * Skill-Name aus Session-Titel (a-z0-9-, 2–48 Zeichen).
 * @param {string} title
 * @returns {string}
 */
export function skillNameFromTitle(title) {
  let s = slugify(title, 48);
  s = s.replace(/^-+|-+$/g, "");
  if (s.length < 2) s = "session-workflow";
  // Reservierte / existierende System-Skills nicht überschreiben-Namen
  if (["merken", "vault-ingest", "hseq-eingang", "hseq-handover", "hseq-aus-fertig-lernen"].includes(s)) {
    s = `session-${s}`;
  }
  return s.slice(0, 48);
}

/**
 * Ob aus dem Draft ein wiederverwendbarer Workflow-Skill lohnt.
 * Deterministisch, kein LLM (wie buildDraftFromTurns).
 *
 * @param {object} draft
 * @param {{ minUserTurns?: number }} [opts]
 * @returns {{ eligible: boolean, name: string, description: string, body: string, reason: string }}
 */
export function proposeSkillFromDraft(draft, opts = {}) {
  const minUser = Number(opts.minUserTurns) > 0 ? Number(opts.minUserTurns) : 3;
  const title = String(draft?.title || "").trim() || "Unbenannte Session";
  const name = skillNameFromTitle(title);
  const userN = Number(draft?.turn_counts?.user) || 0;
  const decisions = Array.isArray(draft?.decisions) ? draft.decisions.filter(Boolean) : [];
  const next = Array.isArray(draft?.next_steps) ? draft.next_steps.filter(Boolean) : [];
  const summary = String(draft?.summary || "").trim();

  if (userN < minUser) {
    return {
      eligible: false,
      name,
      description: "",
      body: "",
      reason: `Zu kurz (${userN} Nutzer-Turns, min. ${minUser}) — kein Skill.`,
    };
  }
  if (isTrivialTitle(title) || title.length < 8 || /^unbenannte session$/i.test(title)) {
    return {
      eligible: false,
      name,
      description: "",
      body: "",
      reason: "Titel zu generisch — kein Skill.",
    };
  }
  if (decisions.length < 2 && next.length < 1) {
    return {
      eligible: false,
      name,
      description: "",
      body: "",
      reason: "Zu wenig Schritte im Verlauf — kein Skill.",
    };
  }

  const descCore = summary.slice(0, 160) || title;
  const description =
    `Workflow aus Session-Zusammenfassung. Use when /${name} or similar: ${descCore}`.slice(
      0,
      280,
    );

  const lines = [
    `# ${name}`,
    "",
    "Wiederverwendbarer Ablauf — **automatisch** aus Glyph „Session zusammenfassen“.",
    "Kein Chat-Dump: nur Schritte und Ergebnis-Hinweise.",
    "",
    "## Wann",
    `Nutzer will denselben Ablauf wie in der Session „${title.slice(0, 80)}“.`,
    "",
    "## Schritte",
  ];
  const steps = decisions.length ? decisions : [title];
  steps.forEach((d, i) => lines.push(`${i + 1}. ${String(d).slice(0, 240)}`));
  if (next.length) {
    lines.push("", "## Ergebnis / Hinweise");
    for (const n of next) lines.push(`- ${String(n).slice(0, 240)}`);
  }
  lines.push("", "## Pflege");
  lines.push(
    "- Bei erneutem Zusammenfassen derselben Art: Skill erweitern (Nachtrag), nicht doppelte Skills.",
  );
  lines.push("- Hand-kuratierte Skills (ohne `source: session-summary`) werden nie überschrieben.");

  return {
    eligible: true,
    name,
    description,
    body: lines.join("\n"),
    reason: "Mehrstufiger Verlauf — Skill wird beim Speichern angelegt/erweitert.",
  };
}

/**
 * Schreibt oder erweitert `~/.glyph/skills/<name>/SKILL.md`.
 * - Neu: volle Datei mit frontmatter source: session-summary
 * - Existiert + source session-summary: Nachtrag anhängen
 * - Existiert + hand-kuratiert: **kein** Überschreiben; nur references/
 *
 * @param {object} proposal return von proposeSkillFromDraft (eligible true)
 * @param {{ home?: string, sessionId?: string, summaryPath?: string, profile?: string }} [ctx]
 * @returns {Promise<{ written: boolean, action: string, path: string, name: string, skipped?: boolean, reason?: string }>}
 */
export async function writeSkillFromProposal(proposal, ctx = {}) {
  if (!proposal?.eligible || !proposal.name) {
    return {
      written: false,
      action: "skip",
      path: "",
      name: proposal?.name || "",
      skipped: true,
      reason: proposal?.reason || "nicht eligible",
    };
  }
  const home = ctx.home || os.homedir();
  const name = skillNameFromTitle(proposal.name);
  const dir = path.join(home, ".glyph", "skills", name);
  const skillPath = path.join(dir, "SKILL.md");
  await fs.mkdir(dir, { recursive: true });

  const stamp = localDateParts();
  const sourceLine = [
    ctx.sessionId ? `session:${ctx.sessionId}` : null,
    ctx.summaryPath ? `summary:${ctx.summaryPath}` : null,
    ctx.profile ? `profile:${ctx.profile}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  let existing = null;
  try {
    existing = await fs.readFile(skillPath, "utf8");
  } catch {
    existing = null;
  }

  if (!existing) {
    const md = [
      "---",
      `name: ${name}`,
      `description: ${JSON.stringify(proposal.description || name)}`,
      "source: session-summary",
      "user-invocable: true",
      "---",
      "",
      proposal.body || `# ${name}`,
      "",
      sourceLine ? `_Quelle: ${sourceLine}_` : "",
      "",
    ]
      .filter((l) => l !== undefined)
      .join("\n");
    const tmp = path.join(dir, `.tmp-${crypto.randomBytes(4).toString("hex")}`);
    await fs.writeFile(tmp, md, "utf8");
    await fs.rename(tmp, skillPath);
    return { written: true, action: "create", path: skillPath, name };
  }

  const isLearned =
    /^source:\s*session-summary\s*$/m.test(existing) ||
    existing.includes("source: session-summary");

  if (!isLearned) {
    // Hand-Skill: nur Referenz ablegen, SKILL.md unangetastet
    const refDir = path.join(dir, "references");
    await fs.mkdir(refDir, { recursive: true });
    const refName = `session-${stamp.date}-${stamp.time}.md`;
    const refPath = path.join(refDir, refName);
    await fs.writeFile(
      refPath,
      [
        `# Session-Nachtrag (${stamp.date})`,
        "",
        proposal.body || "",
        "",
        sourceLine ? `_Quelle: ${sourceLine}_` : "",
        "",
      ].join("\n"),
      "utf8",
    );
    return {
      written: true,
      action: "reference",
      path: refPath,
      name,
      reason: "Hand-kuratiertes Skill — nur references/",
    };
  }

  // Learned Skill erweitern
  const nachtrag = [
    "",
    `## Nachtrag ${stamp.date} ${stamp.time.slice(0, 2)}:${stamp.time.slice(2, 4)}`,
    "",
    ...(Array.isArray(proposal._decisions)
      ? proposal._decisions.map((d) => `- ${String(d).slice(0, 200)}`)
      : (proposal.body || "")
          .split("\n")
          .filter((l) => /^\d+\.\s/.test(l) || l.startsWith("- "))
          .slice(0, 12)),
    sourceLine ? "" : "",
    sourceLine ? `_Quelle: ${sourceLine}_` : "",
    "",
  ].join("\n");

  // Cap growth: max ~24k
  let next = existing.trimEnd() + "\n" + nachtrag;
  if (next.length > 24000) {
    next = next.slice(0, 22000) + "\n\n_…ältere Nachträge gekürzt._\n";
  }
  const tmp = path.join(dir, `.tmp-${crypto.randomBytes(4).toString("hex")}`);
  await fs.writeFile(tmp, next, "utf8");
  await fs.rename(tmp, skillPath);
  return { written: true, action: "extend", path: skillPath, name };
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
