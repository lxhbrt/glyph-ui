/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_AGENT_ID,
  buildAgentProfiles,
  findAgent,
  parseArgs,
  publicAgent,
  publicAgents,
  resolveAgent,
  resolveClaudeCommand,
} from "../../server/agents.js";

test("parseArgs", async (t) => {
  await t.test("empty input yields no args", () => {
    assert.deepEqual(parseArgs(undefined), []);
    assert.deepEqual(parseArgs("   "), []);
  });

  await t.test("splits on whitespace", () => {
    assert.deepEqual(parseArgs("--a --b c"), ["--a", "--b", "c"]);
  });

  await t.test("keeps quoted segments together", () => {
    assert.deepEqual(parseArgs('--dir "my folder" --x'), [
      "--dir",
      "my folder",
      "--x",
    ]);
    assert.deepEqual(parseArgs("--dir 'a b'"), ["--dir", "a b"]);
  });
});

test("resolveClaudeCommand (legacy helper)", async (t) => {
  await t.test("explicit binary wins", () => {
    const r = resolveClaudeCommand({
      GLYPH_CLAUDE_BIN: "/opt/acp",
      GLYPH_CLAUDE_ARGS: "--verbose",
      PATH: "",
    });
    assert.equal(r.bin, "/opt/acp");
    assert.deepEqual(r.args, ["--verbose"]);
    assert.equal(r.via, "env");
  });

  await t.test("falls back to npx when not on PATH", () => {
    const r = resolveClaudeCommand({ PATH: "/nonexistent-dir-xyz" });
    assert.equal(r.bin, "npx");
    assert.equal(r.via, "npx");
    assert.ok(r.args.includes("@agentclientprotocol/claude-agent-acp"));
    assert.equal(r.args[0], "-y");
  });
});

test("buildAgentProfiles", async (t) => {
  const profiles = buildAgentProfiles({ PATH: "/nonexistent-dir-xyz" });

  await t.test("offers three profiles: grok, _code, glyph-agent", () => {
    assert.deepEqual(
      profiles.map((p) => p.id),
      ["grok", "_code", "glyph-agent"],
    );
  });

  await t.test("grok keeps the TUI-equivalent argv", () => {
    const grok = findAgent(profiles, "grok");
    assert.deepEqual(grok.args, [
      "agent",
      "--always-approve",
      "--no-leader",
      "stdio",
    ]);
  });

  await t.test("honours GROK_BIN", () => {
    const custom = buildAgentProfiles({
      GROK_BIN: "/usr/local/bin/grok",
      PATH: "",
    });
    assert.equal(findAgent(custom, "grok").bin, "/usr/local/bin/grok");
  });

  await t.test("^_Code uses glyph-agent-acp with MODE=code", () => {
    const code = findAgent(profiles, "_code");
    assert.equal(code.label, "^_Code");
    assert.ok(code.args.some((a) => String(a).includes("glyph-agent-acp")));
    assert.equal(code.env?.GLYPH_AGENT_MODE, "code");
    assert.deepEqual(code.capabilities, {
      deepSearch: false,
      activity: false,
      sessionList: false,
      sessionHistory: true,
      summarize: true,
    });
  });

  await t.test("capabilities per profile", () => {
    assert.deepEqual(findAgent(profiles, "grok").capabilities, {
      deepSearch: true,
      activity: true,
      sessionList: true,
      sessionHistory: true,
      summarize: true,
    });
    assert.deepEqual(findAgent(profiles, "glyph-agent").capabilities, {
      deepSearch: false,
      activity: false,
      sessionList: false,
      sessionHistory: true,
      summarize: true,
    });
    assert.equal(findAgent(profiles, "glyph-agent").env?.GLYPH_AGENT_MODE, "agent");
  });
});

test("resolveAgent", async (t) => {
  const profiles = buildAgentProfiles({ PATH: "" });

  await t.test("returns the requested profile", () => {
    assert.equal(resolveAgent(profiles, "_code").id, "_code");
  });

  await t.test("maps claude/code aliases to _code", () => {
    assert.equal(resolveAgent(profiles, "claude").id, "_code");
    assert.equal(resolveAgent(profiles, "code").id, "_code");
    assert.equal(resolveAgent(profiles, "^_Code").id, "_code");
  });

  await t.test("unknown or missing id falls back to the default", () => {
    assert.equal(resolveAgent(profiles, "gpt").id, DEFAULT_AGENT_ID);
    assert.equal(resolveAgent(profiles, undefined).id, DEFAULT_AGENT_ID);
    assert.equal(resolveAgent(profiles, "").id, DEFAULT_AGENT_ID);
  });

  await t.test("findAgent stays strict so callers can reject bad input", () => {
    assert.equal(findAgent(profiles, "gpt"), null);
    assert.equal(findAgent(profiles, "claude"), null);
  });
});

test("publicAgent", async (t) => {
  const profiles = buildAgentProfiles({ PATH: "/nonexistent-dir-xyz" });

  await t.test("flattens command for the header tooltip", () => {
    const wire = publicAgent(findAgent(profiles, "_code"));
    assert.equal(wire.id, "_code");
    assert.equal(wire.label, "^_Code");
    assert.ok(wire.command.includes("glyph-agent-acp"));
    assert.equal(typeof wire.hint, "string");
    assert.ok(wire.hint.toLowerCase().includes("deepseek"));
  });

  await t.test("copies capabilities instead of sharing them", () => {
    const profile = findAgent(profiles, "grok");
    const wire = publicAgent(profile);
    wire.capabilities.deepSearch = false;
    assert.equal(profile.capabilities.deepSearch, true);
  });

  await t.test("null profile is tolerated", () => {
    assert.equal(publicAgent(null), null);
    assert.deepEqual(publicAgents(null), []);
  });
});
