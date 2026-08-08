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
 * @param {unknown} raw
 * @returns {{ keys: Record<string, string>, settings: Record<string, string> }}
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
  return { keys, settings };
}

/**
 * @param {string} [filePath]
 * @returns {Promise<{ keys: Record<string, string>, settings: Record<string, string> }>}
 */
export async function readBindingsFile(filePath = bindingsPath()) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeBindingsFile(JSON.parse(raw));
  } catch {
    return { keys: {}, settings: {} };
  }
}

/**
 * @param {{ keys?: Record<string, string>, settings?: Record<string, string> }} data
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
    return { ok: false, url, detail: "fetch unavailable" };
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
      detail: ok
        ? body?.status || body?.ok || "ok"
        : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      url,
      detail: err instanceof Error ? err.message : String(err),
    };
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
    },
    voice: {
      ok: xai.set || oauth,
      detail: xai.set
        ? `XAI_API_KEY ${xai.masked} (${xai.source})`
        : oauth
          ? "Fallback: grok login Token (Voice-Scopes ggf. fehlend)"
          : "XAI_API_KEY (console.x.ai) oder grok login",
    },
  };
}

/**
 * Merge UI patch into file + env.
 * Empty string clears a key/setting.
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
