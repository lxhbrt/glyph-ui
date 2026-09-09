/**
 * Ordner-Suche proxy: timeout under Cloudflare's 100s HTTP limit.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/** Proxy wait for glyph-agent /vault/find. Must stay below CF 100s. */
export const VAULT_FIND_TIMEOUT_MS = 90_000;

const TIMEOUT_COPY = "Ordner-Suche hat zu lange gedauert.";

export function isTimeoutError(err) {
  if (!err) return false;
  const name = String(err.name || "");
  if (name === "TimeoutError" || name === "AbortError") return true;
  return /timed?\s*out|aborted due to timeout/i.test(String(err.message || err));
}

export function vaultFindProxyCatch(err) {
  if (isTimeoutError(err)) {
    return {
      status: 504,
      body: { ok: false, hits: [], error: TIMEOUT_COPY },
    };
  }
  return {
    status: 502,
    body: {
      ok: false,
      hits: [],
      error: err instanceof Error ? err.message : String(err),
    },
  };
}
