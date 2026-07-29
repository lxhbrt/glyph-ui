/**
 * Unit tests: ACP plan normalize + progress.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePlanEntries,
  planBroadcastPayload,
  planUpdateFromSession,
} from "../../server/plan.js";
import {
  normalizeClientPlanEntries,
  planProgress,
  planStatusGlyph,
} from "../../client/src/utils/plan.js";

describe("normalizePlanEntries", () => {
  it("keeps valid entries and defaults", () => {
    const out = normalizePlanEntries([
      { content: "A", status: "completed", priority: "high" },
      { content: "B", status: "weird" },
      { content: "  " },
      null,
    ]);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], {
      content: "A",
      status: "completed",
      priority: "high",
    });
    assert.equal(out[1].status, "pending");
    assert.equal(out[1].priority, "medium");
  });
});

describe("planUpdateFromSession", () => {
  it("handles classic plan replace", () => {
    const r = planUpdateFromSession({
      sessionUpdate: "plan",
      entries: [{ content: "Do x", status: "in_progress", priority: "high" }],
    });
    assert.equal(r.remove, false);
    assert.equal(r.entries.length, 1);
    assert.equal(r.entries[0].status, "in_progress");
  });

  it("handles plan_update items", () => {
    const r = planUpdateFromSession({
      sessionUpdate: "plan_update",
      plan: {
        type: "items",
        planId: "p1",
        entries: [{ content: "Y", status: "pending", priority: "low" }],
      },
    });
    assert.equal(r.planId, "p1");
    assert.equal(r.entries[0].content, "Y");
  });

  it("handles plan_removed", () => {
    const r = planUpdateFromSession({
      sessionUpdate: "plan_removed",
      planId: "p1",
    });
    assert.equal(r.remove, true);
    assert.equal(r.entries.length, 0);
  });

  it("returns null for unrelated updates", () => {
    assert.equal(
      planUpdateFromSession({ sessionUpdate: "agent_message_chunk" }),
      null,
    );
  });
});

describe("planBroadcastPayload", () => {
  it("shapes WS message", () => {
    const p = planBroadcastPayload(
      [{ content: "x", status: "pending", priority: "medium" }],
      "id",
    );
    assert.equal(p.type, "plan");
    assert.equal(p.planId, "id");
    assert.equal(p.entries.length, 1);
  });
});

describe("planProgress", () => {
  it("counts and picks current", () => {
    const p = planProgress([
      { content: "done", status: "completed" },
      { content: "now", status: "in_progress" },
      { content: "later", status: "pending" },
    ]);
    assert.equal(p.done, 1);
    assert.equal(p.total, 3);
    assert.equal(p.current, "now");
    assert.equal(p.allDone, false);
  });

  it("allDone when every entry completed", () => {
    const p = planProgress([
      { content: "a", status: "completed" },
      { content: "b", status: "completed" },
    ]);
    assert.equal(p.allDone, true);
  });
});

describe("planStatusGlyph / client normalize", () => {
  it("glyphs", () => {
    assert.equal(planStatusGlyph("completed"), "✓");
    assert.equal(planStatusGlyph("in_progress"), "●");
    assert.equal(planStatusGlyph("pending"), "○");
  });

  it("client normalize filters empties", () => {
    assert.equal(
      normalizeClientPlanEntries([{ content: "ok" }, { content: "" }]).length,
      1,
    );
  });
});
