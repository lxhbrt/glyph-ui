/**
 * Unit tests: tool message upsert (no duplicate React keys / row spam).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TRANSCRIPT_WINDOW,
  formatToolText,
  priorUserMessage,
  toolMessageId,
  transcriptWindow,
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

  it("does not show call-… ids; keeps previous title", () => {
    assert.equal(
      formatToolText(
        {
          title: "call-af890ea9-3946-46b2-b43d-0a16a2f552d0-17",
          status: "completed",
        },
        "read_file · pending",
      ),
      "read_file · completed",
    );
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

  it("keeps rawInput / content / kind across status-only updates", () => {
    let list = upsertToolMessage([], {
      toolCallId: "t1",
      title: "read_file",
      kind: "read",
      status: "pending",
      rawInput: { target_file: "/tmp/a.js" },
    });
    list = upsertToolMessage(list, {
      toolCallId: "t1",
      status: "completed",
      content: [
        { type: "content", content: { type: "text", text: "ok" } },
      ],
    });
    assert.equal(list.length, 1);
    assert.equal(list[0].kind, "read");
    assert.equal(list[0].status, "completed");
    assert.deepEqual(list[0].rawInput, { target_file: "/tmp/a.js" });
    assert.equal(list[0].content[0].content.text, "ok");
  });
});

describe("transcriptWindow", () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

  it("mounts the whole list when it fits the window", () => {
    const list = ids(3);
    const slice = transcriptWindow(list, 0, 40);
    assert.equal(slice.hiddenCount, 0);
    assert.equal(slice.start, 0);
    assert.equal(slice.visible, list);
  });

  it("keeps only the last window by default", () => {
    const list = ids(100);
    const slice = transcriptWindow(list);
    assert.equal(slice.hiddenCount, 100 - TRANSCRIPT_WINDOW);
    assert.equal(slice.visible.length, TRANSCRIPT_WINDOW);
    assert.equal(slice.visible[0].id, String(100 - TRANSCRIPT_WINDOW));
    assert.equal(slice.visible.at(-1).id, "99");
  });

  it("reveals extra older rows without mounting the rest", () => {
    const list = ids(100);
    const slice = transcriptWindow(list, TRANSCRIPT_WINDOW);
    assert.equal(slice.visible.length, TRANSCRIPT_WINDOW * 2);
    assert.equal(slice.hiddenCount, 100 - TRANSCRIPT_WINDOW * 2);
    assert.equal(slice.visible[0].id, "20");
  });

  it("clamps when revealed covers the whole transcript", () => {
    const list = ids(50);
    const slice = transcriptWindow(list, 1000);
    assert.equal(slice.hiddenCount, 0);
    assert.equal(slice.visible.length, 50);
    assert.equal(slice.start, 0);
  });
});

describe("priorUserMessage", () => {
  const rows = [
    { id: "u1", role: "user", text: "Bitte den Apfel verschieben" },
    { id: "a1", role: "assistant", text: "Apfel sitzt über dem Kopf." },
    { id: "t1", role: "tool", text: "read" },
    { id: "a2", role: "assistant", text: "Fertig." },
    { id: "u2", role: "user", text: "   " },
    { id: "a3", role: "assistant", text: "Ohne Meldung." },
  ];

  it("finds the last user turn with text, skipping tools", () => {
    assert.equal(priorUserMessage(rows, 1)?.id, "u1");
    assert.equal(priorUserMessage(rows, 3)?.id, "u1");
  });

  it("skips blank user rows and still finds the last real message", () => {
    assert.equal(priorUserMessage(rows, 5)?.id, "u1");
  });

  it("returns null when no user text exists before the answer", () => {
    assert.equal(
      priorUserMessage(
        [
          { id: "u0", role: "user", text: "   " },
          { id: "a0", role: "assistant", text: "Ohne Meldung." },
        ],
        1,
      ),
      null,
    );
  });
});
