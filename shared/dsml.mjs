/**
 * DeepSeek V4 DSML — never show tool markup as chat.
 * Mirrors glyph-agent core/tool_registry.py looks_like_dsml / prose_before_dsml.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

const PIPE = String.raw`(?:\|{1,2}|\uFF5C)`;
const DSML_TAG = new RegExp(
  String.raw`<\s*/?\s*${PIPE}(?:\s*${PIPE})?\s*DSML\s*${PIPE}(?:\s*${PIPE})?\s*[A-Za-z_][\w]*[^>]*>`,
  "i",
);

export function looksLikeDsml(text) {
  return DSML_TAG.test(String(text || ""));
}

/** Prose before the first DSML tag. Markup itself never returned. */
export function stripDsmlLeak(text) {
  const s = String(text || "");
  if (!s) return "";
  const m = s.match(DSML_TAG);
  if (!m || m.index == null) return s;
  return s.slice(0, m.index).trim();
}

export function publicAgentText(text, fallback = "") {
  const raw = String(text || "");
  if (!looksLikeDsml(raw)) return raw;
  return stripDsmlLeak(raw) || fallback;
}
