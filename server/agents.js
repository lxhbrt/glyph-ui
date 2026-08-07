/**
 * Agent profiles: which ACP agent the bridge spawns and what it can do.
 *
 * Glyph is an ACP client, not a model client — swapping the agent means
 * spawning a different binary, not pointing at a different API. Everything
 * that flows over ACP (chat, thoughts, tools, plans, attachments, fork)
 * works for any profile; grok-only extras are declared per profile so the
 * UI can grey them out instead of failing at runtime.
 *
 * Rollen (C′ 2026-08-07):
 *   Grok         = Build (XAI/Grok Binary)
 *   ^_Code       = Code (DeepSeek V4 Flash via OpenRouter, glyph-agent MODE=code)
 *   glyph-agent  = Vault/Tools + Cloud-Antwort (MODE=agent, kein Shell)
 *
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

import { accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Absoluter Pfad zur glyph-agent-ACP-Brücke (Tool-/Recherche- und CODE-Schicht).
const GLYPH_AGENT_ACP_FILE = fileURLToPath(new URL("./glyph-agent-acp.mjs", import.meta.url));
// OpenRouter-UI-Profil entfernt (B+ 2026-08-05): Cloud läuft nur noch *innerhalb* von glyph-agent.

export const DEFAULT_AGENT_ID = "grok";

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
 * @deprecated Claude-Profil entfernt (C′ 2026-08-07). Beibehalten für Tests/Kompat.
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
    args: ["-y", "@agentclientprotocol/claude-agent-acp", ...parseArgs(env.GLYPH_CLAUDE_ARGS)],
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
 * @property {NodeJS.ProcessEnv | Record<string, string>} [env]
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
  // Drei Profile: Grok (Build), ^_Code (DeepSeek-Code), glyph-agent (Vault).
  // Claude OAuth entfernt — Code läuft über glyph-agent MODE=code + OpenRouter DeepSeek.
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
      id: "_code",
      label: "^_Code",
      bin: process.execPath,
      args: [GLYPH_AGENT_ACP_FILE],
      via: "bin",
      // CODE-Modus: DeepSeek V4 Flash 0731, Workspace-Tools, Genehmigung in Glyph.
      env: {
        GLYPH_AGENT_MODE: "code",
        GLYPH_AGENT_ACP_NAME: "^_Code",
      },
      hint: "DeepSeek V4 Flash 0731 via OpenRouter · Read/Write/Shell (Whitelist) · Genehmigung in Glyph",
      capabilities: { deepSearch: false, activity: false, sessionList: false, sessionHistory: true, summarize: true },
    },
    {
      id: "glyph-agent",
      label: "glyph-agent",
      bin: process.execPath,
      args: [GLYPH_AGENT_ACP_FILE], // dünne Brücke zu glyph-agent (Tools: Vault, Recherche)
      via: "bin",
      env: {
        GLYPH_AGENT_MODE: "agent",
        GLYPH_AGENT_ACP_NAME: "glyph-agent",
      },
      hint: "B+: VaultFind (Hybrid) + Web (Exa/TinyFish) + Cloud-Antwort. Diff+Backup. Dienst :18899.",
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
  // Alias: alte UI-IDs / Tippfehler
  const raw = id == null ? "" : String(id);
  const normalized =
    raw === "claude" || raw === "code" || raw === "^_Code" ? "_code" : raw;
  return (
    findAgent(profiles, normalized) ||
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

/**
 * Kanonische Einstiegs-Ableitung für Summarize (ein zentraler Ort, von App.jsx/
 * CommandOverview genutzt und hier unit-getestet).
 *
 * @param {{id:string, capabilities?:object} | null | undefined} profile
 * @returns {{ lupeSummarize: boolean, activeSession: boolean }}
 */
export function summarizeCapabilities(profile) {
  const c = profile?.capabilities || {};
  const sessionHistory = Boolean(c.sessionHistory);
  const summarize = Boolean(c.summarize);
  const sessionList = Boolean(c.sessionList);
  return {
    // Lupe (persistente Session-Liste) braucht List + History + Summarize → nur Grok.
    lupeSummarize: sessionList && sessionHistory && summarize,
    // Aktiver In-Memory-Chat (glyph-agent / ^_Code): History + Summarize, ohne List.
    activeSession: sessionHistory && summarize,
  };
}
