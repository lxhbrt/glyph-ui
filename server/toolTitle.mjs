/**
 * Human-readable tool row titles from ACP tool_call / tool_call_update.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 *
 * Grok often sends `name` / `kind` / locations but leaves `title` empty.
 * Falling back to `toolCallId` (call-…) is what made the UI look broken.
 */

/**
 * @param {unknown} s
 * @returns {boolean}
 */
export function isOpaqueToolId(s) {
  if (s == null) return true;
  const t = String(s).trim();
  if (!t) return true;
  if (/^call[-_]/i.test(t)) return true;
  if (/^tool[-_]?[0-9a-f-]{8,}/i.test(t)) return true;
  // bare UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * @param {unknown} p
 * @returns {string}
 */
export function basenamePath(p) {
  if (p == null) return "";
  const s = String(p);
  const parts = s.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || s;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function titleFromRawInput(raw) {
  if (!raw || typeof raw !== "object") return "";
  const o = /** @type {Record<string, unknown>} */ (raw);
  for (const k of [
    "name",
    "tool",
    "toolName",
    "command",
    "path",
    "target_file",
    "query",
    "pattern",
  ]) {
    if (o[k] == null) continue;
    const v = String(o[k]).trim();
    if (!v) continue;
    if (k === "path" || k === "target_file") return basenamePath(v);
    return v.slice(0, 80);
  }
  return "";
}

/**
 * @param {object} update ACP tool_call / tool_call_update payload
 * @param {object} [prev] previous activeTools entry
 * @returns {string}
 */
export function resolveToolDisplayTitle(update = {}, prev = {}) {
  const candidates = [
    update?.title,
    update?.name,
    prev?.title,
    prev?.name,
  ];
  for (const c of candidates) {
    if (c != null && !isOpaqueToolId(c)) return String(c).trim();
  }

  const kind = update?.kind || prev?.kind || "";
  const locs = update?.locations || prev?.locations || [];
  const path = Array.isArray(locs) && locs[0]?.path ? locs[0].path : "";
  if (kind && path) return `${kind} · ${basenamePath(path)}`;
  if (kind) return String(kind);

  const fromRaw =
    titleFromRawInput(update?.rawInput) || titleFromRawInput(prev?.rawInput);
  if (fromRaw && !isOpaqueToolId(fromRaw)) return fromRaw;

  return "tool";
}
