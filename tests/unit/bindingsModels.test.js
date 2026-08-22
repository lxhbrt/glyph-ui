/**
 * Model/Host-Patch für Graph-Anbindung (°_Agent / ^_Code).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyLiveStatus,
  buildModelsPatch,
  isCloudModelProfile,
  modelHudFromBindings,
  modelsForHead,
} from "../../client/src/utils/bindingsModels.js";

describe("modelsForHead", () => {
  const bindings = {
    models: {
      shared: { primary: "deepseek-v4-pro", fallback: "deepseek/deepseek-v4-flash-0731" },
      code: { primary: "google/gemini-3.7-flash", fallback: "" },
    },
  };

  it("agent uses shared pair", () => {
    const m = modelsForHead(bindings, "agent");
    assert.equal(m.primary, "deepseek-v4-pro");
    assert.equal(m.fallback, "deepseek/deepseek-v4-flash-0731");
    assert.equal(m.source, "shared");
  });

  it("code uses override when set", () => {
    const m = modelsForHead(bindings, "code");
    assert.equal(m.primary, "google/gemini-3.7-flash");
    assert.equal(m.source, "code");
  });

  it("code falls back to shared when no override", () => {
    const m = modelsForHead(
      { models: { shared: { primary: "deepseek-v4-flash", fallback: "" }, code: null } },
      "code",
    );
    assert.equal(m.primary, "deepseek-v4-flash");
    assert.equal(m.source, "shared");
  });
});

describe("buildModelsPatch", () => {
  it("agent writes shared only", () => {
    assert.deepEqual(
      buildModelsPatch({
        absorb: "agent",
        primary: " deepseek-v4-flash ",
        fallback: "deepseek/deepseek-v4-flash-0731",
      }),
      {
        models: {
          shared: {
            primary: "deepseek-v4-flash",
            fallback: "deepseek/deepseek-v4-flash-0731",
          },
        },
      },
    );
  });

  it("agent rejects empty primary", () => {
    assert.equal(buildModelsPatch({ absorb: "agent", primary: "  ", fallback: "" }), null);
  });

  it("code override is a slash OpenRouter slug", () => {
    assert.deepEqual(
      buildModelsPatch({
        absorb: "code",
        primary: "google/gemini-3.7-flash",
        fallback: "",
      }),
      {
        models: {
          code: { primary: "google/gemini-3.7-flash", fallback: "" },
        },
      },
    );
  });

  it("empty code primary clears override (teilt Agent)", () => {
    assert.deepEqual(buildModelsPatch({ absorb: "code", primary: "", fallback: "x" }), {
      models: { code: null },
    });
  });
});

describe("applyLiveStatus", () => {
  it("success is live am Agent", () => {
    assert.deepEqual(applyLiveStatus({ ok: true, applied: true }), {
      ok: true,
      text: "Gespeichert · live am Agent.",
    });
  });

  it("failed apply is an error, not silent save", () => {
    const s = applyLiveStatus({ ok: false, applied: false, error: "offline" });
    assert.equal(s.ok, false);
    assert.match(s.text, /offline/);
  });

  it("missing apply is an error", () => {
    const s = applyLiveStatus(null);
    assert.equal(s.ok, false);
  });
});

describe("isCloudModelProfile", () => {
  it("is true for °_Agent and ^_Code, not Grok", () => {
    assert.equal(isCloudModelProfile("glyph-agent"), true);
    assert.equal(isCloudModelProfile("_code"), true);
    assert.equal(isCloudModelProfile("grok"), false);
  });
});

describe("modelHudFromBindings", () => {
  const payload = {
    modelsMismatch: true,
    models: {
      shared: { primary: "deepseek-v4-flash-vision-exp", fallback: "deepseek/deepseek-v4-flash-0731" },
      code: { primary: "deepseek-v4-flash-vision-exp", fallback: "" },
    },
    modelsActive: {
      shared: { primary: "old-shared", fallback: "old-fb" },
      code: { primary: "old-code", fallback: "" },
      active: { primary: "live-shared", fallback: "live-fb", label: "live-shared" },
    },
  };

  it("uses live shared models for °_Agent", () => {
    const hud = modelHudFromBindings(payload, "glyph-agent");
    assert.equal(hud.kind, "openrouter");
    assert.equal(hud.primary, "live-shared");
    assert.equal(hud.fallback, "live-fb");
    assert.equal(hud.liveLabel, "live-shared");
    assert.equal(hud.mismatch, true);
    assert.match(hud.label, /live-shared/);
  });

  it("uses code override for ^_Code when present", () => {
    const hud = modelHudFromBindings(payload, "_code");
    assert.equal(hud.primary, "old-code");
    assert.equal(hud.fallback, "");
  });
});
