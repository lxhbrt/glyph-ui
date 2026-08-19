/**
 * Model/Host-Patch für Graph-Anbindung (°_Agent / ^_Code).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildModelsPatch,
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
