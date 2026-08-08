/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applyBindingsToEnv,
  bindingsPath,
  buildBindingsStatus,
  maskSecret,
  normalizeBindingsFile,
  readBindingsFile,
  resolveKeySource,
  updateBindings,
  writeBindingsFile,
} from "../../server/bindings.js";

test("maskSecret", () => {
  assert.equal(maskSecret(""), null);
  assert.equal(maskSecret("ab"), "…");
  assert.equal(maskSecret("sk-or-abcdefgh"), "…efgh");
});

test("normalizeBindingsFile accepts nested and flat shapes", () => {
  const nested = normalizeBindingsFile({
    keys: { OPENROUTER_API_KEY: " sk-a " },
    settings: { GLYPH_AGENT_URL: "http://127.0.0.1:9" },
  });
  assert.equal(nested.keys.OPENROUTER_API_KEY, "sk-a");
  assert.equal(nested.settings.GLYPH_AGENT_URL, "http://127.0.0.1:9");

  const flat = normalizeBindingsFile({
    XAI_API_KEY: "xai-1",
    GLYPH_AGENT_URL: "http://x",
  });
  assert.equal(flat.keys.XAI_API_KEY, "xai-1");
  assert.equal(flat.settings.GLYPH_AGENT_URL, "http://x");
});

test("bindingsPath default under state dir", () => {
  assert.ok(bindingsPath("/tmp/glyph-test").endsWith("bindings.json"));
  assert.equal(
    bindingsPath("/tmp/glyph-test"),
    path.join("/tmp/glyph-test", "bindings.json"),
  );
});

test("write/read/updateBindings roundtrip", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glyph-bind-"));
  const file = path.join(dir, "bindings.json");
  const env = {};

  await writeBindingsFile(
    { keys: { OPENROUTER_API_KEY: "sk-secret-9999" }, settings: {} },
    file,
  );
  const read = await readBindingsFile(file);
  assert.equal(read.keys.OPENROUTER_API_KEY, "sk-secret-9999");

  applyBindingsToEnv(read, { overwrite: false, env });
  assert.equal(env.OPENROUTER_API_KEY, "sk-secret-9999");

  // env already set → load does not overwrite
  env.OPENROUTER_API_KEY = "from-env";
  applyBindingsToEnv(read, { overwrite: false, env });
  assert.equal(env.OPENROUTER_API_KEY, "from-env");

  await updateBindings(
    { OPENROUTER_API_KEY: "sk-new-1111", XAI_API_KEY: "xai-abc" },
    { stateDir: dir, bindingsFile: file, env },
  );
  assert.equal(env.OPENROUTER_API_KEY, "sk-new-1111");
  assert.equal(env.XAI_API_KEY, "xai-abc");

  await updateBindings(
    { OPENROUTER_API_KEY: "" },
    { stateDir: dir, bindingsFile: file, env },
  );
  assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(env.XAI_API_KEY, "xai-abc");

  const after = await readBindingsFile(file);
  assert.equal(after.keys.OPENROUTER_API_KEY, undefined);
  assert.equal(after.keys.XAI_API_KEY, "xai-abc");
});

test("resolveKeySource prefers env when values differ", () => {
  const a = resolveKeySource(
    "OPENROUTER_API_KEY",
    { OPENROUTER_API_KEY: "from-file-val" },
    { OPENROUTER_API_KEY: "from-env-zzzz" },
  );
  assert.equal(a.source, "env");
  assert.equal(a.masked, "…zzzz");

  const b = resolveKeySource(
    "OPENROUTER_API_KEY",
    { OPENROUTER_API_KEY: "same-value-here" },
    { OPENROUTER_API_KEY: "same-value-here" },
  );
  assert.equal(b.source, "bindings");
});

test("buildBindingsStatus never leaks raw secrets", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glyph-bind-"));
  const file = path.join(dir, "bindings.json");
  await writeBindingsFile(
    {
      keys: { OPENROUTER_API_KEY: "sk-super-secret-value", XAI_API_KEY: "xai-zzzz" },
      settings: { GLYPH_AGENT_URL: "http://127.0.0.1:18899" },
    },
    file,
  );
  const env = {
    OPENROUTER_API_KEY: "sk-super-secret-value",
    XAI_API_KEY: "xai-zzzz",
    PATH: process.env.PATH,
    HOME: process.env.HOME,
  };
  const status = await buildBindingsStatus({
    stateDir: dir,
    bindingsFile: file,
    env,
    home: dir,
    agentHealth: { ok: true, url: "http://127.0.0.1:18899/health", detail: "ok" },
  });
  const json = JSON.stringify(status);
  assert.ok(!json.includes("sk-super-secret-value"));
  assert.ok(!json.includes("xai-zzzz"));
  assert.equal(status.keys.OPENROUTER_API_KEY.set, true);
  assert.ok(status.keys.OPENROUTER_API_KEY.masked.startsWith("…"));
  assert.equal(status.profiles._code.checks.find((c) => c.id === "openrouter").ok, true);
  assert.equal(status.profiles["glyph-agent"].checks.find((c) => c.id === "agent_service").ok, true);
});
