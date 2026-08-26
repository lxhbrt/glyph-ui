/**
 * Public web surface hostnames. Keep in sync with server/webSurface.mjs.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

const DEFAULT_WEB_HOSTS = ["glyph-ui.com", "www.glyph-ui.com"];

export function isWebSurfaceHost(hostname) {
  const h = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .split(":")[0];
  return DEFAULT_WEB_HOSTS.includes(h);
}
