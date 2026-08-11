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
export const BINDING_KEY_IDS = ["OPENROUTER_API_KEY", "XAI_API_KEY"];

/** Optional non-secret settings. */
export const BINDING_SETTING_IDS = ["GLYPH_AGENT_URL"];

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
  return { keys, settings, models };
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
    return { keys: {}, settings: {}, models: { shared: null, code: null } };
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
export async function pushModelsToAgent(baseUrl, models, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const payload = modelsToAgentPayload(models);
  if (!payload) {
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
    return { ok: true, skipped: true, reason: "in_sync", health: health.body };
  }
  const push = await pushModelsToAgent(agentUrl, file.models, {
    fetchImpl: opts.fetchImpl,
  });
  return {
    ok: push.ok,
    skipped: false,
    applied: Boolean(push.applied),
    error: push.error,
    body: push.body,
  };
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

  const grokBin = resolveGrokBin(env.GROK_BIN || "grok", env);
  const oauth = await grokOAuthPresent(authPath);

  const agentUrl =
    String(env.GLYPH_AGENT_URL || file.settings.GLYPH_AGENT_URL || "").trim() ||
    "http://127.0.0.1:18899";
  const agentHealth =
    opts.agentHealth ||
    (await probeAgentHealth(agentUrl, { fetchImpl: opts.fetchImpl }));

  const grokOk = Boolean(grokBin) && oauth;
  const codeOk = openrouter.set && agentHealth.ok;
  // °_Agent can run tools without OpenRouter for some paths, but Cloud-Antwort needs key
  const agentOk = agentHealth.ok;

  const modelsDesired = file.models || { shared: null, code: null };
  const modelsActive = agentHealth.body?.models || null;
  const mismatch =
    Boolean(modelsDesired.shared?.primary) &&
    agentHealth.ok &&
    modelsMismatch(modelsDesired, agentHealth.body);

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
      OPENROUTER_API_KEY: openrouter,
      XAI_API_KEY: xai,
    },
    settings: {
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
    profiles: {
      grok: {
        id: "grok",
        label: "Grok",
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
            id: "openrouter",
            ok: openrouter.set,
            detail: openrouter.set
              ? `OPENROUTER_API_KEY ${openrouter.masked} (${openrouter.source})`
              : "OPENROUTER_API_KEY fehlt (openrouter.ai)",
          },
          {
            id: "agent_service",
            ok: agentHealth.ok,
            detail: agentHealth.ok
              ? `${agentHealth.url} · ${agentHealth.detail}`
              : `${agentHealth.url} · ${agentHealth.detail}`,
          },
        ],
        hint: "Braucht OpenRouter-Key + laufenden glyph-agent (python server.py :18899).",
      },
      "glyph-agent": {
        id: "glyph-agent",
        label: "°_Agent",
        auth: "api_key",
        ok: agentOk && openrouter.set,
        checks: [
          {
            id: "agent_service",
            ok: agentHealth.ok,
            detail: agentHealth.ok
              ? `${agentHealth.url} · ${agentHealth.detail}`
              : `${agentHealth.url} · ${agentHealth.detail}`,
          },
          {
            id: "openrouter",
            ok: openrouter.set,
            detail: openrouter.set
              ? `Cloud-Antwort ${openrouter.masked}`
              : "OPENROUTER_API_KEY für Cloud-Antwort (optional nur Tools, ohne Key oft dünn)",
          },
        ],
        hint: "Engine: cd ~/glyph-agent && python server.py · Key für Cloud-Antwort.",
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
  };

  const body = patch && typeof patch === "object" ? patch : {};
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
