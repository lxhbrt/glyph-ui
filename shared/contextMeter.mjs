/**
 * Context LVL-UP meter — pure helpers (window map, fill math, format).
 * Used by bridge API and unit tests; client re-exports via utils/contextMeter.js.
 *
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/** Default soft-cap when model catalog has no auto_compact_threshold_percent. */
export const DEFAULT_SOFT_CAP_PERCENT = 80;

/** Conservative fallback when model id is unknown. */
export const DEFAULT_CONTEXT_WINDOW = 200_000;

/**
 * Known model → context window (tokens).
 * Keys are matched case-insensitively as exact id, then as substring of the
 * resolved model string (longest key wins for substring matches).
 *
 * Sources: Grok models_cache / provider cards (Luna, Sonnet 5, DeepSeek V4).
 */
export const CONTEXT_WINDOWS = {
  "grok-4.5": 500_000,
  "grok-4": 256_000,
  "grok-code": 256_000,
  "openai/gpt-5.6-luna": 1_000_000,
  "gpt-5.6-luna": 1_000_000,
  "gpt-5.6": 1_000_000,
  "anthropic/claude-sonnet-5": 1_000_000,
  "claude-sonnet-5": 1_000_000,
  "claude-sonnet-4": 1_000_000,
  "claude-opus-4": 200_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-7-sonnet": 200_000,
  "sonnet-5": 1_000_000,
  "sonnet 5": 1_000_000,
  "deepseek/deepseek-v4-flash": 1_000_000,
  "deepseek-v4-flash": 1_000_000,
  "deepseek-v4-flash-0731": 1_000_000,
  "deepseek/deepseek-reasoner": 1_000_000,
  "deepseek-reasoner": 1_000_000,
  "deepseek-chat": 1_000_000,
};

/** Profile defaults when no model id is known. */
export const PROFILE_DEFAULT_WINDOWS = {
  grok: 500_000,
  claude: 1_000_000,
  "glyph-agent": 1_000_000,
};

/**
 * Normalize a model id for map lookup.
 * @param {string | null | undefined} model
 * @returns {string}
 */
