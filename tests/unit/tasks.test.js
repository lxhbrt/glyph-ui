/**
 * Unit tests: Aufgaben-Übergabe (Kopf-Labels, Belege, Fehlertext).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canMarkDone,
  cleanArtifact,
  compactTrace,
  formatTaskMeta,
  headLabel,
  sanitizeEvidence,
  statusLabel,
  tasksEndpointError,
} from "../../client/src/utils/tasks.js";

describe("headLabel / statusLabel", () => {
  it("keeps empty target as later, never Analyse as a head", () => {
    assert.equal(headLabel(""), "Später festlegen");
    assert.equal(headLabel("_code"), "^_Code");
    assert.equal(headLabel("analysis"), "analysis");
    assert.equal(statusLabel("analysis"), "Analyse");
    assert.equal(statusLabel("new"), "neu");
  });

  it("formats plan-tab meta without a head", () => {
    assert.equal(formatTaskMeta({ status: "new" }), "neu · kein Kopf");
    assert.equal(
      formatTaskMeta({ status: "analysis", target: "grok" }),
      "Analyse · Grok Build",
    );
  });
});

describe("canMarkDone", () => {
  it("requires an artifact path, not chat evidence", () => {
    assert.equal(canMarkDone({ evidence: { prompt: "x", answer: "done" } }), false);
    assert.equal(canMarkDone({ artifact: "  " }), false);
    assert.equal(canMarkDone({ artifact: "client/src/App.jsx" }), true);
    assert.equal(cleanArtifact("  a.md  "), "a.md");
  });
});

describe("sanitizeEvidence", () => {
  it("keeps path and name, drops blobs", () => {
    const out = sanitizeEvidence({
      prompt: "Enter sendet nicht",
      answer: "offen",
      trace: { model: "deepseek-v4", blob: "xxxx", steps: ["a"] },
      attachments: [
        {
          name: "a.png",
          path: "/tmp/a.png",
          content: "AAAA",
          previewUrl: "data:image/png;base64,xxxx",
        },
      ],
    });
    assert.equal(out.prompt, "Enter sendet nicht");
    assert.equal(out.trace.model, "deepseek-v4");
    assert.equal(out.trace.blob, undefined);
    assert.deepEqual(out.attachments[0], {
      name: "a.png",
      path: "/tmp/a.png",
      mimeType: "",
      size: 0,
    });
  });

  it("compacts retrieval sources", () => {
    const t = compactTrace({
      retrieval: { type: "hybrid", sources: ["a", "b", "c"] },
    });
    assert.deepEqual(t.retrieval.sources, ["a", "b", "c"]);
  });
});

describe("tasksEndpointError", () => {
  it("maps stale engine 404 to a restart hint", () => {
    assert.equal(
      tasksEndpointError({ error: "Not found" }, 502),
      "Aufgaben-API fehlt — glyph-agent neu starten.",
    );
    assert.equal(
      tasksEndpointError({}, 404, "x"),
      "Aufgaben-API fehlt — glyph-agent neu starten.",
    );
    assert.equal(
      tasksEndpointError(
        { error: "tasks: Endpoint fehlt (glyph-agent neu starten)." },
        502,
      ),
      "Aufgaben-API fehlt — glyph-agent neu starten.",
    );
  });

  it("keeps real store errors", () => {
    assert.equal(
      tasksEndpointError({ error: "Aufgabe braucht einen Titel" }, 400),
      "Aufgabe braucht einen Titel",
    );
  });
});
