/**
 * Model-Felder für Graph / Anbindung.
 * Slash in der ID = OpenRouter-Slug; ohne Slash = Direct-ID.
 */

/**
 * @param {object|null|undefined} bindings
 * @param {"agent"|"code"|string} absorb
 */
export function modelsForHead(bindings, absorb) {
  const shared = bindings?.models?.shared || {};
  const code = bindings?.models?.code || {};
  if (absorb === "code" && String(code.primary || "").trim()) {
    return {
      primary: String(code.primary).trim(),
      fallback: String(code.fallback || ""),
      source: "code",
    };
  }
  return {
    primary: String(shared.primary || "").trim(),
    fallback: String(shared.fallback || ""),
    source: "shared",
  };
}

/**
 * PUT /api/bindings body fragment. null = nicht speichern (leeres Agent-Primary).
 * @param {{ absorb?: string, primary?: string, fallback?: string }} input
 */
export function buildModelsPatch({ absorb, primary, fallback } = {}) {
  const p = String(primary || "").trim();
  const fb = String(fallback || "").trim();
  if (absorb === "code") {
    if (!p) return { models: { code: null } };
    return { models: { code: { primary: p, fallback: fb } } };
  }
  if (!p) return null;
  return { models: { shared: { primary: p, fallback: fb } } };
}
