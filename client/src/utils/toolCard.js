/**
 * ACP tool-card summary + detail extraction (no React).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */

const STATUS_DE = {
  pending: "wartet",
  in_progress: "läuft",
  running: "läuft",
  completed: "fertig",
  failed: "fehl",
  cancelled: "abgebrochen",
  killed: "abgebrochen",
};

/**
 * @param {unknown} status
 */
export function formatToolStatus(status) {
  if (status == null || status === "") return "";
  const key = String(status).toLowerCase();
  return STATUS_DE[key] || key;
}

/**
 * @param {unknown} status
 */
export function isToolTerminal(status) {
  return /^(completed|failed|cancelled|killed)$/i.test(String(status || ""));
}

/**
 * @param {unknown} status
 */
export function isToolRunning(status) {
  return /^(pending|in_progress|running)$/i.test(String(status || ""));
}

/**
 * @param {unknown} p
 */
function basenamePath(p) {
  if (p == null) return "";
  const s = String(p);
  const parts = s.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || s;
}

/**
 * @param {object} raw
 * @param {string[]} keys
 */
function firstRaw(raw, keys) {
  if (!raw || typeof raw !== "object") return "";
  for (const k of keys) {
    if (raw[k] == null) continue;
    const v = String(raw[k]).trim();
    if (v) return v;
  }
  return "";
}

function pathTarget(raw, locations, title) {
  const fromRaw = firstRaw(raw, [
    "target_file",
    "file_path",
    "path",
    "url",
  ]);
  if (fromRaw) return basenamePath(fromRaw);
  const loc = Array.isArray(locations) && locations[0]?.path;
  if (loc) return basenamePath(loc);
  if (title) {
    const stripped = String(title).replace(/^(Read|Write|Edit|List)\s+/i, "");
    if (stripped && stripped !== title) return basenamePath(stripped);
  }
  return "";
}

function lineDelta(out) {
  if (!out || typeof out !== "object") return { add: 0, del: 0 };
  const add = Number(out.lines_added ?? out.linesAdded ?? 0);
  const del = Number(out.lines_removed ?? out.linesRemoved ?? 0);
  return {
    add: Number.isFinite(add) && add > 0 ? add : 0,
    del: Number.isFinite(del) && del > 0 ? del : 0,
  };
}

/**
 * @param {object} msg
 * @returns {{ verb: string, target: string, deltaAdd: number, deltaDel: number }}
 */
export function summarizeTool(msg = {}) {
  const raw = msg.rawInput && typeof msg.rawInput === "object" ? msg.rawInput : {};
  const title = String(msg.title || msg.name || "");
  const lower = title.toLowerCase();
  const kind = String(msg.kind || "").toLowerCase();
  const deltas = lineDelta(msg.rawOutput);

  if (kind === "read" || /^read\b/.test(lower)) {
    return {
      verb: "Gelesen",
      target: pathTarget(raw, msg.locations, title),
      deltaAdd: 0,
      deltaDel: 0,
    };
  }
  if (kind === "edit" || /^(edit|write)\b/.test(lower)) {
    return {
      verb: /write/.test(lower) && kind !== "edit" ? "Geschrieben" : "Geändert",
      target: pathTarget(raw, msg.locations, title),
      deltaAdd: deltas.add,
      deltaDel: deltas.del,
    };
  }
  if (kind === "execute" || /^(run|execute|bash|shell)\b/.test(lower)) {
    const cmd = firstRaw(raw, ["command", "cmd"]) || title.replace(/^(Execute|Ran|Run)\s+`?/, "").replace(/`$/, "");
    return { verb: "Ausgeführt", target: cmd, deltaAdd: 0, deltaDel: 0 };
  }
  if (
    kind === "search" ||
    /search/.test(lower) ||
    raw.query != null ||
    raw.pattern != null
  ) {
    return {
      verb: "Gesucht",
      target: firstRaw(raw, ["query", "q", "pattern", "search"]) || title,
      deltaAdd: 0,
      deltaDel: 0,
    };
  }
  if (kind === "delete") {
    return {
      verb: "Gelöscht",
      target: pathTarget(raw, msg.locations, title),
      deltaAdd: 0,
      deltaDel: 0,
    };
  }
  if (kind === "fetch" || /fetch/.test(lower)) {
    return {
      verb: "Geholt",
      target: firstRaw(raw, ["url", "path"]) || title,
      deltaAdd: 0,
      deltaDel: 0,
    };
  }
  if (kind === "move") {
    return {
      verb: "Verschoben",
      target: pathTarget(raw, msg.locations, title),
      deltaAdd: 0,
      deltaDel: 0,
    };
  }
  if (/^list/.test(lower) || kind === "list") {
    return {
      verb: "Liste",
      target: pathTarget(raw, msg.locations, title),
      deltaAdd: 0,
      deltaDel: 0,
    };
  }

  return {
    verb: title || kind || "Tool",
    target: "",
    deltaAdd: 0,
    deltaDel: 0,
  };
}

