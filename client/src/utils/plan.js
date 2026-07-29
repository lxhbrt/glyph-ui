/**
 * Plan bar helpers (ACP execution plan display).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * @param {Array<{ status?: string }>} entries
 * @returns {{ done: number, total: number, current: string | null, allDone: boolean }}
 */
export function planProgress(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const total = list.length;
  let done = 0;
  let current = null;
  for (const e of list) {
    if (e?.status === "completed") done += 1;
    else if (e?.status === "in_progress" && !current) {
      current = String(e.content || "").trim() || null;
    }
  }
  if (!current) {
    const pending = list.find((e) => e?.status === "pending");
    if (pending) current = String(pending.content || "").trim() || null;
  }
  return {
    done,
    total,
    current,
    allDone: total > 0 && done === total,
  };
}

/** Compact glyph for entry status (slim bar). */
export function planStatusGlyph(status) {
  if (status === "completed") return "✓";
  if (status === "in_progress") return "●";
  return "○";
}

/**
 * @param {unknown} raw
 * @returns {Array<{ content: string, status: string, priority: string }>}
 */
export function normalizeClientPlanEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const ok = new Set(["pending", "in_progress", "completed"]);
  const pri = new Set(["high", "medium", "low"]);
  return raw
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const content = String(e.content ?? "").trim();
      if (!content) return null;
      return {
        content,
        status: ok.has(e.status) ? e.status : "pending",
        priority: pri.has(e.priority) ? e.priority : "medium",
      };
    })
    .filter(Boolean);
}
