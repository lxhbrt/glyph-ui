/**
 * °_Agent ACP → HTTP /chat: Apfel an = Arbeits-Vault-Treffer.
 * Fehlt das Flag: vault_search false → Engine: memory-wiki + offenes Web.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * @param {{ vaultSearch?: boolean, vaultSelected?: unknown } | null | undefined} glyphMeta
 * @param {{ isCode?: boolean }} [opts]
 * @returns {{ vault_search?: boolean, vault_selected?: unknown }}
 */
export function agentVaultBodyFromMeta(glyphMeta, opts = {}) {
  if (opts.isCode) return {};
  const body = { vault_search: glyphMeta?.vaultSearch === true };
  if (Array.isArray(glyphMeta?.vaultSelected)) {
    body.vault_selected = glyphMeta.vaultSelected;
  }
  return body;
}
