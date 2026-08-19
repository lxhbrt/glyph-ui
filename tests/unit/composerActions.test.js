/**
 * Unit tests: Chat / Deep Search / Fork composer actions.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canSwarm,
  cloneSessionStore,
  composerActionLabel,
  deepResearchPrompt,
  parseForkResponse,
  resolveComposerAction,
} from "../../shared/composerActions.mjs";

describe("resolveComposerAction", () => {
  it("keeps plain chat", () => {
    assert.deepEqual(resolveComposerAction("chat", "hello"), {
      action: "chat",
      text: "hello",
    });
  });

  it("routes /fork typed in chat to fork + directive", () => {
    assert.deepEqual(resolveComposerAction("chat", "/fork look at auth"), {
      action: "fork",
      text: "look at auth",
    });
  });

  it("bare /fork is a fork with empty directive", () => {
    assert.deepEqual(resolveComposerAction("chat", "/fork"), {
      action: "fork",
      text: "",
    });
  });

  it("routes /deep-research typed in chat", () => {
    assert.deepEqual(
      resolveComposerAction("chat", "/deep-research Postgres 17 vs MySQL 9"),
      { action: "deep-search", text: "Postgres 17 vs MySQL 9" },
    );
  });

  it("fork mode strips a typed /fork prefix", () => {
    assert.deepEqual(resolveComposerAction("fork", "/fork --no-worktree x"), {
      action: "fork",
      text: "--no-worktree x",
    });
  });

  it("deep-search mode strips a typed /deep-research prefix", () => {
    assert.deepEqual(
      resolveComposerAction("deep-search", "/deep-research alpha"),
      { action: "deep-search", text: "alpha" },
    );
  });

  it("routes /swarm typed in chat", () => {
    assert.deepEqual(resolveComposerAction("chat", "/swarm PSA-Normen"), {
      action: "swarm",
      text: "PSA-Normen",
    });
  });

  it("swarm mode strips a typed /swarm prefix", () => {
    assert.deepEqual(resolveComposerAction("swarm", "/swarm alpha"), {
      action: "swarm",
      text: "alpha",
    });
  });
});

describe("canSwarm / labels", () => {
  it("is for °_Agent and ^_Code, not Grok", () => {
    assert.equal(canSwarm("grok"), false);
    assert.equal(canSwarm("glyph-agent"), true);
    assert.equal(canSwarm("_code"), true);
    assert.equal(canSwarm("agent"), true);
  });

  it("labels the four composer actions", () => {
    assert.equal(composerActionLabel("swarm"), "Swarm");
    assert.equal(composerActionLabel("deep-search"), "Deep Search");
    assert.equal(composerActionLabel("chat"), "Chat");
  });
});

describe("deepResearchPrompt", () => {
  it("prefixes once", () => {
    assert.equal(deepResearchPrompt("alpha"), "/deep-research alpha");
    assert.equal(
      deepResearchPrompt("/deep-research alpha"),
      "/deep-research alpha",
    );
  });

  it("empty stays empty", () => {
    assert.equal(deepResearchPrompt("  "), "");
  });
});

describe("parseForkResponse", () => {
  it("reads ACP sessionId", () => {
    assert.equal(parseForkResponse({ sessionId: "abc" }), "abc");
  });

  it("reads Grok newSessionId", () => {
    assert.equal(parseForkResponse({ newSessionId: "xyz" }), "xyz");
  });

  it("rejects empty", () => {
    assert.equal(parseForkResponse({}), null);
    assert.equal(parseForkResponse(null), null);
  });
});

describe("cloneSessionStore", () => {
  it("copies messages without aliasing", () => {
    const src = {
      messages: [{ role: "user", content: "hi" }],
      allowWriteTools: true,
    };
    const copy = cloneSessionStore(src);
    copy.messages.push({ role: "assistant", content: "yo" });
    copy.messages[0].content = "changed";
    assert.equal(src.messages.length, 1);
    assert.equal(src.messages[0].content, "hi");
    assert.equal(copy.allowWriteTools, true);
  });
});
