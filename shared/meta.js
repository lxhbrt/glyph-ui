/**
 * Shared Glyph version + build metadata (package.json + git commit count).
 * Used by the bridge at startup and by Vite at client build/dev time.
 *
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @returns {string} */
export function readGlyphVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(ROOT, "package.json"), "utf8"),
    );
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

/**
 * Monotonic build number: total commits on HEAD (`git rev-list --count HEAD`).
 * Falls back to 0 when git is missing or the tree is not a clone.
 * @returns {number}
 */
export function readGlyphBuild() {
  try {
    const out = execSync("git rev-list --count HEAD", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    const n = Number.parseInt(out, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function getGlyphRoot() {
  return ROOT;
}
