/**
 * Slash-Popup helpers: token detection, insert, fuzzy rank.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * @typedef {object} SlashToken
 * @property {number} start  index of `/`
 * @property {number} end    cursor-side end of token
 * @property {string} query  text after `/` (may be empty)
 */

/**
 * Find a slash command token at `cursor` if `/` is at line start or after whitespace.
 *
 * @param {string} text
 * @param {number} cursor
 * @returns {SlashToken | null}
 */
export function slashTokenAt(text, cursor) {
  const s = String(text ?? "");
  const c = Math.max(0, Math.min(Number(cursor) || 0, s.length));
  // Walk back to token start
  let i = c - 1;
  while (i >= 0) {
    const ch = s[i];
    if (ch === "\n" || ch === " " || ch === "\t") break;
    i -= 1;
  }
  const start = i + 1;
  if (start >= s.length || s[start] !== "/") return null;
  // Valid trigger: start of string, after whitespace/newline
  if (start > 0) {
    const prev = s[start - 1];
    if (prev !== " " && prev !== "\t" && prev !== "\n") return null;
  }
  // Token body: no spaces
  let end = start + 1;
  while (end < s.length && end < c) {
    const ch = s[end];
    if (ch === " " || ch === "\t" || ch === "\n") break;
    end += 1;
  }
  // If cursor is past a space after the token, popup closed
  if (c > end && /\s/.test(s[end] || "")) return null;
  const query = s.slice(start + 1, c);
  if (/[\s]/.test(query)) return null;
  return { start, end: c, query };
}

/**
 * Replace the active slash token with `/{name} ` (trailing space).
 *
 * @param {string} text
 * @param {number} cursor
 * @param {string} name  without leading slash
 * @returns {{ text: string, cursor: number } | null}
 */
export function insertSlashCommand(text, cursor, name) {
  const token = slashTokenAt(text, cursor);
  const cmd = String(name || "")
    .trim()
    .replace(/^\//, "");
  if (!cmd) return null;
  const s = String(text ?? "");
  const c = Math.max(0, Math.min(Number(cursor) || 0, s.length));
  if (token) {
    const inserted = `/${cmd} `;
    const next = s.slice(0, token.start) + inserted + s.slice(token.end);
    return { text: next, cursor: token.start + inserted.length };
  }
  // Fallback: append at cursor
  const inserted = `/${cmd} `;
  const next = s.slice(0, c) + inserted + s.slice(c);
  return { text: next, cursor: c + inserted.length };
}

/**
 * Fuzzy score: higher is better. 0 = no match.
 *
 * @param {string} query
 * @param {string} name
 * @param {string} [description]
 * @returns {number}
 */
export function fuzzyScore(query, name, description = "", aliases = []) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const n = String(name || "").toLowerCase();
  const d = String(description || "").toLowerCase();
  if (!q) return 1;
  if (n === q) return 1000;
  if (n.startsWith(q)) return 800 - Math.min(n.length, 100);
  if (n.includes(q)) return 500 - n.indexOf(q);
  if (d.includes(q)) return 200;
  const aliasList = Array.isArray(aliases) ? aliases : [];
  for (const a of aliasList) {
    const al = String(a || "").toLowerCase();
    if (!al) continue;
    if (al === q) return 950;
    if (al.startsWith(q)) return 750 - Math.min(al.length, 100);
    if (al.includes(q)) return 400;
  }
  // subsequence
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) qi += 1;
  }
  if (qi === q.length) return 100 + (q.length / Math.max(n.length, 1)) * 50;
  return 0;
}

/**
 * @typedef {object} CatalogItem
 * @property {string} name
 * @property {string} [description]
 * @property {string} [inputHint]
 * @property {"skill"|"command"} kind
 * @property {string} [source]
 */

/**
 * Normalize a catalog command/skill name (no leading slash, lowercased).
 * @param {string} name
 * @returns {string}
 */