export function normalizeModelId(model) {
  return String(model || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/**
 * Which Glyph agent-profile family a model id belongs to.
 * Used so a sticky `grok-4.5` hint cannot pin the window after switching to
 * glyph-agent / claude.
 *
 * @param {string | null | undefined} model
 * @returns {"grok" | "claude" | "glyph-agent" | null}
 */
export function modelProfileFamily(model) {
  const id = normalizeModelId(model);
  if (!id) return null;
  if (id === "grok" || id === "claude" || id === "glyph-agent") return id;
  if (id.includes("grok")) return "grok";
  if (
    id.includes("claude") ||
    id.includes("sonnet") ||
    id.includes("opus") ||
    id.includes("anthropic") ||
    id.includes("fable")
  ) {
    return "claude";
  }
  // gpt / luna / deepseek / openrouter / minimax / … → cloud path under glyph-agent
  return "glyph-agent";
}

/**
 * @param {string | null | undefined} model
 * @param {string | null | undefined} profile
 * @returns {boolean}
 */
export function isModelCompatibleWithProfile(model, profile) {
  const p = String(profile || "")
    .trim()
    .toLowerCase();
  if (!p) return true;
  const fam = modelProfileFamily(model);
  if (!fam) return false;
  return fam === p;
}

/**
 * Resolve context window for a model (+ optional profile fallback).
 * Foreign model ids (e.g. grok-4.5 while profile is glyph-agent) are ignored
 * so the profile default applies until a matching used_model arrives.
 *
 * @param {string | null | undefined} model
 * @param {string | null | undefined} [profile]
 * @returns {{ window: number, source: "map" | "profile" | "default", matchedKey: string | null }}
 */
export function resolveContextWindow(model, profile) {
  const pid = String(profile || "")
    .trim()
    .toLowerCase();
  let id = normalizeModelId(model);
  if (id && pid && !isModelCompatibleWithProfile(model, profile)) {
    id = "";
  }
  if (id && CONTEXT_WINDOWS[id] != null) {
    return { window: CONTEXT_WINDOWS[id], source: "map", matchedKey: id };
  }
  if (id) {
    // Longest substring key wins (e.g. gpt-5.6-luna before gpt-5.6)
    let best = null;
    let bestLen = 0;
    for (const [key, win] of Object.entries(CONTEXT_WINDOWS)) {
      if (id.includes(key) || key.includes(id)) {
        if (key.length > bestLen) {
          best = { window: win, source: "map", matchedKey: key };
          bestLen = key.length;
        }
      }
    }
    if (best) return best;
  }
  if (pid && PROFILE_DEFAULT_WINDOWS[pid] != null) {
    return {
      window: PROFILE_DEFAULT_WINDOWS[pid],
      source: "profile",
      matchedKey: pid,
    };
  }
  return {
    window: DEFAULT_CONTEXT_WINDOW,
    source: "default",
    matchedKey: null,
  };
}

/**
 * @param {number | null | undefined} used
 * @param {number | null | undefined} windowTokens
 * @returns {number} 0..1
 */
export function contextFillRatio(used, windowTokens) {
  const w = Number(windowTokens);
  const u = Number(used);
  if (!Number.isFinite(w) || w <= 0) return 0;
  if (!Number.isFinite(u) || u <= 0) return 0;
  return Math.min(1, Math.max(0, u / w));
}

/**
 * Gold snake length as fraction of full track (0..1).
 * Gray front = contextFill; gold = scrollRatio × contextFill when overflow.
 *
 * @param {number} contextFill 0..1
 * @param {number} scrollRatio 0 = top, 1 = bottom
 * @param {boolean} hasOverflow
 * @returns {number} 0..1
 */
export function goldFillRatio(contextFill, scrollRatio, hasOverflow) {
  const fill = Math.min(1, Math.max(0, Number(contextFill) || 0));
  if (!hasOverflow) return fill;
  const scroll = Math.min(1, Math.max(0, Number(scrollRatio) || 0));
  return fill * scroll;
}

/**
 * Rough token estimate from visible chat text (chars/4).
 * @param {Iterable<string | null | undefined>} texts
 * @returns {number}
 */
export function estimateTokensFromTexts(texts) {
  let chars = 0;
  for (const t of texts) {
    if (t) chars += String(t).length;
  }
  if (chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 4));
}

/**
 * Compact token count for HUD (e.g. 241k, 1.0M).
 * @param {number} n
 * @returns {string}
 */
export function formatTokenCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "—";
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) {
    const k = v / 1000;
    return `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(Math.round(v));
}

/**
 * Hover / title line for the LVL bar.
 * @param {{
 *   used: number,
 *   window: number,
 *   model?: string,
 *   estimated?: boolean,
 *   softCapPercent?: number,
 * }} opts
 * @returns {string}
 */
export function formatContextTooltip(opts) {
  const used = Number(opts?.used) || 0;
  const win = Number(opts?.window) || 0;
  const pct = win > 0 ? Math.round((used / win) * 100) : 0;
  const approx = opts?.estimated ? "~" : "";
  const model = String(opts?.model || "").trim() || "unbekannt";
  const soft =
    opts?.softCapPercent != null && Number.isFinite(Number(opts.softCapPercent))
      ? ` · soft-cap ${Math.round(Number(opts.softCapPercent))}%`
      : "";
  return `${approx}${formatTokenCount(used)} / ${formatTokenCount(win)} · ${model} · ${approx}${pct}%${soft}`;
}

/**
 * Scroll ratio from a scrollable element (0 top … 1 bottom).
 * No overflow → 1 (full gold = context).
 * @param {{ scrollTop: number, scrollHeight: number, clientHeight: number } | null | undefined} el
 * @returns {{ scrollRatio: number, hasOverflow: boolean }}
 */
export function scrollMetrics(el) {
  if (!el) return { scrollRatio: 1, hasOverflow: false };
  const overflow = el.scrollHeight - el.clientHeight;
  if (overflow <= 4) return { scrollRatio: 1, hasOverflow: false };
  const ratio = Math.min(1, Math.max(0, el.scrollTop / overflow));
  return { scrollRatio: ratio, hasOverflow: true };
}
