/**
 * Unit tests: composer follow-up queue persistence.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  QUEUE_STORAGE_KEY,
  QUEUE_MAX,
  loadPersistedQueue,
  persistQueue,
} from "../../client/src/utils/queue.js";

/** Minimal localStorage for Node. */
function installMemoryStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
  return map;
}

describe("queue persistence", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("returns [] when nothing stored", () => {
    assert.deepEqual(loadPersistedQueue(), []);
  });

  it("round-trips chat items", () => {
    persistQueue([
      {
        id: "q1",
        text: "hello",
        action: "chat",
        displayText: "hello",
      },
    ]);
    const loaded = loadPersistedQueue();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, "q1");
    assert.equal(loaded[0].text, "hello");
    assert.equal(loaded[0].action, "chat");
  });

  it("normalizes action and falls back displayText", () => {
    localStorage.setItem(
      QUEUE_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        items: [
          { id: "a", text: "x", action: "deep-search" },
          { id: "b", text: "y", action: "weird" },
        ],
      }),
    );
    const loaded = loadPersistedQueue();
    assert.equal(loaded[0].action, "deep-search");
    assert.equal(loaded[0].displayText, "x");
    assert.equal(loaded[1].action, "chat");
  });

  it("drops empty / invalid entries", () => {
    localStorage.setItem(
      QUEUE_STORAGE_KEY,
      JSON.stringify({
        items: [
          { id: "ok", text: "hi" },
          { id: "blank", text: "   " },
          { text: "no-id" },
          null,
        ],
      }),
    );
    const loaded = loadPersistedQueue();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, "ok");
  });

  it("clears storage when queue emptied", () => {
    persistQueue([{ id: "q", text: "a", action: "chat", displayText: "a" }]);
    assert.ok(localStorage.getItem(QUEUE_STORAGE_KEY));
    persistQueue([]);
    assert.equal(localStorage.getItem(QUEUE_STORAGE_KEY), null);
  });

  it("caps at QUEUE_MAX", () => {
    const many = Array.from({ length: QUEUE_MAX + 10 }, (_, i) => ({
      id: `q${i}`,
      text: `t${i}`,
      action: "chat",
      displayText: `t${i}`,
    }));
    persistQueue(many);
    const loaded = loadPersistedQueue();
    assert.equal(loaded.length, QUEUE_MAX);
  });
});