function contentTexts(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.text === "string" && item.text) out.push(item.text);
    const inner = item.content;
    if (inner && typeof inner === "object" && typeof inner.text === "string") {
      out.push(inner.text);
    }
  }
  return out;
}

function contentDiffs(content) {
  if (!Array.isArray(content)) return [];
  return content.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      (item.type === "diff" || item.oldText != null || item.newText != null) &&
      (item.oldText != null || item.newText != null || item.old_string != null),
  );
}

function asDiffText(oldStr, newStr) {
  const minus = String(oldStr ?? "")
    .split("\n")
    .map((l) => `- ${l}`)
    .join("\n");
  const plus = String(newStr ?? "")
    .split("\n")
    .map((l) => `+ ${l}`)
    .join("\n");
  return `${minus}\n${plus}`.trim();
}

/**
 * @param {{ sections: Array<{ label: string, text: string, kind?: string }> }} details
 */
export function toolHasDetails(details) {
  return Boolean(details && Array.isArray(details.sections) && details.sections.length);
}

/**
 * @param {object} msg
 * @returns {{ sections: Array<{ label: string, text: string, kind?: string }> }}
 */
export function extractToolDetails(msg = {}) {
  const sections = [];
  const raw = msg.rawInput && typeof msg.rawInput === "object" ? msg.rawInput : {};
  const kind = String(msg.kind || "").toLowerCase();

  const cmd = firstRaw(raw, ["command", "cmd"]);
  if (kind === "execute" && cmd) {
    sections.push({ label: "Befehl", text: cmd, kind: "text" });
  }

  const query = firstRaw(raw, ["query", "q", "pattern"]);
  if ((kind === "search" || query) && query && kind !== "execute") {
    sections.push({ label: "Suche", text: query, kind: "text" });
  }

  const oldStr = raw.old_string ?? raw.oldStr ?? raw.before;
  const newStr = raw.new_string ?? raw.newStr ?? raw.after;
  if (oldStr != null && newStr != null) {
    const path = firstRaw(raw, ["path", "file_path", "target_file"]);
    if (path) sections.push({ label: "Datei", text: path, kind: "text" });
    sections.push({ label: "Diff", text: asDiffText(oldStr, newStr), kind: "diff" });
  }

  for (const d of contentDiffs(msg.content)) {
    const a = d.oldText ?? d.old_string ?? "";
    const b = d.newText ?? d.new_string ?? "";
    if (a || b) {
      sections.push({
        label: d.path ? `Diff · ${basenamePath(d.path)}` : "Diff",
        text: asDiffText(a, b),
        kind: "diff",
      });
    }
  }

  const texts = contentTexts(msg.content);
  if (texts.length) {
    const joined = texts.join("\n").trim();
    if (joined) {
      sections.push({
        label: kind === "execute" ? "Ausgabe" : "Ausgabe",
        text: joined.length > 8000 ? `${joined.slice(0, 8000)}…` : joined,
        kind: "text",
      });
    }
  }

  return { sections };
}

/** Fixture messages for `?toolcard=demo`. */
export const TOOLCARD_DEMO_MESSAGES = [
  {
    id: "tool-demo-read",
    role: "tool",
    toolCallId: "demo-read",
    title: "read_file",
    kind: "read",
    status: "completed",
    text: "read_file · completed",
    rawInput: { target_file: "/Users/me/glyph-ui/server/index.js" },
    content: [
      { type: "content", content: { type: "text", text: "export function boot() {\n  return true;\n}\n" } },
    ],
  },
  {
    id: "tool-demo-edit",
    role: "tool",
    toolCallId: "demo-edit",
    title: "search_replace",
    kind: "edit",
    status: "completed",
    text: "search_replace · completed",
    rawInput: {
      file_path: "client/src/App.jsx",
      old_string: "const x = 1;",
      new_string: "const x = 2;",
    },
    rawOutput: { lines_added: 1, lines_removed: 1 },
  },
  {
    id: "tool-demo-fail",
    role: "tool",
    toolCallId: "demo-fail",
    title: "run_terminal_command",
    kind: "execute",
    status: "failed",
    text: "run_terminal_command · failed",
    rawInput: { command: "npm test" },
    content: [
      { type: "content", content: { type: "text", text: "not ok 1 — Expected 2\n" } },
    ],
  },
  {
    id: "tool-demo-search",
    role: "tool",
    toolCallId: "demo-search",
    title: "web_search",
    kind: "search",
    status: "completed",
    text: "web_search · completed",
    rawInput: { query: "ACP tool_call" },
    content: [
      { type: "content", content: { type: "text", text: "1. Agent Client Protocol — session/update\n" } },
    ],
  },
  {
    id: "tool-demo-plain",
    role: "tool",
    toolCallId: "demo-plain",
    title: "read_file",
    kind: "read",
    status: "pending",
    text: "read_file · pending",
  },
];
