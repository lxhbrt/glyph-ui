/**
 * Unit tests: resolveToolDisplayTitle
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clipToolValue,
  isOpaqueToolId,
  mergeToolFields,
  resolveToolDisplayTitle,
} from "../../server/toolTitle.mjs";

describe("isOpaqueToolId", () => {
  it("flags call-… and UUIDs", () => {
    assert.equal(
      isOpaqueToolId("call-af890ea9-3946-46b2-b43d-0a16a2f552d0-17"),
      true,
    );
    assert.equal(
      isOpaqueToolId("af890ea9-3946-46b2-b43d-0a16a2f552d0"),
      true,
    );
  });

  it("keeps human labels", () => {
    assert.equal(isOpaqueToolId("Read file"), false);
    assert.equal(isOpaqueToolId("read_file"), false);
    assert.equal(isOpaqueToolId("search"), false);
  });
});

describe("resolveToolDisplayTitle", () => {
  it("prefers title", () => {
    assert.equal(
      resolveToolDisplayTitle({ title: "Read file", name: "x" }),
      "Read file",
    );
  });

  it("uses name when title empty (Grok ACP path)", () => {
    assert.equal(
      resolveToolDisplayTitle({
        toolCallId: "call-abc",
        name: "read_file",
        status: "completed",
      }),
      "read_file",
    );
  });

  it("never shows call-id as title", () => {
    assert.equal(
      resolveToolDisplayTitle({
        title: "call-af890ea9-3946-46b2-b43d-0a16a2f552d0-17",
        kind: "read",
      }),
      "read",
    );
  });

  it("keeps previous good title on status-only update", () => {
    assert.equal(
      resolveToolDisplayTitle(
        { toolCallId: "call-1", status: "completed" },
        { title: "read_file", kind: "read" },
      ),
      "read_file",
    );
  });

  it("kind · basename from locations", () => {
    assert.equal(
      resolveToolDisplayTitle({
        kind: "read",
        locations: [{ path: "/Users/me/glyph-ui/server/index.js" }],
      }),
      "read · index.js",
    );
  });

  it("falls back to tool", () => {
    assert.equal(resolveToolDisplayTitle({ toolCallId: "call-1" }), "tool");
  });
});

describe("clipToolValue", () => {
  it("truncates long strings", () => {
    const long = "x".repeat(9000);
    const clipped = clipToolValue(long);
    assert.ok(typeof clipped === "string");
    assert.ok(clipped.length < long.length);
    assert.ok(clipped.endsWith("…"));
  });

  it("drops large binary-looking keys", () => {
    const clipped = clipToolValue({
      path: "a.png",
      data: "A".repeat(500),
    });
    assert.equal(clipped.path, "a.png");
    assert.equal(clipped.data, undefined);
  });
});

describe("mergeToolFields", () => {
  it("keeps previous rawInput when update omits it", () => {
    const merged = mergeToolFields(
      { status: "completed" },
      { rawInput: { command: "ls" }, kind: "execute" },
    );
    assert.deepEqual(merged.rawInput, { command: "ls" });
  });

  it("replaces rawInput when the update has one", () => {
    const merged = mergeToolFields(
      { rawInput: { command: "pwd" } },
      { rawInput: { command: "ls" } },
    );
    assert.deepEqual(merged.rawInput, { command: "pwd" });
  });
});
