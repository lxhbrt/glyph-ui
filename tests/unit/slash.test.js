/**
 * Unit tests: slash token + insert + rank.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findSlashHighlightRanges,
  fuzzyScore,
  highlightSlashSegments,
  insertSlashCommand,
  isValidSlashCommand,
  rankCatalog,
  slashTokenAt,
} from "../../client/src/utils/slash.js";

describe("slashTokenAt", () => {
  it("detects / at start", () => {
    const t = slashTokenAt("/gr", 3);
    assert.deepEqual(t, { start: 0, end: 3, query: "gr" });
  });

  it("detects / after whitespace", () => {
    const t = slashTokenAt("hello /pl", 9);
    assert.equal(t?.start, 6);
    assert.equal(t?.query, "pl");
  });

  it("rejects mid-path slash", () => {
    assert.equal(slashTokenAt("path/to", 7), null);
  });

  it("closes after space past token", () => {
    assert.equal(slashTokenAt("/foo bar", 8), null);
  });
});

describe("insertSlashCommand", () => {
  it("replaces partial token with trailing space", () => {
    const r = insertSlashCommand("/gr", 3, "grill-with-docs");
    assert.equal(r.text, "/grill-with-docs ");
    assert.equal(r.cursor, "/grill-with-docs ".length);
  });

  it("preserves surrounding text", () => {
    const r = insertSlashCommand("x /ab y", 5, "about");
    // token is "/ab" at 2..5 → replace with /about 
    assert.equal(r.text, "x /about  y");
  });
});

describe("rankCatalog", () => {
  it("puts skills before commands when scores equal", () => {
    const ranked = rankCatalog(
      [{ name: "zeta", description: "", kind: "skill" }],
      [{ name: "alpha", description: "", kind: "command" }],
      "",
    );
    assert.equal(ranked[0].kind, "skill");
    assert.equal(ranked[1].kind, "command");
  });

  it("fuzzy prefers prefix", () => {
    assert.ok(fuzzyScore("gr", "grill-me") > fuzzyScore("gr", "angry"));
  });
});

describe("isValidSlashCommand / highlight", () => {
  const skills = [{ name: "grilling", kind: "skill" }];
  const commands = [
    { name: "compact", kind: "command" },
    { name: "context", kind: "command" },
  ];

  it("accepts exact catalog name", () => {
    assert.equal(isValidSlashCommand("compact", skills, commands), true);
    assert.equal(isValidSlashCommand("grilling", skills, commands), true);
  });

  it("accepts unique prefix match", () => {
    assert.equal(isValidSlashCommand("comp", skills, commands), true); // only compact
  });

  it("rejects ambiguous prefix", () => {
    // "c" matches compact + context
    assert.equal(isValidSlashCommand("c", skills, commands), false);
  });

  it("rejects unknown", () => {
    assert.equal(isValidSlashCommand("nope", skills, commands), false);
    assert.equal(isValidSlashCommand("", skills, commands), false);
  });

  it("finds ranges in free text", () => {
    const ranges = findSlashHighlightRanges(
      "/compact keep auth",
      skills,
      commands,
    );
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].start, 0);
    assert.equal(ranges[0].end, "/compact".length);
  });

  it("segments highlight only the command token", () => {
    const segs = highlightSlashSegments("/compact keep", skills, commands);
    assert.equal(segs[0].highlight, true);
    assert.equal(segs[0].text, "/compact");
    assert.equal(segs[1].highlight, false);
    assert.match(segs[1].text, /keep/);
  });
});
