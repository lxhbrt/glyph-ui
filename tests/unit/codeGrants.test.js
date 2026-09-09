/**
 * Grant optionId encode/parse + idle label.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GRANT_DEMO_REQ,
  TASK_DEMO,
  encodeGrantOptionId,
  formatActionClasses,
  formatIdleRemaining,
  parseGrantOptionId,
} from "../../client/src/utils/codeGrants.js";

describe("parseGrantOptionId", () => {
  it("maps once / auftrag / task", () => {
    assert.equal(parseGrantOptionId("allow-once").scope, "once");
    assert.equal(parseGrantOptionId("allow-auftrag").scope, "auftrag");
    assert.equal(parseGrantOptionId("allow-task").scope, "task");
  });

  it("maps legacy session-always to auftrag, not session", () => {
    const g = parseGrantOptionId("allow-always");
    assert.equal(g.allowed, true);
    assert.equal(g.scope, "auftrag");
  });

  it("round-trips task spec in optionId", () => {
    const id = encodeGrantOptionId("task", {
      label: "Dark Mode",
      path_prefixes: ["client/src"],
      action_classes: ["file_change", "test"],
    });
    const g = parseGrantOptionId(id);
    assert.equal(g.scope, "task");
    assert.equal(g.spec.label, "Dark Mode");
    assert.deepEqual(g.spec.path_prefixes, ["client/src"]);
  });

  it("unknown scope falls back to once, never always", () => {
    assert.equal(encodeGrantOptionId("always"), "allow-once");
    assert.equal(encodeGrantOptionId(""), "allow-once");
  });
});

describe("demo fixtures", () => {
  it("exposes grant and task previews", () => {
    assert.equal(GRANT_DEMO_REQ.id, "grant-demo");
    assert.equal(GRANT_DEMO_REQ.grant.requires_grant, true);
    assert.equal(TASK_DEMO.label, "Dark Mode");
    assert.equal(TASK_DEMO.idle_remaining_s, 90 * 60);
  });
});

describe("formatActionClasses", () => {
  it("uses German labels, keeps unknown ids", () => {
    assert.equal(
      formatActionClasses(["file_change", "test"]),
      "Dateiänderungen, Tests",
    );
    assert.equal(formatActionClasses(["git_commit"]), "git_commit");
    assert.equal(formatActionClasses([]), "");
  });
});

describe("formatIdleRemaining", () => {
  it("formats hours and minutes", () => {
    assert.equal(formatIdleRemaining(90 * 60), "1h 30m");
    assert.equal(formatIdleRemaining(12 * 60), "12 min");
    assert.equal(formatIdleRemaining(0), "abgelaufen");
  });
});
