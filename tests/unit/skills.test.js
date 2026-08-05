/**
 * Unit tests: skill discovery + frontmatter.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  listSkillsForProfile,
  parseSkillFrontmatter,
  skillRootsForProfile,
} from "../../server/skills.js";

describe("parseSkillFrontmatter", () => {
  it("reads name and folded description", () => {
    const raw = `---
name: grill-with-docs
description: >
  Relentless interview about a plan.
argument-hint: "<topic>"
---

# Body
`;
    const fm = parseSkillFrontmatter(raw);
    assert.equal(fm.name, "grill-with-docs");
    assert.match(fm.description || "", /Relentless interview/);
    assert.equal(fm.argumentHint, "<topic>");
  });

  it("returns empty without frontmatter", () => {
    assert.deepEqual(parseSkillFrontmatter("# hi"), {});
  });
});

describe("skillRootsForProfile", () => {
  it("grok roots include ~/.grok/skills", () => {
    const roots = skillRootsForProfile("grok", {
      home: "/Users/x",
      cwd: "/proj",
    });
    assert.ok(roots.some((r) => r.dir.endsWith("/.grok/skills")));
    assert.ok(roots.some((r) => r.source === "bundled"));
  });

  it("claude roots include ~/.claude/skills", () => {
    const roots = skillRootsForProfile("claude", {
      home: "/Users/x",
      cwd: "/proj",
    });
    assert.ok(roots.some((r) => r.dir.includes(".claude/skills")));
  });
});

describe("listSkillsForProfile", () => {
  it("discovers SKILL.md packages under user dir", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "glyph-skills-"));
    const skillDir = path.join(tmp, ".grok", "skills", "demo-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: demo-skill
description: A test skill
---
# Demo
`,
      "utf8",
    );
    const result = await listSkillsForProfile("grok", {
      home: tmp,
      cwd: path.join(tmp, "empty-cwd"),
    });
    assert.ok(result.skills.some((s) => s.name === "demo-skill"));
    const hit = result.skills.find((s) => s.name === "demo-skill");
    assert.equal(hit.kind, "skill");
    assert.match(hit.description, /test skill/i);
  });
});
