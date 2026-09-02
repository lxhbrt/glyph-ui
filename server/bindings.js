/**
 * Local connection bindings: API keys + status for agent profiles.
 *
 * Secrets live in ~/.glyph-ui/bindings.json (mode 0600). Values are applied
 * into process.env for the running bridge (and child agents inherit them).
 * Existing process.env wins on first load; UI saves always update env live.
 *
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

import { accessSync, constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findOnPath } from "./agents.js";

/** Writable key fields (stored in bindings.json → process.env). */
export const BINDING_KEY_IDS = [
  "DIRECT_API_KEY",
  "OPENROUTER_API_KEY",
  "XAI_API_KEY",
];

/** Optional non-secret settings. */
export const BINDING_SETTING_IDS = ["GLYPH_AGENT_URL", "DIRECT_API_URL"];

/**
 * Provider modes (UI-Radio). Stored in bindings.json → env → glyph-agent.
 * - direct     : Direct-API (Primary), kein Fallback
 * - openrouter : nur OpenRouter
 * - hybrid     : Direct primär → OpenRouter-Fallback (Default)
 */
export const PROVIDER_MODES = ["direct", "openrouter", "hybrid"];

export function normalizeProvider(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "fallback") return "openrouter";
  if (PROVIDER_MODES.includes(v)) return v;
  return "hybrid"; // Default
}

/**
 * Effektiver Hop eines Provider-Modus (für Vergleiche):
 * hybrid läuft je nach Peak über direct (off-peak) oder openrouter (Peak).
 */
export function providerEffective(mode, opts = {}) {
  const m = normalizeProvider(mode);
  if (m !== "hybrid") return m;
  return opts.isPeak ? "openrouter" : "direct";
}

/**
 * @param {string} [stateDir]
 * @returns {string}
 */
export function bindingsPath(stateDir) {
  const dir =
    stateDir ||
    process.env.GLYPH_UI_STATE_DIR ||
    path.join(os.homedir(), ".glyph-ui");
  return path.join(dir, "bindings.json");
}

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function maskSecret(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  if (s.length <= 4) return "…";
  return `…${s.slice(-4)}`;
}

/**
 * @param {unknown} pair
 * @returns {{ primary: string, fallback: string, contextWindow?: number } | null}
 */
export function normalizeModelPair(pair) {
  if (!pair || typeof pair !== "object") return null;
  const primary = String(pair.primary || pair.model || "").trim();
  if (!primary) return null;
  const fallback = String(pair.fallback || pair.fallbackModel || "").trim();
  const out = { primary, fallback };
  const cw = Number(pair.contextWindow ?? pair.context_length);
  if (Number.isFinite(cw) && cw > 0) out.contextWindow = Math.round(cw);
  return out;
}

/**
 * @param {unknown} raw
 * @returns {{
 *   shared: { primary: string, fallback: string, contextWindow?: number } | null,
 *   code: { primary: string, fallback: string, contextWindow?: number } | null,
 * }}
 */
export function normalizeModels(raw) {
  const empty = { shared: null, code: null };
  if (!raw || typeof raw !== "object") return empty;
  const src = raw.models && typeof raw.models === "object" ? raw.models : raw;
  const shared = normalizeModelPair(src.shared);
  const code = normalizeModelPair(src.code);
  return { shared, code };
}

/**
 * Build agent POST /models body from stored models.
 * Empty code primary → omit code (agent uses shared for both).
 * @param {{ shared?: object|null, code?: object|null }} models
 */
export function modelsToAgentPayload(models) {
  const sharedPair = normalizeModelPair(models?.shared);
  if (!sharedPair) return null;
  const body = {
    shared: {
      primary: sharedPair.primary,
      fallback: sharedPair.fallback || "",
    },
  };
  const codePair = normalizeModelPair(models?.code);
  if (codePair) {
    body.code = {
      primary: codePair.primary,
      fallback: codePair.fallback || "",
    };
  }
  return body;
}

/**
 * Compare desired bindings models vs agent health snapshot.
 * @param {{ shared?: object|null, code?: object|null }} desired
 * @param {object|null|undefined} health
 */
