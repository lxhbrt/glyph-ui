/**
 * ACP execution plan helpers (sessionUpdate: plan / plan_update / plan_removed).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

const STATUSES = new Set(["pending", "in_progress", "completed"]);
const PRIORITIES = new Set(["high", "medium", "low"]);

/**
 * Normalize ACP PlanEntry[] for the browser.
 * @param {unknown} raw
 * @returns {Array<{ content: string, status: string, priority: string }>}
 */
export function normalizePlanEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const content = String(e.content ?? e.text ?? e.title ?? "").trim();
    if (!content) continue;
    const status = STATUSES.has(e.status) ? e.status : "pending";
    const priority = PRIORITIES.has(e.priority) ? e.priority : "medium";
    out.push({ content, status, priority });
  }
  return out;
}

/**
 * Extract entries from a classic `plan` update or experimental `plan_update`.
 * @param {{ sessionUpdate?: string, entries?: unknown, plan?: unknown }} update
 * @returns {{ entries: ReturnType<typeof normalizePlanEntries>, planId: string | null, remove: boolean } | null}
 */
export function planUpdateFromSession(update) {
  if (!update || typeof update !== "object") return null;
  const kind = update.sessionUpdate;

  if (kind === "plan") {
    return {
      entries: normalizePlanEntries(update.entries),
      planId: update.planId != null ? String(update.planId) : null,
      remove: false,
    };
  }

  if (kind === "plan_removed") {
    return {
      entries: [],
      planId: update.planId != null ? String(update.planId) : null,
      remove: true,
    };
  }

  if (kind === "plan_update") {
    const plan = update.plan;
    if (!plan || typeof plan !== "object") return null;
    const planId = plan.planId != null ? String(plan.planId) : null;
    if (plan.type === "items") {
      return {
        entries: normalizePlanEntries(plan.entries),
        planId,
        remove: false,
      };
    }
    if (plan.type === "markdown") {
      const content = String(plan.content || "").trim();
      return {
        entries: content
          ? [{ content, status: "in_progress", priority: "medium" }]
          : [],
        planId,
        remove: false,
      };
    }
    if (plan.type === "file") {
      const uri = String(plan.uri || "").trim();
      return {
        entries: uri
          ? [
              {
                content: `Plan-Datei: ${uri}`,
                status: "in_progress",
                priority: "medium",
              },
            ]
          : [],
        planId,
        remove: false,
      };
    }
    // Unknown shape — try entries on the plan object itself
    if (Array.isArray(plan.entries)) {
      return {
        entries: normalizePlanEntries(plan.entries),
        planId,
        remove: false,
      };
    }
    return null;
  }

  return null;
}

/**
 * WS payload for the UI.
 * @param {ReturnType<typeof normalizePlanEntries>} entries
 * @param {string | null} [planId]
 */
export function planBroadcastPayload(entries, planId = null) {
  return {
    type: "plan",
    entries: Array.isArray(entries) ? entries : [],
    ...(planId ? { planId } : {}),
  };
}
