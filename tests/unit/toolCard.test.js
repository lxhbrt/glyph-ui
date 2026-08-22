/**
 * Unit tests: ACP tool-card summary + detail extraction.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractToolDetails,
  formatToolStatus,
  isToolRunning,
  isToolTerminal,
  summarizeTool,
  toolHasDetails,
} from "../../client/src/utils/toolCard.js";

describe("formatToolStatus", () => {
  it("maps ACP statuses to German labels", () => {
    assert.equal(formatToolStatus("pending"), "wartet");
    assert.equal(formatToolStatus("in_progress"), "läuft");
    assert.equal(formatToolStatus("completed"), "fertig");
    assert.equal(formatToolStatus("failed"), "fehl");
    assert.equal(formatToolStatus("cancelled"), "abgebrochen");
  });
});

describe("isToolTerminal / isToolRunning", () => {
  it("classifies ACP statuses", () => {
    assert.equal(isToolTerminal("completed"), true);
    assert.equal(isToolTerminal("failed"), true);
    assert.equal(isToolTerminal("cancelled"), true);
    assert.equal(isToolTerminal("pending"), false);
    assert.equal(isToolRunning("pending"), true);
    assert.equal(isToolRunning("in_progress"), true);
    assert.equal(isToolRunning("completed"), false);
  });
});

describe("summarizeTool", () => {
  it("read: verb + basename", () => {
    const s = summarizeTool({
      kind: "read",
      rawInput: { target_file: "/Users/me/glyph-ui/server/index.js" },
    });
    assert.equal(s.verb, "Gelesen");
    assert.equal(s.target, "index.js");
  });

  it("execute: verb + command", () => {
    const s = summarizeTool({
      kind: "execute",
      rawInput: { command: "npm test" },
    });
    assert.equal(s.verb, "Ausgeführt");
    assert.equal(s.target, "npm test");
  });

  it("edit: verb + path + line deltas from rawOutput", () => {
    const s = summarizeTool({
      kind: "edit",
      rawInput: { file_path: "client/src/App.jsx" },
      rawOutput: { lines_added: 4, lines_removed: 1 },
    });
    assert.equal(s.verb, "Geändert");
    assert.equal(s.target, "App.jsx");
    assert.equal(s.deltaAdd, 4);
    assert.equal(s.deltaDel, 1);
  });

  it("search: verb + query", () => {
    const s = summarizeTool({
      kind: "search",
      title: "web_search",
      rawInput: { query: "ACP tool_call" },
    });
    assert.equal(s.verb, "Gesucht");
    assert.equal(s.target, "ACP tool_call");
  });

  it("surfaces Warum erlaubt from allowedBy", () => {
    const s = summarizeTool({
      kind: "edit",
      rawInput: { path: "a.js", _allowedBy: "Task Dark Mode" },
    });
    assert.equal(s.allowedBy, "Task Dark Mode");
  });

  it("falls back to title when kind/input empty", () => {
    const s = summarizeTool({ title: "read_file", status: "completed" });
    assert.equal(s.verb, "read_file");
    assert.equal(s.target, "");
  });
});

describe("extractToolDetails", () => {
  it("renders edit old/new as a diff section", () => {
    const d = extractToolDetails({
      kind: "edit",
      rawInput: {
        path: "a.js",
        old_string: "foo",
        new_string: "bar",
      },
    });
    assert.equal(toolHasDetails(d), true);
    const diff = d.sections.find((s) => s.kind === "diff");
    assert.ok(diff);
    assert.match(diff.text, /^- foo/m);
    assert.match(diff.text, /^\+ bar/m);
  });

  it("renders ACP content text", () => {
    const d = extractToolDetails({
      content: [
        { type: "content", content: { type: "text", text: "hello output" } },
      ],
    });
    assert.equal(d.sections.some((s) => s.text.includes("hello output")), true);
  });

  it("renders execute command + output", () => {
    const d = extractToolDetails({
      kind: "execute",
      rawInput: { command: "ls" },
      content: [{ type: "content", content: { type: "text", text: "file.txt\n" } }],
    });
    assert.ok(d.sections.find((s) => s.label === "Befehl" && s.text === "ls"));
    assert.ok(d.sections.find((s) => s.label === "Ausgabe" && s.text.includes("file.txt")));
  });

  it("empty when only title/status exist", () => {
    const d = extractToolDetails({ title: "Read file", status: "completed" });
    assert.equal(toolHasDetails(d), false);
  });
});