export function modelsMismatch(desired, health) {
  const want = modelsToAgentPayload(desired);
  if (!want) return false;
  const snap = health?.models || health || {};
  const actShared = snap.shared || {
    primary: health?.primary_model || health?.model,
    fallback: health?.fallback_model,
  };
  const actCode = snap.code || {
    primary: health?.code_model,
    fallback: health?.code_fallback_model,
  };
  const norm = (v) => String(v || "").trim();
  if (norm(want.shared.primary) !== norm(actShared?.primary)) return true;
  if (norm(want.shared.fallback) !== norm(actShared?.fallback)) return true;
  if (want.code) {
    if (norm(want.code.primary) !== norm(actCode?.primary)) return true;
    if (norm(want.code.fallback) !== norm(actCode?.fallback)) return true;
  } else if (actCode?.override) {
    // agent has code override but we want shared-only
    return true;
  }
  // Provider-Modus vergleichen (nur wenn gewünscht gesetzt)
  if (desired?.provider) {
    const wantProv = normalizeProvider(desired.provider);
    const actProvRaw = String(
      snap.provider || snap.provider_mode || "",
    )
      .trim()
      .toLowerCase();
    const actProv =
      actProvRaw === "fallback" ? "openrouter" : actProvRaw;
    if (actProv) {
      // Agent meldet den effektiven Hop; hybrid == direct (off-peak) / openrouter (peak)
      const isPeak = Boolean(snap.provider_peak);
      const wantEffective = providerEffective(wantProv, { isPeak });
      const actEffective = providerEffective(actProv, { isPeak });
      if (wantEffective !== actEffective) return true;
    }
  }
  return false;
}

/**
 * @param {unknown} raw
 * @returns {{
 *   keys: Record<string, string>,
 *   settings: Record<string, string>,
 *   models: { shared: object|null, code: object|null },
 * }}
 */
export function normalizeBindingsFile(raw) {
  const keys = {};
  const settings = {};
  const obj = raw && typeof raw === "object" ? raw : {};
  const keySrc =
    obj.keys && typeof obj.keys === "object"
      ? obj.keys
      : obj;
  for (const id of BINDING_KEY_IDS) {
    const v = keySrc?.[id];
    if (typeof v === "string" && v.trim()) keys[id] = v.trim();
  }
  // Flat file shape support: top-level key ids
  for (const id of BINDING_KEY_IDS) {
    if (!keys[id] && typeof obj[id] === "string" && obj[id].trim()) {
      keys[id] = obj[id].trim();
    }
  }
  const setSrc =
    obj.settings && typeof obj.settings === "object" ? obj.settings : obj;
  for (const id of BINDING_SETTING_IDS) {
    const v = setSrc?.[id];
    if (typeof v === "string" && v.trim()) settings[id] = v.trim();
  }
  const models = normalizeModels(obj);
  const provider = normalizeProvider(
    (obj.provider != null && obj.provider !== ""
      ? obj.provider
      : setSrc?.PROVIDER) ||
      "",
  );
  const codeProvider = normalizeProvider(
    (obj.codeProvider != null && obj.codeProvider !== ""
      ? obj.codeProvider
      : obj.provider) ||
      "",
  );
  return { keys, settings, models, provider, codeProvider };
}

/**
 * @param {string} [filePath]
 * @returns {Promise<{ keys: Record<string, string>, settings: Record<string, string>, models: object }>}
 */
export async function readBindingsFile(filePath = bindingsPath()) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeBindingsFile(JSON.parse(raw));
  } catch {
    return {
      keys: {},
      settings: {},
      models: { shared: null, code: null },
      provider: "hybrid",
      codeProvider: "hybrid",
    };
  }
}

/**
 * @param {{ keys?: Record<string, string>, settings?: Record<string, string>, models?: object }} data
 * @param {string} [filePath]
 */
export async function writeBindingsFile(data, filePath = bindingsPath()) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const payload = {
    keys: {},
    settings: {},
  };
  for (const id of BINDING_KEY_IDS) {
    const v = data?.keys?.[id];
    if (typeof v === "string" && v.trim()) payload.keys[id] = v.trim();
  }
  for (const id of BINDING_SETTING_IDS) {
    const v = data?.settings?.[id];
    if (typeof v === "string" && v.trim()) payload.settings[id] = v.trim();
  }
  const provider = normalizeProvider(
    (data?.provider != null && data.provider !== ""
      ? data.provider
      : data?.settings?.PROVIDER) ||
      "",
  );
  payload.provider = provider;
  const codeProvider = normalizeProvider(
    (data?.codeProvider != null && data.codeProvider !== ""
      ? data.codeProvider
      : data?.provider) ||
      "",
  );
  if (codeProvider !== provider) payload.codeProvider = codeProvider;
  const models = normalizeModels({ models: data?.models || data });
  if (models.shared || models.code) {
    payload.models = {};
    if (models.shared) {
      payload.models.shared = {
        primary: models.shared.primary,
        fallback: models.shared.fallback || "",
      };
      if (models.shared.contextWindow) {
        payload.models.shared.contextWindow = models.shared.contextWindow;
      }
    }
    if (models.code) {
      payload.models.code = {
        primary: models.code.primary,
        fallback: models.code.fallback || "",
      };
      if (models.code.contextWindow) {
        payload.models.code.contextWindow = models.code.contextWindow;
      }
    }
  }
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tmp, filePath);
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    /* Windows may ignore mode */
  }
  return payload;
}

