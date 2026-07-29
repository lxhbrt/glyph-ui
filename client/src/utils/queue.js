/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

const QUEUE_STORAGE_KEY = "gbt-queue";
const QUEUE_MAX = 40;
/**
 * Max age for a persisted Warteschlange after page reload.
 * Within this window: crash-recovery (reload mid-work keeps parked items).
 * Beyond it: drop so an old queue cannot auto-send without the user present.
 */
const QUEUE_MAX_AGE_MS = 15 * 60 * 1000;

/** Load parked follow-ups so a brief refresh does not wipe the Warteschlange. */
function loadPersistedQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);

    // Legacy bare array (no savedAt) — expire; never auto-send zombies.
    if (Array.isArray(data)) {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
      return [];
    }

    const savedAt = data?.savedAt;
    if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
      return [];
    }
    if (Date.now() - savedAt > QUEUE_MAX_AGE_MS) {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
      return [];
    }

    const items = data?.items;
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

export {
  QUEUE_STORAGE_KEY,
  QUEUE_MAX,
  QUEUE_MAX_AGE_MS,
  loadPersistedQueue,
  persistQueue,
};
