/**
 * ^_Code Freigabe-Scopes (Einmal / Auftrag / Task).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */

export const GRANT_CLASSES = [
  { id: "file_change", label: "Dateiänderungen" },
  { id: "test", label: "Tests" },
];

export function formatIdleRemaining(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "abgelaufen";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return "<1 min";
}

export function prefixesFromSuggested(suggested) {
  const raw = suggested?.path_prefixes;
  if (Array.isArray(raw) && raw.length) return raw.map(String);
  return ["."];
}

export function classesFromSuggested(suggested) {
  const raw = suggested?.action_classes;
  if (Array.isArray(raw) && raw.length) {
    return raw.filter((c) => GRANT_CLASSES.some((g) => g.id === c));
  }
  return ["file_change", "test"];
}

/**
 * Encode Task-Scope in ACP optionId (protocol only carries optionId).
 * @param {string} scope
 * @param {object} [spec]
 */
export function encodeGrantOptionId(scope, spec) {
  if (scope === "auftrag") return "allow-auftrag";
  if (scope === "once") return "allow-once";
  if (scope !== "task") return "allow-once";
  const payload = {
    label: String(spec?.label || "").slice(0, 80),
    path_prefixes: Array.isArray(spec?.path_prefixes)
      ? spec.path_prefixes
      : prefixesFromSuggested(spec),
    action_classes: Array.isArray(spec?.action_classes)
      ? spec.action_classes
      : classesFromSuggested(spec),
    workspace_root: spec?.workspace_root || "",
  };
  return `allow-task:${JSON.stringify(payload)}`;
}

export function parseGrantOptionId(optionId) {
  const id = String(optionId || "");
  if (id === "allow-auftrag" || id === "allow_auftrag") {
    return { allowed: true, scope: "auftrag", spec: null };
  }
  if (id === "allow-once" || id === "allow_once") {
    return { allowed: true, scope: "once", spec: null };
  }
  if (id === "allow-always" || id === "allow_always") {
    // Alt: Session-Always → Auftrag, nie Chat-weit.
    return { allowed: true, scope: "auftrag", spec: null };
  }
  if (id === "allow-task" || id === "allow_task") {
    return { allowed: true, scope: "task", spec: null };
  }
  if (id.startsWith("allow-task:")) {
    try {
      const spec = JSON.parse(id.slice("allow-task:".length));
      return { allowed: true, scope: "task", spec };
    } catch {
      return { allowed: true, scope: "task", spec: null };
    }
  }
  return { allowed: false, scope: null, spec: null };
}

export function grantWhyLabel(why) {
  const s = String(why || "").trim();
  return s;
}

export function formatActionClasses(ids) {
  if (!Array.isArray(ids) || !ids.length) return "";
  return ids
    .map((id) => GRANT_CLASSES.find((g) => g.id === id)?.label || String(id))
    .join(", ");
}

/** Preview `?grant=demo` — blocking Freigabe-Dialog without ACP. */
export const GRANT_DEMO_REQ = {
  id: "grant-demo",
  title: "search_replace",
  kind: "edit",
  preview:
    "--- client/src/styles.css\n+++ client/src/styles.css\n- --gold: #c9a227;\n+ --gold: #d4af37;\n",
  options: [],
  grant: {
    requires_grant: true,
    suggested: {
      label: "Dark Mode",
      path_prefixes: ["client/src"],
      action_classes: ["file_change", "test"],
      workspace_root: "/Users/me/glyph-ui",
    },
  },
};

/** Preview `?task=demo` — Aktiver Task in der Arbeitsleiste. */
export const TASK_DEMO = {
  grant_id: "demo",
  label: "Dark Mode",
  workspace_root: "/Users/me/glyph-ui",
  path_prefixes: ["client/src"],
  action_classes: ["file_change", "test"],
  idle_remaining_s: 90 * 60,
  why: "Task Dark Mode",
};
