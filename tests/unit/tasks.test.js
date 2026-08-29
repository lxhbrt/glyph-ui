/**
 * Unit tests: Aufgaben-Übergabe (Kopf-Labels, Belege, Fehlertext).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canCreateHandoff,
  canMarkDone,
  cleanArtifact,
  compactTrace,
  evidenceClip,
  formatTaskMeta,
  handoffTitleFrom,
  hasHandoffPair,
  headLabel,
  sanitizeEvidence,
  statusLabel,
  tasksEndpointError,
} from "../../client/src/utils/tasks.js";

describe("handoffTitleFrom", () => {
  it("uses the user prompt, not the assistant ping", () => {
    assert.equal(
      handoffTitleFrom(
        { text: "Bitte den Apfel-Button verschieben" },
        { text: "Hier. Was soll ich tun?" },
      ),
      "Bitte den Apfel-Button verschieben",
    );
  });

  it("does not use trivial user pings as title", () => {
    assert.equal(
      handoffTitleFrom({ text: "test" }, { text: "Hier. Was soll ich tun?" }),
      "Aufgabe",
    );
  });
});

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

describe("hasHandoffPair", () => {
  it("requires both prompt and answer text", () => {
    assert.equal(hasHandoffPair({ prompt: "Enter sendet nicht", answer: "offen" }), true);
    assert.equal(hasHandoffPair({ prompt: "Enter sendet nicht", answer: "" }), false);
    assert.equal(hasHandoffPair({ prompt: "  ", answer: "offen" }), false);
    assert.equal(hasHandoffPair({}), false);
  });
});

describe("canCreateHandoff", () => {
  it("needs title, pass, and the message/answer pair", () => {
    const pair = { prompt: "Apfel verschieben", answer: "Sitzt über dem Kopf." };
    assert.equal(canCreateHandoff({ title: "Apfel", pass: "Button über den Kopf", ...pair }), true);
    assert.equal(canCreateHandoff({ title: "Apfel", pass: "Button über den Kopf", prompt: pair.prompt, answer: "" }), false);
    assert.equal(canCreateHandoff({ title: "Apfel", pass: "", ...pair }), false);
  });
});

describe("evidenceClip", () => {
  it("collapses whitespace and marks a truncated answer", () => {
    assert.equal(evidenceClip("Apfel sitzt über dem Kopf."), "Apfel sitzt über dem Kopf.");
    assert.equal(
      evidenceClip("x".repeat(80), 40),
      `${"x".repeat(39)}…`,
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
