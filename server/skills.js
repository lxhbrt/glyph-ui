/**
 * Profile-dependent skill discovery for Glyph Extensions-Modal / Slash-Popup.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/**
 * @typedef {object} SkillEntry
 * @property {string} name
 * @property {string} description
 * @property {string} [inputHint]
 * @property {"skill"} kind
 * @property {"user"|"bundled"|"plugin"|"project"|"command"} source
 * @property {string} [path]
 */

/**
 * @param {string} raw
 * @returns {{ name?: string, description?: string, argumentHint?: string }}
 */
export function parseSkillFrontmatter(raw) {
  const text = String(raw || "");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const block = m[1];
  /** @type {Record<string, string>} */
  const fields = {};
  let key = null;
  let buf = [];
  const flush = () => {
    if (!key) return;
    fields[key] = buf.join("\n").trim();
    key = null;
    buf = [];
  };
  for (const line of block.split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (km && !line.startsWith(" ") && !line.startsWith("\t")) {
      flush();
      key = km[1];
      const rest = km[2];
      if (rest === ">" || rest === "|") {
        buf = [];
      } else {
        buf = [rest.replace(/^["']|["']$/g, "")];
      }
      continue;
    }
    if (key != null) {
      buf.push(line.replace(/^\s+/, ""));
    }
  }
  flush();
  return {
    name: fields.name || undefined,
    description: fields.description || undefined,
    argumentHint: fields["argument-hint"] || fields.argumentHint || undefined,
  };
}

/**
 * Roots to scan for a profile (absolute directories that may contain skills).
 *
 * @param {string} profileId
 * @param {{ home?: string, cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Array<{ dir: string, source: SkillEntry["source"] }>}
 */
export function skillRootsForProfile(profileId, opts = {}) {
  const home = opts.home || os.homedir();
  const cwd = opts.cwd || process.cwd();
  const id = String(profileId || "grok");
  /** @type {Array<{ dir: string, source: SkillEntry["source"] }>} */
  const roots = [];

  if (id === "grok") {
    roots.push(
      { dir: path.join(home, ".grok", "skills"), source: "user" },
      { dir: path.join(home, ".grok", "bundled", "skills"), source: "bundled" },
      { dir: path.join(cwd, ".grok", "skills"), source: "project" },
      { dir: path.join(cwd, ".agents", "skills"), source: "project" },
    );
  } else if (id === "claude") {
    roots.push(
      { dir: path.join(home, ".claude", "skills"), source: "user" },
      { dir: path.join(home, ".claude", "commands"), source: "user" },
      { dir: path.join(cwd, ".claude", "skills"), source: "project" },
      { dir: path.join(cwd, ".agents", "skills"), source: "project" },
    );
  } else if (id === "glyph-agent") {
    roots.push(
      { dir: path.join(home, ".glyph", "skills"), source: "user" },
      { dir: path.join(home, ".glyph-agent", "skills"), source: "user" },
      { dir: path.join(cwd, ".agents", "skills"), source: "project" },
      { dir: path.join(cwd, ".glyph", "skills"), source: "project" },
    );
  } else {
    roots.push(
      { dir: path.join(cwd, ".agents", "skills"), source: "project" },
      { dir: path.join(home, ".grok", "skills"), source: "user" },
    );
  }

  return roots;
}

/**
 * Plugin skill roots under ~/.grok/installed-plugins (grok only).
 * @param {string} home
 * @returns {Promise<Array<{ dir: string, source: SkillEntry["source"] }>>}
 */
async function grokPluginSkillRoots(home) {
  const base = path.join(home, ".grok", "installed-plugins");
  /** @type {Array<{ dir: string, source: SkillEntry["source"] }>} */
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    // Common layouts: plugin/skills, plugin/grok/skills
    for (const sub of ["skills", path.join("grok", "skills")]) {
      out.push({
        dir: path.join(base, ent.name, sub),
        source: "plugin",
      });
    }
  }
  return out;
}

/**
 * @param {string} skillMdPath
 * @param {SkillEntry["source"]} source
 * @returns {Promise<SkillEntry | null>}
 */
async function readSkillFile(skillMdPath, source) {
  let raw;
  try {
    raw = await fs.readFile(skillMdPath, "utf8");
  } catch {
    return null;
  }
  const fm = parseSkillFrontmatter(raw);
  const dirName = path.basename(path.dirname(skillMdPath));
  const fileStem = path.basename(skillMdPath, path.extname(skillMdPath));
  const name = String(fm.name || (fileStem === "SKILL" ? dirName : fileStem))
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  if (!name) return null;
  const description = String(fm.description || "").trim();
  const inputHint = String(fm.argumentHint || "").trim();
  return {
    name,
    description,
    inputHint,
    kind: "skill",
    source,
    path: skillMdPath,
  };
}

/**
 * Scan one directory for SKILL.md packages or flat *.md command files.
 *
 * @param {string} dir
 * @param {SkillEntry["source"]} source
 * @returns {Promise<SkillEntry[]>}
 */
async function scanSkillDir(dir, source) {
  /** @type {SkillEntry[]} */
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const skillMd = path.join(full, "SKILL.md");
      const skill = await readSkillFile(skillMd, source);
      if (skill) out.push(skill);
      continue;
    }
    if (!ent.isFile()) continue;
    // Flat command markdown (Claude-style commands/)
    if (/\.md$/i.test(ent.name) && ent.name.toUpperCase() !== "SKILL.MD") {
      const skill = await readSkillFile(full, source);
      if (skill) out.push(skill);
    }
  }
  return out;
}

/**
 * @param {string} profileId
 * @param {{ home?: string, cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<{ profile: string, skills: SkillEntry[], roots: string[], hint: string | null }>}
 */
export async function listSkillsForProfile(profileId, opts = {}) {
  const home = opts.home || os.homedir();
  const id = String(profileId || "grok");
  let roots = skillRootsForProfile(id, { ...opts, home });
  if (id === "grok") {
    roots = roots.concat(await grokPluginSkillRoots(home));
  }

  /** @type {Map<string, SkillEntry>} */
  const byName = new Map();
  // Later roots override earlier only if higher priority: project > user > plugin > bundled
  const priority = { project: 4, user: 3, plugin: 2, bundled: 1, command: 1 };
  for (const { dir, source } of roots) {
    const found = await scanSkillDir(dir, source);
    for (const s of found) {
      const prev = byName.get(s.name);
      if (!prev || (priority[s.source] || 0) >= (priority[prev.source] || 0)) {
        byName.set(s.name, s);
      }
    }
  }

  const skills = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  let hint = null;
  if (skills.length === 0) {
    if (id === "glyph-agent") {
      hint =
        "Keine Skills gefunden. Optional: ~/.glyph/skills/<name>/SKILL.md anlegen.";
    } else if (id === "claude") {
      hint =
        "Keine Claude-Skills gefunden unter ~/.claude/skills (oder Projekt .claude/skills).";
    } else {
      hint = "Keine Skills gefunden unter ~/.grok/skills.";
    }
  }

  return {
    profile: id,
    skills,
    roots: roots.map((r) => r.dir),
    hint,
  };
}
