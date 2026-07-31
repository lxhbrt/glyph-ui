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
 * @property {{ deepSearch: boolean, sessions: boolean, activity: boolean }} capabilities
 */

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {AgentProfile[]}
 */
export function buildAgentProfiles(env = process.env) {
  const claude = resolveClaudeCommand(env);
  return [
    {
      id: "grok",
      label: "Grok",
      bin: String(env.GROK_BIN || "grok"),
      // Match TUI default: no --reasoning-effort override (model default).
      args: ["agent", "--always-approve", "--no-leader", "stdio"],
      via: "bin",
      capabilities: { deepSearch: true, sessions: true, activity: true },
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
      capabilities: { deepSearch: false, sessions: false, activity: false },
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
