/**
 * Unit tests: Rewind cut points (messages + JSONL).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rewindPointsFromMessages,
  sliceMessagesBeforeUser,
  sliceHistoryJsonl,
  sliceUpdatesJsonl,
  sliceRewindPointsJsonl,
  isCountableUserHistoryRow,
} from "../../shared/rewind.mjs";

describe("rewindPointsFromMessages", () => {
  it("indexes user turns and skips empty / non-user", () => {
    const pts = rewindPointsFromMessages([
      { role: "system", text: "hi" },
      { role: "user", id: "u1", text: "first" },
      { role: "assistant", text: "ok" },
      { role: "user", id: "u2", text: "second question here" },
      { role: "tool", text: "x" },
      { role: "user", text: "   " },
    ]);
    assert.equal(pts.length, 2);
    assert.equal(pts[0].index, 0);
    assert.equal(pts[0].id, "u1");
    assert.equal(pts[1].index, 1);
    assert.equal(pts[1].text, "second question here");
    assert.match(pts[1].preview, /second/);
  });
});

describe("sliceMessagesBeforeUser", () => {
  const msgs = [
    { role: "user", text: "A" },
    { role: "assistant", text: "a" },
    { role: "user", text: "B" },
    { role: "assistant", text: "b" },
    { role: "user", text: "C" },
  ];

  it("drop 0 clears user turns", () => {
    assert.deepEqual(sliceMessagesBeforeUser(msgs, 0), []);
  });

  it("drop 1 keeps first user+assistant", () => {
    const out = sliceMessagesBeforeUser(msgs, 1);
    assert.equal(out.length, 2);
    assert.equal(out[0].text, "A");
    assert.equal(out[1].text, "a");
  });

  it("invalid index leaves list", () => {
    assert.equal(sliceMessagesBeforeUser(msgs, -1).length, 5);
  });
});

describe("history / updates JSONL slice", () => {
  const history = [
    JSON.stringify({ type: "system", content: "sys" }),
    JSON.stringify({
      type: "user",
      content: [{ type: "text", text: "<user_info>\nOS" }],
    }),
    JSON.stringify({
      type: "user",
      content: [{ type: "text", text: "real one" }],
    }),
    JSON.stringify({ type: "assistant", content: "ans" }),
    JSON.stringify({
      type: "user",
      content: [{ type: "text", text: "real two" }],
    }),
  ].join("\n") + "\n";

  it("skips user_info when counting", () => {
    assert.equal(
      isCountableUserHistoryRow({
        type: "user",
        content: "<user_info>\nx",
      }),
      false,
    );
    assert.equal(
      isCountableUserHistoryRow({
        type: "user",
        content: [{ type: "text", text: "hello" }],
      }),
      true,
    );
  });

  it("drops from the chosen real user turn", () => {
    const sliced = sliceHistoryJsonl(history, 1);
    assert.match(sliced, /real one/);
    assert.doesNotMatch(sliced, /real two/);
    assert.match(sliced, /user_info/);
  });

  it("drop 0 keeps only preamble", () => {
    const sliced = sliceHistoryJsonl(history, 0);
    assert.match(sliced, /sys/);
    assert.doesNotMatch(sliced, /real one/);
  });

  it("cuts updates.jsonl at user_message_chunk", () => {
    const raw = [
      JSON.stringify({
        method: "session/update",
        params: { update: { sessionUpdate: "available_commands_update" } },
      }),
      JSON.stringify({
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: "A" },
          },
        },
      }),
      JSON.stringify({
        method: "session/update",
        params: { update: { sessionUpdate: "agent_message_chunk" } },
      }),
      JSON.stringify({
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: "B" },
          },
        },
      }),
    ].join("\n") + "\n";
    const sliced = sliceUpdatesJsonl(raw, 1);
    assert.match(sliced, /available_commands/);
    assert.match(sliced, /"A"/);
    assert.doesNotMatch(sliced, /"B"/);
    assert.match(sliced, /agent_message_chunk/);
  });

  it("keeps rewind points below drop index", () => {
    const raw = [
      JSON.stringify({ prompt_index: 0 }),
      JSON.stringify({ prompt_index: 1 }),
      JSON.stringify({ prompt_index: 2 }),
    ].join("\n");
    const sliced = sliceRewindPointsJsonl(raw, 1);
    assert.match(sliced, /"prompt_index":0/);
    assert.doesNotMatch(sliced, /"prompt_index":1/);
  });
});
