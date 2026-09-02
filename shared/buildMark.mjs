/**
 * Visible Glyph build mark from git commit count.
 * 90 → 0.9.0, 112 → 1.1.2. Integer stays for drift compare.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/** @param {unknown} n */
export function formatBuildMark(n) {
  const i = Number(n);
  if (!Number.isFinite(i) || i <= 0) return "";
  const v = Math.trunc(i);
  const patch = v % 10;
  const minor = Math.trunc(v / 10) % 10;
  const major = Math.trunc(v / 100);
  return `${major}.${minor}.${patch}`;
}

/** @param {unknown} n */
export function glyphBuildLabel(n) {
  const mark = formatBuildMark(n);
  return mark ? `#${mark}` : "";
}
