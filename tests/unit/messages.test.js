/**
 * Unit tests: tool message upsert (no duplicate React keys / row spam).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatToolText,
  toolMessageId,
  upsertToolMessage,
} from "../../client/src/utils/messages.js";

describe("toolMessageId", () => {
  it("uses toolCallId when present", () => {
    assert.equal(toolMessageId("abc-123"), "tool-abc-123");
  });

  it("falls back to timestamp when missing", () => {
    assert.equal(toolMessageId(null, () => 42), "tool-42");
    assert.equal(toolMessageId("", () => 99), "tool-99");
  });
});

describe("formatToolText", () => {
  it("joins title and status", () => {
    assert.equal(
      formatToolText({ title: "Read file", status: "completed" }),
      "Read file · completed",
    );
  });

  it("omits status when empty", () => {
    assert.equal(formatToolText({ title: "Read file" }), "Read file");
  });
});

describe("upsertToolMessage", () => {
  it("appends a new tool row", () => {
    const next = upsertToolMessage([], {
      toolCallId: "t1",
      title: "Read file",
      status: "pending",
    });
    assert.equal(next.length, 1);
    assert.equal(next[0].id, "tool-t1");
    assert.equal(next[0].role, "tool");
    assert.equal(next[0].text, "Read file · pending");
    assert.equal(next[0].toolCallId, "t1");
  });

  it("replaces status for the same toolCallId (no duplicate keys)", () => {
    let list = upsertToolMessage([], {
      toolCallId: "t1",
      title: "Read file",
      status: "pending",
    });
    list = upsertToolMessage(list, {
      toolCallId: "t1",
      title: "Read file",
      status: "in_progress",
    });
    list = upsertToolMessage(list, {
      toolCallId: "t1",
      title: "Read file",
      status: "completed",
    });

    assert.equal(list.length, 1);
    assert.equal(list[0].id, "tool-t1");
    assert.equal(list[0].text, "Read file · completed");
  });

  it("keeps separate rows for different toolCallIds", () => {
    let list = upsertToolMessage([], {
      toolCallId: "a",
      title: "Read file",
      status: "pending",
    });
    list = upsertToolMessage(list, {
      toolCallId: "b",
      title: "Search",
      status: "pending",
    });
    list = upsertToolMessage(list, {
      toolCallId: "a",
      title: "Read file",
      status: "completed",
    });

    assert.equal(list.length, 2);
    assert.equal(list[0].id, "tool-a");
    assert.equal(list[0].text, "Read file · completed");
    assert.equal(list[1].id, "tool-b");
    assert.equal(list[1].text, "Search · pending");
  });

  it("does not collapse tools without toolCallId", () => {
    const list = upsertToolMessage(
      [
        {
          id: "tool-1",
          role: "tool",
          text: "x · pending",
        },
      ],
      { title: "y", status: "pending" },
      () => 2,
    );
    assert.equal(list.length, 2);
    assert.equal(list[1].id, "tool-2");
  });

  it("does not mutate the previous array", () => {
    const prev = [];
    const next = upsertToolMessage(prev, {
      toolCallId: "t1",
      title: "Read file",
      status: "pending",
    });
    assert.notEqual(next, prev);
    assert.equal(prev.length, 0);
  });
});
