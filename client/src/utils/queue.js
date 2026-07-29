/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

const QUEUE_STORAGE_KEY = "gbt-queue";
const QUEUE_MAX = 40;

/** Load parked follow-ups so refresh does not wipe the Warteschlange. */
function loadPersistedQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) return [];
    return items
      .filter(
        (q) =>
          q &&
          typeof q.id === "string" &&
          typeof q.text === "string" &&
          q.text.trim(),
      )
      .map((q) => ({
        id: q.id,
        text: q.text,
        action:
          q.action === "deep-search" || q.action === "fork" ? q.action : "chat",
        displayText:
          typeof q.displayText === "string" && q.displayText
            ? q.displayText
            : q.text,
      }))
      .slice(0, QUEUE_MAX);
  } catch {
    return [];
  }
}

function persistQueue(items) {
  try {
    if (!items?.length) {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      QUEUE_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        items: items.slice(0, QUEUE_MAX),
      }),
    );
  } catch {
    /* private mode / quota */
  }
}

export { QUEUE_STORAGE_KEY, QUEUE_MAX, loadPersistedQueue, persistQueue };
