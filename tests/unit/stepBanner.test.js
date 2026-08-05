/**
 * stepBanner.test.js — Unit-Tests für die Grok-artige Stufen-Anzeige (stepBanner.mjs).
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildStepBanner } from "../../server/stepBanner.mjs";

test("buildStepBanner", async (t) => {
  await t.test("leerer Banner ohne Schritte", () => {
    assert.equal(buildStepBanner({}), "");
    assert.equal(buildStepBanner({ trace: {} }), "");
    assert.equal(buildStepBanner({ trace: { steps: [] } }), "");
    assert.equal(buildStepBanner(null), "");
    assert.equal(buildStepBanner(undefined), "");
  });

  await t.test("VaultFind leer (nichts gefunden) + WebSearch + OpenRouter-Zeile", () => {
    const data = {
      answer: "Antworttext",
      trace: {
        provider: "openrouter",
        model: "openai/gpt-5.6-luna",
        fallback_used: false,
        steps: [
          { step: "VaultFind", status: "empty", detail: "0 Treffer (hybrid)" },
          { step: "WebSearch", status: "success", detail: "grob/exa · 3 Treffer" },
          { step: "LLM", status: "success", detail: "openrouter/openai/gpt-5.6-luna" },
          { step: "answer", status: "success", detail: "123 Zeichen" },
        ],
      },
    };
    const banner = buildStepBanner(data);
    // Tool-Stufen enthalten; LLM/answer nicht als Tool-Zeile.
    assert.match(banner, /SearchVault.*suche im Obsidian-Vault/);
    assert.match(banner, /nichts gefunden/);
    assert.match(banner, /SearchWeb.*suche im Internet/);
    assert.doesNotMatch(banner, /Tool · LLM/);
    assert.doesNotMatch(banner, /Tool · answer/);
    // OpenRouter-Zeile mit Modell.
    assert.match(banner, /OpenRouter · OpenRouter \/ openai\/gpt-5\.6-luna/);
    // Trennung vom Antworttext.
    assert.ok(banner.endsWith("\n\n"));
  });

  await t.test("Fehler-Status wird als fehlgeschlagen übersetzt", () => {
    const banner = buildStepBanner({
      trace: {
        steps: [{ step: "ExtractUrl", status: "error", detail: "timeout" }],
        provider: "openrouter",
        model: "m",
      },
    });
    assert.match(banner, /Fetch — rufe konkrete URL ab.*fehlgeschlagen/);
  });

  await t.test("unbekannter Schritt roh übernommen", () => {
    const banner = buildStepBanner({
      trace: {
        steps: [{ step: "CustomTool", status: "success", detail: "ok" }],
        provider: "p",
        model: "m",
      },
    });
    assert.match(banner, /CustomTool.*ok/);
  });

  await t.test("Detail-Ausgabe bei Erfolg übernommen", () => {
    const banner = buildStepBanner({
      trace: {
        steps: [{ step: "WebSearch", status: "success", detail: "grob/exa · 5 Treffer" }],
        provider: "openrouter",
        model: "m",
      },
    });
    assert.match(banner, /grob\/exa · 5 Treffer/);
  });
});
