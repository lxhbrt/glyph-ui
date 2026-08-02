/**
 * Agent profiles: which ACP agent the bridge spawns and what it can do.
 *
 * Glyph is an ACP client, not a model client — swapping the agent means
 * spawning a different binary, not pointing at a different API. Everything
 * that flows over ACP (chat, thoughts, tools, plans, attachments, fork)
 * works for any profile; grok-only extras are declared per profile so the
 * UI can grey them out instead of failing at runtime.
 *
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

import { accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Absoluter Pfad zur glyph-agent-ACP-Brücke (Tool-/Recherche-Schicht).
const GLYPH_AGENT_ACP_FILE = fileURLToPath(new URL("./glyph-agent-acp.mjs", import.meta.url));
// Absoluter Pfad zur OpenRouter-ACP-Adapter-Datei.
const OPENROUTER_ACP_FILE = fileURLToPath(new URL("./openrouter-acp.mjs", import.meta.url));

export const DEFAULT_AGENT_ID = "grok";

/** Fallback when the ACP adapter is not installed globally. */
const CLAUDE_ACP_PACKAGE = "@agentclientprotocol/claude-agent-acp";

/**
 * First executable match for `name` across PATH.
 * Pure fs lookups — no subprocess, safe to call while spawning.
 *
 * @param {string} name
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null} absolute path, or null when not found
 */
export function findOnPath(name, env = process.env) {
  if (!name || name.includes(path.sep)) return name || null;
  const dirs = String(env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const full = path.join(dir, name);
    try {
      accessSync(full, constants.X_OK);
      return full;
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * Split a shell-ish arg string. Supports simple quoting; no expansion.
 *
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseArgs(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

/**
 * Claude speaks ACP through an adapter. Prefer a global install, fall back
 * to npx so the profile also works before anyone runs `npm i -g`.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ bin: string, args: string[], via: string }}
 */
export function resolveClaudeCommand(env = process.env) {
  const explicit = String(env.GLYPH_CLAUDE_BIN || "").trim();
  if (explicit) {
    return { bin: explicit, args: parseArgs(env.GLYPH_CLAUDE_ARGS), via: "env" };
  }
  if (findOnPath("claude-agent-acp", env)) {
    return {
      bin: "claude-agent-acp",
      args: parseArgs(env.GLYPH_CLAUDE_ARGS),
      via: "path",
    };
  }
  return {
    bin: "npx",
    args: ["-y", CLAUDE_ACP_PACKAGE, ...parseArgs(env.GLYPH_CLAUDE_ARGS)],
    via: "npx",
  };
}

/**
 * @typedef {object} AgentProfile
 * @property {string} id
 * @property {string} label
 * @property {string} bin
 * @property {string[]} args
 * @property {string} [via]
 * @property {string} [hint]
 * @property {{ deepSearch: boolean, activity: boolean, sessionList: boolean, sessionHistory: boolean, summarize: boolean }} capabilities
 *   - deepSearch     : Grok-only Multi-Quellen-Recherche
 *   - activity       : Aktivitäts-Kalender (liest ~/.grok/events.jsonl)
 *   - sessionList    : persistente Session-Liste (nur grok, ~/.grok/sessions)
 *   - sessionHistory : aktiver In-Memory-Verlauf der aktuellen Session (über ACP session/history)
 *   - summarize      : Session-Zusammenfassung möglich (braucht sessionHistory)
 */

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {AgentProfile[]}
 */
export function buildAgentProfiles(env = process.env) {
  const claude = resolveClaudeCommand(env);
  // OpenRouter-Key aus der Prozess-Umgebung (kann auch leer sein).
  const openrouterKey = String(env.OPENROUTER_API_KEY || "");
  return [
    {
      id: "grok",
      label: "Grok",
      bin: String(env.GROK_BIN || "grok"),
      // Match TUI default: no --reasoning-effort override (model default).
      args: ["agent", "--always-approve", "--no-leader", "stdio"],
      via: "bin",
      capabilities: { deepSearch: true, activity: true, sessionList: true, sessionHistory: true, summarize: true },
    },
    {
      id: "claude",
      label: "Claude",
      bin: claude.bin,
      args: claude.args,
      via: claude.via,
      // Sessions/activity read ~/.grok/sessions directly; Claude keeps its
      // own store under ~/.claude/projects, so those views stay grok-only.
      hint: "Sitzungen liegen unter ~/.claude/projects — in Glyph nicht gelistet",
      capabilities: { deepSearch: false, activity: false, sessionList: false, sessionHistory: false, summarize: false },
    },
    {
      id: "glyph-agent",
      label: "glyph-agent",
      bin: process.execPath,
      args: [GLYPH_AGENT_ACP_FILE], // dünne Brücke zu glyph-agent (Tools: Vault, Recherche)
      via: "bin",
      hint: "Lokaler Agent (glyph-agent): Vault-Suche, Notizen lesen/bearbeiten (Diff+Backup), Web-Recherche. Braucht den lokalen Dienst (server.py) auf 127.0.0.1:18899.",
      // Kein persistentes Session-Listing, aber aktiver In-Memory-Verlauf (session/history) → summarize.
      capabilities: { deepSearch: false, activity: false, sessionList: false, sessionHistory: true, summarize: true },
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      bin: process.execPath,
      args: [OPENROUTER_ACP_FILE],
      via: "bin",
      // API-Key immer (auch leer) über die Prozess-Umgebung an den Adapter durchreichen.
      env: { OPENROUTER_API_KEY: openrouterKey },
      hint: "Cloud-Modelle via OpenRouter (Fallback für Grok/Claude-Kontingent). Chat nur.",
      // Kein persistentes Session-Listing, aber aktiver In-Memory-Verlauf (session/history) → summarize.
      capabilities: { deepSearch: false, activity: false, sessionList: false, sessionHistory: true, summarize: true },
    },
  ];
}

/**
 * @param {AgentProfile[]} profiles
 * @param {string | undefined | null} id
 * @returns {AgentProfile | null}
 */
export function findAgent(profiles, id) {
  if (!Array.isArray(profiles) || !id) return null;
  return profiles.find((p) => p.id === String(id)) || null;
}

/**
 * Resolve a requested id to a usable profile, falling back to the default.
 *
 * @param {AgentProfile[]} profiles
 * @param {string | undefined | null} id
 * @returns {AgentProfile}
 */
export function resolveAgent(profiles, id) {
  return (
    findAgent(profiles, id) ||
    findAgent(profiles, DEFAULT_AGENT_ID) ||
    profiles[0]
  );
}

/**
 * Wire shape for the browser: no env leakage beyond the command itself,
 * which the UI shows in the header tooltip for exactly the “which install
 * am I looking at” question.
 *
 * @param {AgentProfile | null} profile
 */
export function publicAgent(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    label: profile.label,
    command: [profile.bin, ...profile.args].join(" ").trim(),
    via: profile.via || "bin",
    hint: profile.hint || null,
    capabilities: { ...profile.capabilities },
  };
}

/**
 * @param {AgentProfile[]} profiles
 */
export function publicAgents(profiles) {
  if (!Array.isArray(profiles)) return [];
  return profiles.map((p) => publicAgent(p)).filter(Boolean);
}
