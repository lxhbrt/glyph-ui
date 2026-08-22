/**
 * Message list helpers for the chat transcript.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * Stable React key for a tool row. Same toolCallId → same key so updates
 * replace instead of spawning duplicate list items.
 *
 * @param {string | undefined | null} toolCallId
 * @param {() => number} [now] injectable clock (tests)
 */
export function toolMessageId(toolCallId, now = Date.now) {
  if (toolCallId) return `tool-${toolCallId}`;
  return `tool-${now()}`;
}

/** How many transcript rows stay mounted by default (from the end). */
export const TRANSCRIPT_WINDOW = 40;

/**
 * Slice the transcript for the DOM. Older rows stay in React state;
 * only the last window (+ extra revealed) is mounted.
 *
 * @param {unknown[]} messages
 * @param {number} [revealed]
 * @param {number} [windowSize]
 */
export function transcriptWindow(
  messages,
  revealed = 0,
  windowSize = TRANSCRIPT_WINDOW,
) {
  const list = Array.isArray(messages) ? messages : [];
  const n = list.length;
  const win = Math.max(1, Number(windowSize) || TRANSCRIPT_WINDOW);
  const extra = Math.max(0, Number(revealed) || 0);
  const mounted = Math.min(n, win + extra);
  const start = n - mounted;
  return {
    start,
    hiddenCount: start,
    visible: start > 0 ? list.slice(start) : list,
  };
}

/**
 * Opaque ACP ids that must never be shown as the tool label.
 * @param {unknown} s
 */
export function isOpaqueToolId(s) {
  if (s == null) return true;
  const t = String(s).trim();
  if (!t) return true;
  if (/^call[-_]/i.test(t)) return true;
  if (/^tool[-_]?[0-9a-f-]{8,}/i.test(t)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Format tool row text: "Read file · completed"
 *
 * @param {{ title?: string, status?: string, kind?: string }} msg
 * @param {string} [prevText] prior row text — keep a good title when status-only updates land
 */
export function formatToolText(msg, prevText = "") {
  let title = msg?.title || msg?.kind || "tool";
  if (isOpaqueToolId(title)) {
    const prevTitle = String(prevText || "").split(" · ")[0]?.trim();
    if (prevTitle && !isOpaqueToolId(prevTitle)) {
      title = prevTitle;
    } else if (msg?.kind && !isOpaqueToolId(msg.kind)) {
      title = String(msg.kind);
    } else {
      title = "tool";
    }
  }
  const status = msg?.status;
  return status ? `${title} · ${status}` : title;
}

/**
 * Upsert a tool status message into the transcript.
 * Server emits tool_call and tool_call_update as separate `tool` events
 * with the same toolCallId — we keep one row and update its status.
 *
 * @param {Array<{ id: string, role: string, text: string, streaming?: boolean, toolCallId?: string }>} prev
 * @param {{ toolCallId?: string, title?: string, status?: string, kind?: string }} msg
 * @param {() => number} [now]
 * @returns {typeof prev}
 */
/**
 * Merge incremental ACP fields; keep previous when the update omits them.
 * @param {object} msg
 * @param {object} [prev]
 */
function mergeToolMsgFields(msg, prev = {}) {
  const pick = (k) => (msg?.[k] !== undefined ? msg[k] : prev[k]);
  return {
    title: pick("title"),
    status: pick("status"),
    kind: pick("kind"),
    name: pick("name"),
    rawInput: pick("rawInput"),
    rawOutput: pick("rawOutput"),
    content: pick("content"),
    locations: pick("locations"),
  };
}

export function upsertToolMessage(prev, msg, now = Date.now) {
  const toolCallId = msg?.toolCallId || "";
  const id = toolMessageId(toolCallId || null, now);
  const fields = mergeToolMsgFields(msg, {});

  if (!toolCallId) {
    return [
      ...prev,
      {
        id,
        role: "tool",
        text: formatToolText(msg),
        streaming: false,
        ...fields,
      },
    ];
  }

  const idx = prev.findIndex(
    (m) => m.id === id || m.toolCallId === toolCallId,
  );
  const prevMsg = idx >= 0 ? prev[idx] : {};
  const merged = mergeToolMsgFields(msg, prevMsg);
  const entry = {
    ...prevMsg,
    id,
    role: "tool",
    text: formatToolText(
      { title: merged.title, status: merged.status, kind: merged.kind },
      prevMsg.text || "",
    ),
    streaming: false,
    toolCallId,
    ...merged,
  };

  if (idx < 0) {
    return [...prev, entry];
  }

  const next = prev.slice();
  next[idx] = entry;
  return next;
}
