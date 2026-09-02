/**
 * Unit tests: composer prompt history.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadPromptHistory,
  persistPromptHistory,
  pushPromptHistory,
  stepPromptHistory,
  isLocalSlashCommand,
} from "../../client/src/utils/promptHistory.js";

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
}

describe("prompt history", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("detects local slash commands", () => {
    assert.equal(isLocalSlashCommand("/rewind"), true);
    assert.equal(isLocalSlashCommand("/undo"), true);
    assert.equal(isLocalSlashCommand("/rename Titel"), true);
    assert.equal(isLocalSlashCommand("/quit"), true);
    assert.equal(isLocalSlashCommand("/exit"), true);
    assert.equal(isLocalSlashCommand("/compact keep auth"), false);
    assert.equal(isLocalSlashCommand("hello"), false);
  });

  it("pushes newest first and dedupes", () => {
    pushPromptHistory("grok", "alpha");
    pushPromptHistory("grok", "beta");
    pushPromptHistory("grok", "alpha");
    assert.deepEqual(loadPromptHistory("grok"), ["alpha", "beta"]);
  });

  it("skips local slash and empty", () => {
    pushPromptHistory("grok", "/rewind");
    pushPromptHistory("grok", "   ");
    assert.deepEqual(loadPromptHistory("grok"), []);
  });

  it("isolates profiles", () => {
    pushPromptHistory("grok", "g");
    pushPromptHistory("glyph-agent", "a");
    assert.deepEqual(loadPromptHistory("grok"), ["g"]);
    assert.deepEqual(loadPromptHistory("glyph-agent"), ["a"]);
  });

  it("steps up then down to close", () => {
    persistPromptHistory("grok", ["new", "old"]);
    const list = loadPromptHistory("grok");
    const up = stepPromptHistory(list, null, "up");
    assert.equal(up.text, "new");
    assert.equal(up.index, 0);
    const older = stepPromptHistory(list, up.index, "up");
    assert.equal(older.text, "old");
    const down = stepPromptHistory(list, older.index, "down");
    assert.equal(down.text, "new");
    const close = stepPromptHistory(list, down.index, "down");
    assert.equal(close.closed, true);
    assert.equal(close.index, null);
  });
});
