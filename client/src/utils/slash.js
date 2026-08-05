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
export function fuzzyScore(query, name, description = "") {
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
        score: fuzzyScore(query, item.name, item.description),
      }))
      .filter((x) => x.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.item.name.localeCompare(b.item.name),
      )
      .map((x) => x.item);

  return [...rank(skills), ...rank(commands)];
}