export function catalogNameKey(name) {
  return String(name || "")
    .trim()
    .replace(/^\//, "")
    .toLowerCase();
}

/**
 * Filter + rank: skills first (by score), then agent commands (by score).
 *
 * @param {CatalogItem[]} skills
 * @param {CatalogItem[]} commands
 * @param {string} query
 * @returns {CatalogItem[]}
 */
export function rankCatalog(skills, commands, query) {
  const rank = (list) =>
    (list || [])
      .map((item) => ({
        item,
        score: fuzzyScore(query, item.name, item.description, item.aliases),
      }))
      .filter((x) => x.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.item.name.localeCompare(b.item.name),
      )
      .map((x) => x.item);

  return [...rank(skills), ...rank(commands)];
}

/**
 * Valid slash command: exact catalog name match, or exactly one fuzzy hit
 * (prefix/name match — description-only hits do not count for uniqueness).
 *
 * @param {string} query  without leading slash
 * @param {CatalogItem[]} skills
 * @param {CatalogItem[]} commands
 * @returns {boolean}
 */
export function isValidSlashCommand(query, skills, commands) {
  const q = catalogNameKey(query);
  if (!q) return false;
  const items = [...(skills || []), ...(commands || [])];
  if (items.some((it) => catalogNameKey(it.name) === q)) return true;
  if (items.some((it) => (it.aliases || []).some((al) => catalogNameKey(al) === q))) return true;

  // Name-only fuzzy (ignore description-only matches for "valid command")
  const nameHits = items.filter((it) => {
    const names = [catalogNameKey(it.name), ...(it.aliases || []).map(catalogNameKey)].filter(Boolean);
    return names.some((n) => {
      if (n === q || n.startsWith(q) || n.includes(q)) return true;
      let qi = 0;
      for (let i = 0; i < n.length && qi < q.length; i++) {
        if (n[i] === q[qi]) qi += 1;
      }
      return qi === q.length;
    });
  });
  return nameHits.length === 1;
}

/**
 * Ranges of valid `/cmd` tokens in free text (line start or after whitespace).
 *
 * @param {string} text
 * @param {CatalogItem[]} skills
 * @param {CatalogItem[]} commands
 * @returns {{ start: number, end: number }[]}
 */
export function findSlashHighlightRanges(text, skills, commands) {
  const s = String(text ?? "");
  const ranges = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "/" && (i === 0 || /\s/.test(s[i - 1]))) {
      let end = i + 1;
      while (end < s.length && !/[\s]/.test(s[end])) end += 1;
      const body = s.slice(i + 1, end);
      if (body && isValidSlashCommand(body, skills, commands)) {
        ranges.push({ start: i, end });
      }
      i = Math.max(end, i + 1);
    } else {
      i += 1;
    }
  }
  return ranges;
}

/**
 * Split text into plain / highlighted segments for rendering.
 *
 * @param {string} text
 * @param {CatalogItem[]} skills
 * @param {CatalogItem[]} commands
 * @returns {{ text: string, highlight: boolean }[]}
 */
export function highlightSlashSegments(text, skills, commands) {
  const s = String(text ?? "");
  const ranges = findSlashHighlightRanges(s, skills, commands);
  if (!ranges.length) return [{ text: s, highlight: false }];
  const segs = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) {
      segs.push({ text: s.slice(pos, r.start), highlight: false });
    }
    segs.push({ text: s.slice(r.start, r.end), highlight: true });
    pos = r.end;
  }
  if (pos < s.length) segs.push({ text: s.slice(pos), highlight: false });
  return segs;
}

/** TUI /quit and /exit are useless in the web UI (tab close). Do not advertise. */
export function isHiddenAgentCommand(name) {
  const k = catalogNameKey(name);
  return k === "quit" || k === "exit";
}

export function withoutHiddenAgentCommands(list) {
  return (list || []).filter((c) => c && !isHiddenAgentCommand(c.name));
}

/** Local menu item that replaces advertised /quit. Label is German everyday speech. */
export const UI_RELOAD_COMMAND = {
  name: "UI neu laden",
  description: "Web-UI neu laden, Anmeldung bleibt",
  kind: "ui",
  action: "reload",
  aliases: ["quit", "exit", "reload", "laden"],
};

export function isUiReloadItem(item) {
  if (!item || typeof item !== "object") return false;
  if (item.action === "reload" || item.kind === "ui") return true;
  return catalogNameKey(item.name) === catalogNameKey(UI_RELOAD_COMMAND.name);
}

export function isUiReloadSlash(text) {
  const t = String(text || "").trim();
  if (!t.startsWith("/")) return false;
  const head = t.slice(1).trim().split(/\s+/, 1)[0] || "";
  const k = catalogNameKey(head);
  if (!k) return false;
  if (k === catalogNameKey(UI_RELOAD_COMMAND.name)) return true;
  return (UI_RELOAD_COMMAND.aliases || []).some((a) => catalogNameKey(a) === k);
}

export function slashItemLabel(item) {
  const name = String(item && item.name ? item.name : "").replace(/^\//, "");
  if (!name) return "";
  if (item && (item.kind === "ui" || item.action === "reload" || item.local)) return name;
  return "/" + name;
}

export function withUiReloadCommand(commands) {
  const filtered = withoutHiddenAgentCommands(commands);
  if (filtered.some(isUiReloadItem)) return filtered;
  return filtered.concat([{ ...UI_RELOAD_COMMAND }]);
}
