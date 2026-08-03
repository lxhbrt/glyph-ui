/**
 * Unit tests: assistantTrace — kompakte Modell-/Provider-/Tool-Statuszeile.
 * Testet buildCompact/modelLabel als reine Funktionen (aus dem EFFEKTIVEN
 * Server-Trace; nie UI-Konfiguration; fehlende Metadaten → „unbekannt“).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCompact, modelLabel } from "../../client/src/utils/assistantTrace.js";

describe("modelLabel", () => {
  it("returns 'unbekannt' for missing/empty model", () => {
    assert.equal(modelLabel(null), "unbekannt");
    assert.equal(modelLabel(""), "unbekannt");
    assert.equal(modelLabel(undefined), "unbekannt");
  });

  it("shortens a provider/model string to the model name", () => {
    assert.equal(modelLabel("openai/gpt-5.6-luna"), "gpt-5.6-luna");
  });

  it("keeps a bare model name (no provider prefix)", () => {
    assert.equal(modelLabel("gpt-5.6-luna"), "gpt-5.6-luna");
  });
});

describe("buildCompact — OpenRouter + WebSearch erfolgreich", () => {
  it("shows activity, provider/model and success status", () => {
    const trace = {
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      fallback_used: false,
      tool_calls: [{ tool: "WebSearch", status: "success", result_length: 840 }],
    };
    const line = buildCompact(trace);
    assert.equal(line, "WebSearch · openrouter / gpt-5.6-luna · erfolgreich");
  });
});

describe("buildCompact — Ollama ohne Tool (direkte Antwort)", () => {
  it("shows provider/model without activity/status suffix", () => {
    const trace = {
      provider: "ollama",
      model: "qwen-solid",
      fallback_used: false,
      tool_calls: [],
    };
    assert.equal(buildCompact(trace), "ollama / qwen-solid");
  });

  it("does not invent a tool when no tool was used", () => {
    const trace = { provider: "ollama", model: "qwen3", tool_calls: [], fallback_used: false };
    assert.ok(!buildCompact(trace).includes("Tool"));
  });
});

describe("buildCompact — Tool-Fehler ohne Fallback", () => {
  it("marks 'fehlgeschlagen' when a tool errored", () => {
    const trace = {
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      fallback_used: false,
      tool_calls: [{ tool: "WebSearch", status: "error", result_length: 0, error: "timeout" }],
    };
    assert.equal(
      buildCompact(trace),
      "WebSearch · openrouter / gpt-5.6-luna · fehlgeschlagen",
    );
  });

  it("does not append 'Fallback aktiv' when no fallback happened", () => {
    const trace = { provider: "openrouter", model: "openai/gpt-5.6-luna", fallback_used: false,
      tool_calls: [{ tool: "WebSearch", status: "error", result_length: 0 }] };
    assert.ok(!buildCompact(trace).includes("Fallback"));
  });
});

describe("buildCompact — aktiven Fallback sichtbar markieren", () => {
  it("appends ' · Fallback aktiv' when fallback_used is true", () => {
    const trace = {
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      fallback_used: true,
      tool_calls: [{ tool: "WebSearch", status: "success", result_length: 512 }],
    };
    assert.equal(
      buildCompact(trace),
      "WebSearch · openrouter / gpt-5.6-luna · erfolgreich · Fallback aktiv",
    );
  });

  it("marks fallback even for a failed tool (status priority)", () => {
    const trace = { provider: "openrouter", model: "openai/gpt-5.6-luna", fallback_used: true,
      tool_calls: [{ tool: "WebSearch", status: "error", result_length: 0 }] };
    const line = buildCompact(trace);
    assert.ok(line.includes("fehlgeschlagen"));
    assert.ok(line.includes("Fallback aktiv"));
  });
});

describe("buildCompact — Vault-Recall", () => {
  it("shows Vault-Recall with source count", () => {
    const trace = {
      provider: "ollama",
      model: "qwen-solid",
      fallback_used: false,
      tool_calls: [{ tool: "VaultRecall", status: "success", result_length: 900 }],
      retrieval: { type: "vault", status: "ok", selected: 4, candidates: 9, sources: ["a"] },
    };
    assert.equal(buildCompact(trace), "Vault-Recall · ollama / qwen-solid · 4 Quellen verwendet");
  });
});

describe("buildCompact — kein verwertbares Ergebnis", () => {
  it("marks a WebSearch with zero result length as no usable result", () => {
    const trace = {
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      fallback_used: false,
      tool_calls: [{ tool: "WebSearch", status: "success", result_length: 0 }],
    };
    assert.equal(
      buildCompact(trace),
      "WebSearch · openrouter / gpt-5.6-luna · kein verwertbares Ergebnis",
    );
  });
});

describe("buildCompact — fehlender / unvollständiger Trace", () => {
  it("falls back to 'unbekannt' for missing provider/model", () => {
    const trace = { tool_calls: [{ tool: "WebSearch", status: "success", result_length: 10 }] };
    assert.equal(buildCompact(trace), "WebSearch · unbekannt / unbekannt · erfolgreich");
  });

  it("handles a completely empty/partial trace object without throwing", () => {
    assert.equal(buildCompact({}), "unbekannt / unbekannt");
    assert.equal(buildCompact({ provider: "ollama" }), "ollama / unbekannt");
  });

  it("handles missing tool_calls (undefined) gracefully", () => {
    const trace = { provider: "ollama", model: "qwen-solid", fallback_used: false };
    assert.equal(buildCompact(trace), "ollama / qwen-solid");
  });

  it("never shows config-derived values — only trace fields (no API keys/prompts)", () => {
    const trace = {
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      fallback_used: true,
      tool_calls: [{ tool: "WebSearch", status: "success", result_length: 30 }],
    };
    const line = buildCompact(trace);
    // Sensible Felder dürfen NICHT auftauchen
    assert.ok(!line.includes("api_key"));
    assert.ok(!line.includes("system_prompt"));
    assert.ok(!line.includes("auth"));
    assert.ok(!line.includes("Bearer"));
  });
});
