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
/**
 * Status after PUT /api/bindings pushed credentials to glyph-agent.
 * @param {{ ok?: boolean, applied?: boolean, error?: string } | null | undefined} apply
 * @returns {{ ok: boolean, text: string }}
 */
export function applyLiveStatus(apply) {
  if (apply && apply.ok && apply.applied) {
    return { ok: true, text: "Gespeichert · live am Agent." };
  }
  const reason = String(apply?.error || "").trim() || "offline";
  return {
    ok: false,
    text: `Gespeichert, Agent nahm es nicht: ${reason}`,
  };
}

/** °_Agent / ^_Code store models in bindings; Grok is CLI. */
export function isCloudModelProfile(profileId) {
  return profileId === "_code" || profileId === "glyph-agent";
}

/**
 * Model pill from GET /api/bindings. Polling is read-only;
 * POST /api/models/apply is connect / save / explicit click.
 *
 * @param {object} data
 * @param {string} profileId
 */
export function modelHudFromBindings(data = {}, profileId = "") {
  const active = data.modelsActive?.active || data.modelsActive?.shared;
  const desired = data.models?.shared;
  const code = data.modelsActive?.code || data.models?.code;
  const useCode = profileId === "_code" && Boolean(code?.primary);
  const primary = useCode
    ? code.primary
    : active?.primary ||
      desired?.primary ||
      data.modelsActive?.shared?.primary ||
      "";
  const fb = useCode
    ? (code.fallback ?? "")
    : (active?.fallback ??
      desired?.fallback ??
      data.modelsActive?.shared?.fallback ??
      "");
  const label = primary && fb ? `${primary} → ${fb}` : primary || "—";
  const liveLabel = String(data.modelsActive?.active?.label || "").trim();
  return {
    kind: "openrouter",
    label,
    primary,
    fallback: fb || "",
    liveLabel,
    mismatch: Boolean(data.modelsMismatch),
  };
}

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
