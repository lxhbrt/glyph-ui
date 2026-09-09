/**
 * Cache-bust in-place UI reload. Keeps the login session.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

export function hardReloadUi(loc = globalThis.location) {
  const url = new URL(String(loc.href));
  url.searchParams.set("_r", String(Date.now()));
  loc.replace(url.toString());
}
