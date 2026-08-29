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

/**
 * Limited header on Sitz `web`: Neu Laden, not Beenden.
 * Desk/phone keep the chain (quit/connect); reload stays on the rail.
 */
export function surfaceHeaderControls(seat) {
  const web = seat === "web";
  return { reload: web, quit: !web };
}
