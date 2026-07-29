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

/**
 * Format tool row text: "Read file · completed"
 *
 * @param {{ title?: string, status?: string }} msg
 */
export function formatToolText(msg) {
  const title = msg?.title || "tool";
  const status = msg?.status;
  return status ? `${title} · ${status}` : title;
}

/**
 * Upsert a tool status message into the transcript.
 * Server emits tool_call and tool_call_update as separate `tool` events
 * with the same toolCallId — we keep one row and update its status.
 *
 * @param {Array<{ id: string, role: string, text: string, streaming?: boolean, toolCallId?: string }>} prev
 * @param {{ toolCallId?: string, title?: string, status?: string }} msg
 * @param {() => number} [now]
 * @returns {typeof prev}
 */
export function upsertToolMessage(prev, msg, now = Date.now) {
  const toolCallId = msg?.toolCallId || "";
  const id = toolMessageId(toolCallId || null, now);
  const text = formatToolText(msg);
  const entry = {
    id,
    role: "tool",
    text,
    streaming: false,
    ...(toolCallId ? { toolCallId } : {}),
  };

  if (!toolCallId) {
    return [...prev, entry];
  }

  const idx = prev.findIndex(
    (m) => m.id === id || m.toolCallId === toolCallId,
  );
  if (idx < 0) {
    return [...prev, entry];
  }

  const next = prev.slice();
  next[idx] = { ...prev[idx], ...entry };
  return next;
}