/**
 * Apply stored bindings into process.env.
 * @param {{ keys?: Record<string, string>, settings?: Record<string, string> }} data
 * @param {{ overwrite?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 *   overwrite=false (default load): only fill empty env slots
 *   overwrite=true (after UI save): always set provided values; clear when empty
 */
export function applyBindingsToEnv(data, opts = {}) {
  const env = opts.env || process.env;
  const overwrite = Boolean(opts.overwrite);
  const keys = data?.keys || {};
  const settings = data?.settings || {};

  for (const id of BINDING_KEY_IDS) {
    if (!Object.prototype.hasOwnProperty.call(keys, id)) continue;
    const v = String(keys[id] || "").trim();
    if (v) {
      if (overwrite || !String(env[id] || "").trim()) env[id] = v;
    } else if (overwrite) {
      delete env[id];
    }
  }

  for (const id of BINDING_SETTING_IDS) {
    if (!Object.prototype.hasOwnProperty.call(settings, id)) continue;
    const v = String(settings[id] || "").trim();
    if (v) {
      if (overwrite || !String(env[id] || "").trim()) env[id] = v;
    } else if (overwrite) {
      if (id === "GLYPH_AGENT_URL") env[id] = "http://127.0.0.1:18899";
      else delete env[id];
    }
  }

  // Provider-Modus → AGENT_PRIMARY_PROVIDER (glyph-agent hot-apply)
  if (Object.prototype.hasOwnProperty.call(data, "provider")) {
    const prov = normalizeProvider(data.provider);
    if (overwrite || !String(env.AGENT_PRIMARY_PROVIDER || "").trim()) {
      env.AGENT_PRIMARY_PROVIDER = prov;
    }
    if (overwrite || !String(env.AGENT_PROVIDER || "").trim()) {
      env.AGENT_PROVIDER = prov;
    }
  }
  // Code-Provider getrennt
  if (Object.prototype.hasOwnProperty.call(data, "codeProvider")) {
    const cprov = normalizeProvider(data.codeProvider);
    if (overwrite || !String(env.CODE_PROVIDER || "").trim()) {
      env.CODE_PROVIDER = cprov;
    }
  }
}

/**
 * @param {string} [filePath]
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function loadBindingsIntoEnv(filePath = bindingsPath(), env = process.env) {
  const data = await readBindingsFile(filePath);
  applyBindingsToEnv(data, { overwrite: false, env });
  return data;
}

/**
 * @param {string | null | undefined} value
 * @param {"env"|"bindings"|null} source
 */
function keyMeta(value, source) {
  const set = Boolean(String(value || "").trim());
  return {
    set,
    masked: set ? maskSecret(value) : null,
    source: set ? source : null,
  };
}

/**
 * Resolve where a secret currently comes from (env wins for display if both).
 * @param {string} id
 * @param {Record<string, string>} fileKeys
 * @param {NodeJS.ProcessEnv} env
 */
export function resolveKeySource(id, fileKeys, env = process.env) {
  const fromEnv = String(env[id] || "").trim();
  const fromFile = String(fileKeys[id] || "").trim();
  // If value matches file, prefer "bindings"; else if env set, "env"
  if (fromEnv && fromFile && fromEnv === fromFile) {
    return keyMeta(fromEnv, "bindings");
  }
  if (fromEnv && fromFile && fromEnv !== fromFile) {
    return keyMeta(fromEnv, "env");
  }
  if (fromEnv) return keyMeta(fromEnv, "env");
  if (fromFile) return keyMeta(fromFile, "bindings");
  return keyMeta(null, null);
}

/**
 * @param {string} authPath
 * @returns {Promise<boolean>}
 */
