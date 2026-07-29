/**
 * Unit tests: available commands normalize.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  commandsBroadcastPayload,
  normalizeAvailableCommands,
} from "../../server/commands.js";

describe("normalizeAvailableCommands", () => {
  it("keeps name, description, input hint", () => {
    const out = normalizeAvailableCommands([
      {
        name: "compact",
        description: "Compress context",
        input: { hint: "[note]" },
      },
      { name: "  ", description: "empty" },
      null,
      { name: "fork", description: "Branch session" },
    ]);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], {
      name: "compact",
      description: "Compress context",
      inputHint: "[note]",
    });
    assert.equal(out[1].inputHint, "");
  });
});

describe("commandsBroadcastPayload", () => {
  it("shapes WS message", () => {
    const p = commandsBroadcastPayload([
      { name: "a", description: "b", inputHint: "" },
    ]);
    assert.equal(p.type, "available_commands");
    assert.equal(p.commands.length, 1);
  });
});
