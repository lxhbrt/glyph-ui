/**
 * Glyph identity: build # (primary mark) + package semver (secondary).
 * Injected at Vite build / dev from git commit count + package.json.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/** package.json semver — secondary to the build mark. @type {string} */
export const GLYPH_VERSION =
  typeof __GLYPH_VERSION__ !== "undefined" && __GLYPH_VERSION__
    ? String(__GLYPH_VERSION__)
    : "0.0.0-dev";

/**
 * Primary product mark: git commit count (`git rev-list --count HEAD`).
 * Shown as `#17` — ordered, comparable, not another v0.x.y.
 * @type {number}
 */
export const GLYPH_BUILD =
  typeof __GLYPH_BUILD__ !== "undefined" && __GLYPH_BUILD__ != null
    ? Number(__GLYPH_BUILD__) || 0
    : 0;
