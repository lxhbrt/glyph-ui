/**
 * Rewind: Verlauf vor einem Nutzer-Turn abschneiden.
 * Dateien auf Disk bleiben (wie TUI /rewind).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

function messageText(m) {
  if (!m || typeof m !== "object") return "";
  if (typeof m.text === "string" && m.text.trim()) return m.text.trim();
  const content = m.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function previewText(text, max = 88) {
  const one = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

/**
 * Rewind-Punkte: ein Eintrag pro Nutzer-Nachricht.
 * Index = dropUserIndex (dieser Turn und alles danach fallen weg).
 * @param {Array<{ role?: string, text?: string, content?: string, id?: string }>} messages
 */
export function rewindPointsFromMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  let index = 0;
  for (const m of messages) {
    if (!m || m.role !== "user") continue;
    const text = messageText(m);
    if (!text) continue;
    out.push({
      index,
      id: m.id != null ? String(m.id) : `user-${index}`,
      text,
      preview: previewText(text),
    });
    index += 1;
  }
  return out;
}

/**
 * Behalte Nachrichten vor dem Nutzer-Turn `dropUserIndex` (0 = leer bis auf
 * System/Tools davor — der gewählte User und alles danach fallen weg).
 */
export function sliceMessagesBeforeUser(messages, dropUserIndex) {
  if (!Array.isArray(messages)) return [];
  const drop = Number(dropUserIndex);
  if (!Number.isInteger(drop) || drop < 0) return [...messages];
  const out = [];
  let seen = 0;
  for (const m of messages) {
    if (m && m.role === "user" && messageText(m)) {
      if (seen >= drop) break;
      seen += 1;
    }
    out.push(m);
  }
  return out;
}

function historyRowText(row) {
  return messageText(row);
}

export function isCountableUserHistoryRow(row) {
  if (!row || typeof row !== "object") return false;
  const type = row.type || row.role;
  if (type !== "user") return false;
  if (row.synthetic_reason) return false;
  const text = historyRowText(row);
  if (!text) return false;
  if (text.startsWith("<system-reminder>") || text.startsWith("<user_info>")) {
    return false;
  }
  return true;
}

/**
 * JSONL (chat_history) bis vor den N-ten echten User-Turn kappen.
 * @param {string} raw
 * @param {number} dropUserIndex
 */
export function sliceHistoryJsonl(raw, dropUserIndex) {
  const drop = Number(dropUserIndex);
  if (!Number.isInteger(drop) || drop < 0) return String(raw || "");
  const lines = String(raw || "").split("\n");
  const kept = [];
  let seen = 0;
  for (const line of lines) {
    if (!line.trim()) {
      kept.push(line);
      continue;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      kept.push(line);
      continue;
    }
    if (isCountableUserHistoryRow(row)) {
      if (seen >= drop) break;
      seen += 1;
    }
    kept.push(line);
  }
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  return kept.length ? `${kept.join("\n")}\n` : "";
}

function isUserMessageChunk(obj) {
  const upd = obj?.params?.update || obj?.update || {};
  return upd.sessionUpdate === "user_message_chunk";
}

/**
 * updates.jsonl vor dem N-ten user_message_chunk kappen.
 */
export function sliceUpdatesJsonl(raw, dropUserIndex) {
  const drop = Number(dropUserIndex);
  if (!Number.isInteger(drop) || drop < 0) return String(raw || "");
  const lines = String(raw || "").split("\n");
  const kept = [];
  let seen = 0;
  for (const line of lines) {
    if (!line.trim()) {
      kept.push(line);
      continue;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      kept.push(line);
      continue;
    }
    if (isUserMessageChunk(row)) {
      if (seen >= drop) break;
      seen += 1;
    }
    kept.push(line);
  }
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  return kept.length ? `${kept.join("\n")}\n` : "";
}

/**
 * rewind_points.jsonl: Einträge mit prompt_index >= dropUserIndex weg.
 */
export function sliceRewindPointsJsonl(raw, dropUserIndex) {
  const drop = Number(dropUserIndex);
  if (!Number.isInteger(drop) || drop < 0) return String(raw || "");
  const kept = [];
  for (const line of String(raw || "").split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const idx = Number(row.prompt_index);
    if (Number.isInteger(idx) && idx >= drop) continue;
    kept.push(JSON.stringify(row));
  }
  return kept.length ? `${kept.join("\n")}\n` : "";
}

export { messageText, previewText };