export async function grokOAuthPresent(authPath) {
  try {
    const raw = await fs.readFile(authPath, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return false;
    for (const val of Object.values(data)) {
      if (val && typeof val === "object") {
        if (typeof val.key === "string" && val.key.length > 10) return true;
        if (typeof val.access_token === "string" && val.access_token.length > 10)
          return true;
        if (typeof val.refresh_token === "string" && val.refresh_token.length > 10)
          return true;
      }
    }
    // non-empty object often means login happened
    return Object.keys(data).length > 0;
  } catch {
    return false;
  }
}

/**
 * @param {string} bin
 * @param {NodeJS.ProcessEnv} env
 */
export function resolveGrokBin(bin, env = process.env) {
  const name = String(bin || env.GROK_BIN || "grok").trim() || "grok";
  if (name.includes(path.sep)) {
    try {
      accessSync(name, constants.X_OK);
      return name;
    } catch {
      return null;
    }
  }
  return findOnPath(name, env);
}

/**
 * Probe glyph-agent HTTP /health.
 * @param {string} baseUrl
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 */
export async function probeAgentHealth(baseUrl, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 2500;
  const base = String(baseUrl || "http://127.0.0.1:18899").replace(/\/$/, "");
  const url = `${base}/health`;
  if (!fetchImpl) {
    return { ok: false, url, detail: "fetch unavailable", body: null };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    const ok = res.ok;
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    return {
      ok,
      url,
      body,
      detail: ok
        ? body?.status || body?.ok || "ok"
        : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      url,
      body: null,
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Push models to glyph-agent POST /models (hot-apply).
 * @param {string} baseUrl
 * @param {{ shared?: object|null, code?: object|null }} models
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 */
/**
 * Whether PUT /api/bindings must hot-apply credentials/models to glyph-agent.
 * Key-only saves still push — Graph-Schreiben is live, not "file only".
 * @param {{ keys?: object, settings?: object, models?: object } | null | undefined} saved
 * @param {Record<string, unknown>} [body]
 */
export function buildAgentPush(saved, body = {}) {
  const keys = saved?.keys && typeof saved.keys === "object" ? saved.keys : {};
  const settings =
    saved?.settings && typeof saved.settings === "object" ? saved.settings : {};
  const direct = {};
  const dk = String(keys.DIRECT_API_KEY || "").trim();
  const url = String(settings.DIRECT_API_URL || "").trim();
  const ork = String(keys.OPENROUTER_API_KEY || "").trim();
  const clearingDirect =
    Object.prototype.hasOwnProperty.call(body, "DIRECT_API_KEY") && !dk;
  const clearingOr =
    Object.prototype.hasOwnProperty.call(body, "OPENROUTER_API_KEY") && !ork;
  if (dk) direct.api_key = dk;
  else if (clearingDirect) direct.api_key = "";
  if (url) direct.url = url;
  if (ork) direct.openrouter_key = ork;
  else if (clearingOr) direct.openrouter_key = "";

  const modelsTouched = Boolean(body?.models);
  const providerTouched = Object.prototype.hasOwnProperty.call(body, "provider");
  const credsTouched = [
    "DIRECT_API_KEY",
    "DIRECT_API_URL",
    "OPENROUTER_API_KEY",
  ].some((id) => Object.prototype.hasOwnProperty.call(body, id));
  const hasShared = Boolean(saved?.models?.shared?.primary);
  const push = Boolean(
    (modelsTouched && hasShared) ||
      Object.keys(direct).length > 0 ||
      credsTouched ||
      providerTouched,
  );
  const kind = String(body?.kind || "agent").toLowerCase();
  return {
    push,
    models: saved?.models || null,
    direct: Object.keys(direct).length ? direct : undefined,
    provider:
      kind === "code"
        ? saved?.codeProvider || saved?.provider || "hybrid"
        : saved?.provider || "hybrid",
    kind,
  };
}

export async function pushModelsToAgent(baseUrl, models, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const payload = modelsToAgentPayload(models) || {};
  if (opts.provider) {
    payload.provider = normalizeProvider(opts.provider);
    if (opts.kind) payload.kind = opts.kind;
  }
  if (opts.direct && typeof opts.direct === "object") {
    const d = {};
    if (opts.direct.url) d.url = String(opts.direct.url).trim();
    if (Object.prototype.hasOwnProperty.call(opts.direct, "api_key")) {
      d.api_key = String(opts.direct.api_key || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(opts.direct, "openrouter_key")) {
      d.openrouter_key = String(opts.direct.openrouter_key || "").trim();
    }
    if (Object.keys(d).length) payload.direct = d;
  }
  if (!payload.shared && !payload.direct) {
    return { ok: false, error: "Kein shared.primary gesetzt", applied: false };
  }
  const base = String(baseUrl || "http://127.0.0.1:18899").replace(/\/$/, "");
  const url = `${base}/models`;
  if (!fetchImpl) {
    return { ok: false, error: "fetch unavailable", applied: false, url };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    if (!res.ok || body?.ok === false) {
      return {
        ok: false,
        applied: false,
        url,
        error: body?.error || `HTTP ${res.status}`,
        body,
      };
    }
    return { ok: true, applied: true, url, body };
  } catch (err) {
    return {
      ok: false,
      applied: false,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Probe a model via glyph-agent POST /models/probe.
 * @param {string} baseUrl
 * @param {string} modelId
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 */
export async function probeModelOnAgent(baseUrl, modelId, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 60000;
  const base = String(baseUrl || "http://127.0.0.1:18899").replace(/\/$/, "");
  const url = `${base}/models/probe`;
  if (!fetchImpl) {
    return { ok: false, error: "fetch unavailable", url };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: String(modelId || "").trim() }),
      signal: ctrl.signal,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    if (!res.ok || body?.ok === false) {
      return {
        ok: false,
        url,
        error: body?.error || `HTTP ${res.status}`,
        body,
      };
    }
    return { ok: true, url, ...body };
  } catch (err) {
    return {
      ok: false,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Resolve context window: static map → OpenRouter catalog → 250k.
 * @param {string} modelId
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, openrouterUrl?: string, cached?: number }} [opts]
 */
export async function resolveModelContextWindow(modelId, opts = {}) {
  const { resolveContextWindow, DEFAULT_CONTEXT_WINDOW } = await import(
    "../shared/contextMeter.mjs"
  );
  const id = String(modelId || "").trim();
  if (!id) {
    return { window: DEFAULT_CONTEXT_WINDOW, source: "default" };
  }
  if (Number.isFinite(opts.cached) && opts.cached > 0) {
    return { window: Math.round(opts.cached), source: "cache" };
  }
  const mapped = resolveContextWindow(id, "");
  if (mapped.source === "map") {
    return { window: mapped.window, source: "map", matchedKey: mapped.matchedKey };
  }
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (!fetchImpl) {
    return { window: DEFAULT_CONTEXT_WINDOW, source: "default" };
  }
  const base = String(
    opts.openrouterUrl || process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1",
  ).replace(/\/$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12000);
  try {
    const res = await fetchImpl(`${base}/models`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { window: DEFAULT_CONTEXT_WINDOW, source: "default" };
    }
    const data = await res.json();
    const list = data?.data || [];
    const hit = list.find((m) => String(m?.id || "") === id);
    const cl = Number(hit?.context_length);
    if (Number.isFinite(cl) && cl > 0) {
      return { window: Math.round(cl), source: "openrouter" };
    }
    return { window: DEFAULT_CONTEXT_WINDOW, source: "default" };
  } catch {
    return { window: DEFAULT_CONTEXT_WINDOW, source: "default" };
  } finally {
    clearTimeout(t);
  }
}

/**
 * If bindings models differ from agent health, push (Q27).
 * @param {object} [opts]
 */
export async function syncModelsIfMismatch(opts = {}) {
  const env = opts.env || process.env;
  const stateDir =
    opts.stateDir ||
    env.GLYPH_UI_STATE_DIR ||
    path.join(os.homedir(), ".glyph-ui");
  const filePath = opts.bindingsFile || bindingsPath(stateDir);
  const file = await readBindingsFile(filePath);
  if (!file.models?.shared?.primary) {
    return { ok: true, skipped: true, reason: "no_models_in_bindings" };
  }
  const agentUrl =
    String(env.GLYPH_AGENT_URL || file.settings.GLYPH_AGENT_URL || "").trim() ||
    "http://127.0.0.1:18899";
  const health =
    opts.agentHealth ||
    (await probeAgentHealth(agentUrl, { fetchImpl: opts.fetchImpl }));
  if (!health.ok) {
    return {
      ok: false,
      skipped: true,
      reason: "agent_down",
      error: health.detail,
    };
  }
  if (!modelsMismatch(file.models, health.body)) {
    // Modelle in sync — Provider-Modi trotzdem prüfen/pushen
    const provOk = await syncProviderIfMismatch(file, health.body);
    if (!provOk.skipped) {
      return {
        ok: provOk.ok,
        skipped: false,
        applied: Boolean(provOk.applied),
        error: provOk.error,
        body: provOk.body,
      };
    }
    return { ok: true, skipped: true, reason: "in_sync", health: health.body };
  }
  // Modelle weichen ab → Modelle + beide Provider-Modi pushen
  const modelPush = await pushModelsToAgent(agentUrl, file.models, {
    fetchImpl: opts.fetchImpl,
  });
  if (!modelPush.ok) {
    return {
      ok: false,
      skipped: false,
      applied: false,
      error: modelPush.error,
      body: modelPush.body,
    };
  }
  const provOk = await syncProviderIfMismatch(file, health.body);
  return {
    ok: provOk.ok && modelPush.ok,
    skipped: false,
    applied: Boolean(modelPush.applied || provOk.applied),
    error: provOk.error,
    body: provOk.body || modelPush.body,
  };
}

/**
 * Provider-Modi (agent/code) an glyph-agent pushen, wenn sie abweichen.
 * @param {{ provider?: string, codeProvider?: string }} file
 * @param {object|null|undefined} healthBody
 */
async function syncProviderIfMismatch(file, healthBody) {
  const snap = healthBody?.models || healthBody || {};
  const agentWant = normalizeProvider(file.provider || "hybrid");
  const codeWant = normalizeProvider(
    file.codeProvider || file.provider || "hybrid",
  );
  const agentHas = normalizeProvider(
    snap.provider_mode || snap.provider || "hybrid",
  );
  const codeHas = normalizeProvider(
    snap.code_provider_mode || snap.code_provider || agentHas,
  );
  if (agentWant === agentHas && codeWant === codeHas) {
    return { ok: true, skipped: true };
  }
  const env = process.env;
  const agentUrl =
    String(env.GLYPH_AGENT_URL || file.settings?.GLYPH_AGENT_URL || "").trim() ||
    "http://127.0.0.1:18899";
  const results = [];
  if (agentWant !== agentHas) {
    results.push(
      await pushProviderToAgent(agentUrl, agentWant, "agent"),
    );
  }
  if (codeWant !== codeHas) {
    results.push(
      await pushProviderToAgent(agentUrl, codeWant, "code"),
    );
  }
  const failed = results.find((r) => !r.ok);
  if (failed) return failed;
  return { ok: true, skipped: false, applied: true };
}

async function pushProviderToAgent(baseUrl, provider, kind) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, kind }),
      signal: ctrl.signal,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    if (!res.ok || body?.ok === false) {
      return { ok: false, error: body?.error || `HTTP ${res.status}` };
    }
    return { ok: true, applied: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Public status for GET /api/bindings (never includes raw secrets).
 * @param {object} [opts]
 */
export async function buildBindingsStatus(opts = {}) {
  const env = opts.env || process.env;
  const stateDir =
    opts.stateDir ||
    env.GLYPH_UI_STATE_DIR ||
    path.join(os.homedir(), ".glyph-ui");
  const filePath = opts.bindingsFile || bindingsPath(stateDir);
  const file = await readBindingsFile(filePath);
  const home = opts.home || os.homedir();
  const grokHome = env.GROK_HOME || path.join(home, ".grok");
  const authPath = path.join(grokHome, "auth.json");

  const openrouter = resolveKeySource("OPENROUTER_API_KEY", file.keys, env);
  const xai = resolveKeySource("XAI_API_KEY", file.keys, env);
  const direct = resolveKeySource("DIRECT_API_KEY", file.keys, env);

  const grokBin = resolveGrokBin(env.GROK_BIN || "grok", env);
  const oauth = await grokOAuthPresent(authPath);

  const agentUrl =
    String(env.GLYPH_AGENT_URL || file.settings.GLYPH_AGENT_URL || "").trim() ||
    "http://127.0.0.1:18899";
  const agentHealth =
    opts.agentHealth ||
    (await probeAgentHealth(agentUrl, { fetchImpl: opts.fetchImpl }));

  const grokOk = Boolean(grokBin) && oauth;
  const cloudKeyOk = direct.set || openrouter.set;
  const codeOk = cloudKeyOk && agentHealth.ok;
  // °_Agent: Tools ohne Key, Cloud-Antwort braucht Direct- oder OpenRouter-Key
  const agentOk = agentHealth.ok;

  const modelsDesired = file.models || { shared: null, code: null };
  const modelsActive = agentHealth.body?.models || null;
  const provider =
    file.provider ||
    String(env.AGENT_PRIMARY_PROVIDER || "").trim().toLowerCase() ||
    "hybrid";
  const codeProvider =
    file.codeProvider || file.provider || provider;
  const activeProvider = normalizeProvider(
    modelsActive?.provider ||
      modelsActive?.provider_mode ||
      agentHealth.body?.provider ||
      provider,
  );
  const activeCodeProvider = normalizeProvider(
    modelsActive?.code_provider ||
      modelsActive?.code_provider_mode ||
      activeProvider,
  );
  const isPeak = Boolean(modelsActive?.provider_peak);
  const mismatch =
    Boolean(modelsDesired.shared?.primary) &&
    agentHealth.ok &&
    modelsMismatch(
      { ...modelsDesired, provider },
      agentHealth.body,
    );

  // Priority matches server/voice.js: xAI → OpenRouter
  const voiceProvider = xai.set
    ? "xai"
    : oauth
      ? "xai"
      : openrouter.set
        ? "openrouter"
        : null;
  const voiceOk = Boolean(voiceProvider);
  let voiceDetail = "XAI_API_KEY oder OPENROUTER_API_KEY";
  if (xai.set) {
    voiceDetail = `xAI ${xai.masked} (${xai.source})`;
  } else if (oauth) {
    voiceDetail = "xAI via grok login (Voice-Scopes ggf. fehlend)";
  } else if (openrouter.set) {
    voiceDetail = `OpenRouter ${openrouter.masked} (${openrouter.source})`;
  }

  const voiceProfile = {
    id: "voice",
    label: "Voice",
    auth: voiceProvider === "openrouter" ? "openrouter" : "xai",
    kind: "capability",
    ok: voiceOk,
    checks: [
      {
        id: "xai",
        ok: xai.set || oauth,
        detail: xai.set
          ? `XAI_API_KEY ${xai.masked} (${xai.source}) · Primary`
          : oauth
            ? "grok login Token (Scopes ggf. dünn)"
            : "XAI_API_KEY fehlt (console.x.ai)",
      },
      {
        id: "openrouter",
        ok: openrouter.set,
        detail: openrouter.set
          ? `OPENROUTER_API_KEY ${openrouter.masked} · Fallback STT/TTS`
          : "OPENROUTER_API_KEY als Voice-Fallback (optional)",
      },
    ],
    hint: voiceOk
      ? voiceProvider === "openrouter"
        ? "Voice über OpenRouter (Whisper / TTS). xAI-Key optional für Grok-Stimmen."
        : "Voice über xAI. OpenRouter greift, wenn XAI_API_KEY fehlt."
      : "Key setzen: XAI_API_KEY (Primary) oder OPENROUTER_API_KEY (Fallback) unter Stecker · Keys.",
  };

  return {
    stateDir,
    bindingsPath: filePath,
    keys: {
      DIRECT_API_KEY: direct,
      OPENROUTER_API_KEY: openrouter,
      XAI_API_KEY: xai,
    },
    settings: {
      DIRECT_API_URL: {
        value:
          String(
            env.DIRECT_API_URL || file.settings.DIRECT_API_URL || "",
          ).trim() || "https://api.deepseek.com",
        source: env.DIRECT_API_URL
          ? file.settings.DIRECT_API_URL &&
            env.DIRECT_API_URL === file.settings.DIRECT_API_URL
            ? "bindings"
            : "env"
          : file.settings.DIRECT_API_URL
            ? "bindings"
            : "default",
      },
      GLYPH_AGENT_URL: {
        value: agentUrl,
        source: env.GLYPH_AGENT_URL
          ? file.settings.GLYPH_AGENT_URL &&
            env.GLYPH_AGENT_URL === file.settings.GLYPH_AGENT_URL
            ? "bindings"
            : "env"
          : file.settings.GLYPH_AGENT_URL
            ? "bindings"
            : "default",
      },
    },
    models: modelsDesired,
    modelsActive,
    modelsMismatch: mismatch,
    modelsApply: opts.modelsApply || null,
    provider,
    providerActive: activeProvider,
    providerPeak: isPeak,
    providerMismatch:
      agentHealth.ok &&
      providerEffective(provider, { isPeak }) !==
        providerEffective(activeProvider, { isPeak }),
    codeProvider,
    codeProviderActive: activeCodeProvider,
    codeProviderMismatch:
      agentHealth.ok &&
      providerEffective(codeProvider, { isPeak }) !==
        providerEffective(activeCodeProvider, { isPeak }),
    profiles: {
      grok: {
        id: "grok",
        label: "Grok Build",
        auth: "oauth",
        ok: grokOk,
        checks: [
          {
            id: "bin",
            ok: Boolean(grokBin),
            detail: grokBin || "grok nicht im PATH",
          },
          {
            id: "oauth",
            ok: oauth,
            detail: oauth
              ? authPath
              : `Kein Login — im Terminal: grok login (erwartet ${authPath})`,
          },
        ],
        hint: grokOk
          ? "OAuth ok — Profil Grok wählen und verbinden."
          : "CLI installieren und im Terminal `grok login` ausführen. Glyph speichert keinen OAuth-Token selbst.",
      },
      _code: {
        id: "_code",
        label: "^_Code",
        auth: "api_key",
        ok: codeOk,
        checks: [
          {
            id: "direct",
            ok: direct.set,
            detail: direct.set
              ? `DIRECT_API_KEY ${direct.masked} (${direct.source})`
              : "DIRECT_API_KEY fehlt (Direct-Hop)",
          },
          {
            id: "openrouter",
            ok: openrouter.set,
            detail: openrouter.set
              ? `OPENROUTER_API_KEY ${openrouter.masked} (${openrouter.source}) · Fallback`
              : "OPENROUTER_API_KEY als Fallback (optional)",
          },
          {
            id: "agent_service",
            ok: agentHealth.ok,
            detail: agentHealth.ok
              ? `${agentHealth.url} · ${agentHealth.detail}`
              : `${agentHealth.url} · ${agentHealth.detail}`,
          },
        ],
        hint: "Direct-Key (DeepSeek/Grok/…) + laufender glyph-agent. OpenRouter nur Fallback.",
      },
      "glyph-agent": {
        id: "glyph-agent",
        label: "°_Agent",
        auth: "api_key",
        ok: agentOk && cloudKeyOk,
        checks: [
          {
            id: "agent_service",
            ok: agentHealth.ok,
            detail: agentHealth.ok
              ? `${agentHealth.url} · ${agentHealth.detail}`
              : `${agentHealth.url} · ${agentHealth.detail}`,
          },
          {
            id: "direct",
            ok: direct.set,
            detail: direct.set
              ? `Direct ${direct.masked} (${direct.source})`
              : "DIRECT_API_KEY für Cloud-Antwort (Anbindung)",
          },
          {
            id: "openrouter",
            ok: openrouter.set,
            detail: openrouter.set
              ? `OpenRouter-Fallback ${openrouter.masked}`
              : "OPENROUTER_API_KEY als Fallback",
          },
        ],
        hint: "Engine: glyph-agent :18899 · Direct-Key für Cloud-Antwort, OpenRouter nur Fallback.",
      },
      voice: voiceProfile,
    },
    voice: {
      ok: voiceOk,
      provider: voiceProvider,
      detail: voiceDetail,
    },
  };
}

/**
 * Merge UI patch into file + env.
 * Empty string clears a key/setting.
 * Patch may include `models: { shared, code }` (code null clears override).
 * @param {Record<string, unknown>} patch
 * @param {object} [opts]
 */
export async function updateBindings(patch, opts = {}) {
  const env = opts.env || process.env;
  const stateDir =
    opts.stateDir ||
    env.GLYPH_UI_STATE_DIR ||
    path.join(os.homedir(), ".glyph-ui");
  const filePath = opts.bindingsFile || bindingsPath(stateDir);
  const current = await readBindingsFile(filePath);
  const next = {
    keys: { ...current.keys },
    settings: { ...current.settings },
    models: {
      shared: current.models?.shared ? { ...current.models.shared } : null,
      code: current.models?.code ? { ...current.models.code } : null,
    },
    provider: current.provider || "hybrid",
    codeProvider: current.codeProvider || current.provider || "hybrid",
  };

  const body = patch && typeof patch === "object" ? patch : {};
  if (Object.prototype.hasOwnProperty.call(body, "provider")) {
    const mode = normalizeProvider(body.provider);
    const kind = String(body.kind || "agent").toLowerCase();
    if (kind === "code") {
      next.codeProvider = mode;
    } else {
      next.provider = mode;
    }
  }
  for (const id of BINDING_KEY_IDS) {
    if (!Object.prototype.hasOwnProperty.call(body, id)) continue;
    const raw = body[id];
    if (raw == null || String(raw).trim() === "") {
      delete next.keys[id];
    } else {
      next.keys[id] = String(raw).trim();
    }
  }
  for (const id of BINDING_SETTING_IDS) {
    if (!Object.prototype.hasOwnProperty.call(body, id)) continue;
    const raw = body[id];
    if (raw == null || String(raw).trim() === "") {
      delete next.settings[id];
    } else {
      next.settings[id] = String(raw).trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "models")) {
    const m = body.models;
    if (m == null) {
      next.models = { shared: null, code: null };
    } else if (typeof m === "object") {
      if (Object.prototype.hasOwnProperty.call(m, "shared")) {
        next.models.shared = normalizeModelPair(m.shared);
      }
      if (Object.prototype.hasOwnProperty.call(m, "code")) {
        // null / empty primary clears code override
        next.models.code = normalizeModelPair(m.code);
      }
    }
  }

  await writeBindingsFile(next, filePath);

  // Apply with overwrite so clears work; for keys not in patch leave env alone.
  // Build a full apply set: for each known id, if in next use it, if cleared remove.
  const applyKeys = {};
  const applySettings = {};
  for (const id of BINDING_KEY_IDS) {
    if (Object.prototype.hasOwnProperty.call(body, id)) {
      applyKeys[id] = next.keys[id] || "";
    }
  }
  for (const id of BINDING_SETTING_IDS) {
    if (Object.prototype.hasOwnProperty.call(body, id)) {
      applySettings[id] = next.settings[id] || "";
    }
  }
  applyBindingsToEnv(
    { keys: applyKeys, settings: applySettings },
    { overwrite: true, env },
  );

  return next;
}
