/**
 * ACP available_commands_update helpers.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * @param {unknown} raw
 * @returns {Array<{ name: string, description: string, inputHint: string }>}
 */
export function normalizeAvailableCommands(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const name = String(c.name || "").trim();
    if (!name) continue;
    const description = String(c.description || "").trim();
    const hint =
      c.input && typeof c.input === "object" && c.input.hint != null
        ? String(c.input.hint).trim()
        : "";
    out.push({
      name,
      description,
      inputHint: hint,
    });
  }
  return out;
}

/**
 * @param {ReturnType<typeof normalizeAvailableCommands>} commands
 */
export function commandsBroadcastPayload(commands) {
  return {
    type: "available_commands",
    commands: Array.isArray(commands) ? commands : [],
  };
}
