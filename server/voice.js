/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * Voice API proxy: xAI primary, OpenRouter fallback.
 *
 * xAI:
 *   STT POST https://api.x.ai/v1/stt
 *   TTS POST https://api.x.ai/v1/tts
 *
 * OpenRouter (same OPENROUTER_API_KEY as chat):
 *   STT POST https://openrouter.ai/api/v1/audio/transcriptions
 *   TTS POST https://openrouter.ai/api/v1/audio/speech
 *
 * Provider resolution (first hit wins):
 *   1. XAI_API_KEY / GROK_API_KEY / ~/.grok/auth.json → xai
 *   2. OPENROUTER_API_KEY → openrouter
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const XAI_BASE = "https://api.x.ai/v1";
const OR_BASE = "https://openrouter.ai/api/v1";
const GROK_HOME = process.env.GROK_HOME || path.join(os.homedir(), ".grok");
const AUTH_PATH = path.join(GROK_HOME, "auth.json");

const DEFAULT_VOICE = process.env.GROK_TTS_VOICE || "eve";
const DEFAULT_STT_LANG = process.env.GROK_STT_LANGUAGE || "de";
const DEFAULT_TTS_LANG = process.env.GROK_TTS_LANGUAGE || "de";

const OR_STT_MODEL =
  process.env.OPENROUTER_STT_MODEL || "openai/whisper-1";
const OR_TTS_MODEL =
  process.env.OPENROUTER_TTS_MODEL || "openai/gpt-4o-mini-tts-2025-12-15";
const OR_DEFAULT_VOICE = process.env.OPENROUTER_TTS_VOICE || "alloy";

const XAI_VOICES = [
  { voice_id: "eve", name: "Eve" },
  { voice_id: "ara", name: "Ara" },
  { voice_id: "rex", name: "Rex" },
  { voice_id: "sal", name: "Sal" },
  { voice_id: "leo", name: "Leo" },
];

const OR_VOICES = [
  { voice_id: "alloy", name: "Alloy" },
  { voice_id: "echo", name: "Echo" },
  { voice_id: "fable", name: "Fable" },
  { voice_id: "onyx", name: "Onyx" },
  { voice_id: "nova", name: "Nova" },
  { voice_id: "shimmer", name: "Shimmer" },
];

/** @type {{ key: string, source: string, provider: "xai" | "openrouter" } | null} */
let cachedAuth = null;

export function clearApiKeyCache() {
  cachedAuth = null;
}

/**
 * @returns {Promise<{ key: string, source: string, provider: "xai" | "openrouter" } | null>}
 */
export async function resolveVoiceAuth() {
  if (cachedAuth?.key) return cachedAuth;

  const xaiEnv =
    (process.env.XAI_API_KEY || "").trim() ||
    (process.env.GROK_API_KEY || "").trim();
  if (xaiEnv) {
    cachedAuth = {
      key: xaiEnv,
      source: process.env.XAI_API_KEY ? "XAI_API_KEY" : "GROK_API_KEY",
      provider: "xai",
    };
    return cachedAuth;
  }

  try {
    const raw = await fs.readFile(AUTH_PATH, "utf8");
    const data = JSON.parse(raw);
    for (const val of Object.values(data || {})) {
      if (
        val &&
        typeof val === "object" &&
        typeof val.key === "string" &&
        val.key.length > 20
      ) {
        cachedAuth = {
          key: val.key,
          source: "grok-auth.json",
          provider: "xai",
        };
        return cachedAuth;
      }
    }
  } catch {
    /* no auth file */
  }

  const orKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (orKey) {
    cachedAuth = {
      key: orKey,
      source: "OPENROUTER_API_KEY",
      provider: "openrouter",
    };
    return cachedAuth;
  }

  return null;
}

/** @deprecated use resolveVoiceAuth */
export async function resolveApiKey() {
  const auth = await resolveVoiceAuth();
  if (!auth) return null;
  return { key: auth.key, source: auth.source };
}

/**
 * @returns {Promise<{
 *   available: boolean,
 *   provider: "xai" | "openrouter" | null,
 *   source: string | null,
 *   defaults: object,
 *   hint?: string
 * }>}
 */
export async function voiceStatus() {
  const auth = await resolveVoiceAuth();
  const provider = auth?.provider || null;
  return {
    available: Boolean(auth?.key),
    provider,
    source: auth?.source || null,
    defaults: {
      voiceId: provider === "openrouter" ? OR_DEFAULT_VOICE : DEFAULT_VOICE,
      sttLanguage: DEFAULT_STT_LANG,
      ttsLanguage: DEFAULT_TTS_LANG,
      sttModel: provider === "openrouter" ? OR_STT_MODEL : null,
      ttsModel: provider === "openrouter" ? OR_TTS_MODEL : null,
    },
    hint: auth?.key
      ? null
      : "Kein Voice-Key. XAI_API_KEY (console.x.ai) oder OPENROUTER_API_KEY (openrouter.ai) setzen.",
  };
}

/**
 * @param {string} mimeType
 * @param {string} [filename]
 */
function audioFilename(mimeType, filename) {
  if (filename) return filename;
  if (mimeType.includes("wav")) return "audio.wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "audio.m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "audio.mp3";
  if (mimeType.includes("ogg")) return "audio.ogg";
  if (mimeType.includes("flac")) return "audio.flac";
  return "audio.webm";
}

/**
 * @param {string} mimeType
 * @param {string} filename
 */
function audioFormatFrom(mimeType, filename) {
  const name = (filename || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  if (name.endsWith(".wav") || mime.includes("wav")) return "wav";
  if (name.endsWith(".mp3") || mime.includes("mpeg") || mime.includes("mp3"))
    return "mp3";
  if (name.endsWith(".flac") || mime.includes("flac")) return "flac";
  if (name.endsWith(".m4a") || mime.includes("m4a") || mime.includes("mp4"))
    return "m4a";
  if (name.endsWith(".ogg") || mime.includes("ogg")) return "ogg";
  if (name.endsWith(".webm") || mime.includes("webm")) return "webm";
  if (name.endsWith(".aac") || mime.includes("aac")) return "aac";
  return "webm";
}

/**
 * @param {Buffer} audioBuffer
 * @param {{ filename?: string, mimeType?: string, language?: string }} opts
 */
export async function speechToText(audioBuffer, opts = {}) {
  const auth = await resolveVoiceAuth();
  if (!auth?.key) {
    const err = new Error(
      "Kein Voice-Key — XAI_API_KEY oder OPENROUTER_API_KEY setzen",
    );
    err.status = 503;
    throw err;
  }

  if (auth.provider === "openrouter") {
    return speechToTextOpenRouter(audioBuffer, opts, auth);
  }
  return speechToTextXai(audioBuffer, opts, auth);
}

/**
 * @param {Buffer} audioBuffer
 * @param {{ filename?: string, mimeType?: string, language?: string }} opts
 * @param {{ key: string, source: string }} auth
 */
async function speechToTextXai(audioBuffer, opts, auth) {
  const language = opts.language || DEFAULT_STT_LANG;
  const mimeType = opts.mimeType || "audio/webm";
  const filename = audioFilename(mimeType, opts.filename);

  const form = new FormData();
  form.append("format", "true");
  if (language) form.append("language", language);
  form.append(
    "file",
    new Blob([audioBuffer], { type: mimeType }),
    filename,
  );

  const res = await fetch(`${XAI_BASE}/stt`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.key}`,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      mapVoiceError(res.status, body, "STT", "xai") ||
        `STT fehlgeschlagen (${res.status})`,
    );
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.detail = body.slice(0, 500);
    throw err;
  }

  const json = await res.json();
  return {
    text: String(json.text || "").trim(),
    language: json.language || language,
    duration: json.duration ?? null,
    words: json.words || [],
    provider: "xai",
  };
}

/**
 * @param {Buffer} audioBuffer
 * @param {{ filename?: string, mimeType?: string, language?: string }} opts
 * @param {{ key: string, source: string }} auth
 */
async function speechToTextOpenRouter(audioBuffer, opts, auth) {
  const language = opts.language || DEFAULT_STT_LANG;
  const mimeType = opts.mimeType || "audio/webm";
  const filename = audioFilename(mimeType, opts.filename);
  const format = audioFormatFrom(mimeType, filename);

  const payload = {
    model: OR_STT_MODEL,
    input_audio: {
      data: Buffer.from(audioBuffer).toString("base64"),
      format,
    },
  };
  if (language) payload.language = language;

  const res = await fetch(`${OR_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://glyph-ui.local",
      "X-Title": "Glyph UI",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      mapVoiceError(res.status, body, "STT", "openrouter") ||
        `STT (OpenRouter) fehlgeschlagen (${res.status})`,
    );
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.detail = body.slice(0, 500);
    throw err;
  }

  const json = await res.json();
  return {
    text: String(json.text || "").trim(),
    language: language,
    duration: json.usage?.seconds ?? null,
    words: [],
    provider: "openrouter",
  };
}

/**
 * @param {string} text
 * @param {{ voiceId?: string, language?: string, speed?: number }} opts
 * @returns {Promise<{ buffer: Buffer, contentType: string, provider?: string }>}
 */
export async function textToSpeech(text, opts = {}) {
  const auth = await resolveVoiceAuth();
  if (!auth?.key) {
    const err = new Error(
      "Kein Voice-Key — XAI_API_KEY oder OPENROUTER_API_KEY setzen",
    );
    err.status = 503;
    throw err;
  }

  const clean = String(text || "").trim();
  if (!clean) {
    const err = new Error("Kein Text für TTS");
    err.status = 400;
    throw err;
  }

  if (auth.provider === "openrouter") {
    return textToSpeechOpenRouter(clean, opts, auth);
  }
  return textToSpeechXai(clean, opts, auth);
}

/**
 * @param {string} clean
 * @param {{ voiceId?: string, language?: string, speed?: number }} opts
 * @param {{ key: string, source: string }} auth
 */
async function textToSpeechXai(clean, opts, auth) {
  const clipped = clean.length > 14_500 ? `${clean.slice(0, 14_500)}…` : clean;

  const payload = {
    text: clipped,
    voice_id: opts.voiceId || DEFAULT_VOICE,
    language: opts.language || DEFAULT_TTS_LANG,
    output_format: {
      codec: "mp3",
      sample_rate: 24000,
      bit_rate: 128000,
    },
  };
  if (opts.speed != null && Number.isFinite(Number(opts.speed))) {
    payload.speed = Math.min(1.5, Math.max(0.7, Number(opts.speed)));
  }

  const res = await fetch(`${XAI_BASE}/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      mapVoiceError(res.status, body, "TTS", "xai") ||
        `TTS fehlgeschlagen (${res.status})`,
    );
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.detail = body.slice(0, 500);
    throw err;
  }

  const ab = await res.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    contentType: res.headers.get("content-type") || "audio/mpeg",
    provider: "xai",
  };
}

/**
 * Map xAI-style voice ids to OpenAI-compatible names when needed.
 * @param {string | undefined} voiceId
 */
function resolveOpenRouterVoice(voiceId) {
  const id = String(voiceId || OR_DEFAULT_VOICE).toLowerCase();
  if (OR_VOICES.some((v) => v.voice_id === id)) return id;
  // xAI defaults → nearest OR voice
  const map = {
    eve: "nova",
    ara: "alloy",
    rex: "onyx",
    sal: "shimmer",
    leo: "echo",
  };
  return map[id] || OR_DEFAULT_VOICE;
}

/**
 * @param {string} clean
 * @param {{ voiceId?: string, language?: string, speed?: number }} opts
 * @param {{ key: string, source: string }} auth
 */
async function textToSpeechOpenRouter(clean, opts, auth) {
  const clipped = clean.length > 14_500 ? `${clean.slice(0, 14_500)}…` : clean;

  const payload = {
    model: OR_TTS_MODEL,
    input: clipped,
    voice: resolveOpenRouterVoice(opts.voiceId),
    response_format: "mp3",
  };
  if (opts.speed != null && Number.isFinite(Number(opts.speed))) {
    payload.speed = Math.min(1.5, Math.max(0.7, Number(opts.speed)));
  }

  const res = await fetch(`${OR_BASE}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://glyph-ui.local",
      "X-Title": "Glyph UI",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      mapVoiceError(res.status, body, "TTS", "openrouter") ||
        `TTS (OpenRouter) fehlgeschlagen (${res.status})`,
    );
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.detail = body.slice(0, 500);
    throw err;
  }

  const ab = await res.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    contentType: res.headers.get("content-type") || "audio/mpeg",
    provider: "openrouter",
  };
}

/**
 * @returns {Promise<{ voices: Array<{ voice_id: string, name?: string }>, provider?: string, fallback?: boolean }>}
 */
export async function listVoices() {
  const auth = await resolveVoiceAuth();
  if (!auth?.key) {
    const err = new Error(
      "Kein Voice-Key — XAI_API_KEY oder OPENROUTER_API_KEY setzen",
    );
    err.status = 503;
    throw err;
  }

  if (auth.provider === "openrouter") {
    return { voices: OR_VOICES, provider: "openrouter" };
  }

  const res = await fetch(`${XAI_BASE}/tts/voices`, {
    headers: { Authorization: `Bearer ${auth.key}` },
  });

  if (!res.ok) {
    if (res.status === 404 || res.status >= 500) {
      return { voices: XAI_VOICES, fallback: true, provider: "xai" };
    }
    const body = await res.text().catch(() => "");
    const err = new Error(
      mapVoiceError(res.status, body, "Voices", "xai") ||
        `Stimmen laden fehlgeschlagen (${res.status})`,
    );
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  return {
    voices: Array.isArray(json.voices) ? json.voices : XAI_VOICES,
    provider: "xai",
  };
}

/**
 * @param {number} status
 * @param {string} body
 * @param {string} kind
 * @param {"xai" | "openrouter"} [provider]
 */
function mapVoiceError(status, body, kind, provider = "xai") {
  const lower = String(body || "").toLowerCase();
  if (status === 401 || status === 403) {
    if (
      status === 403 &&
      (lower.includes("credits") ||
        lower.includes("spending limit") ||
        lower.includes("billing") ||
        lower.includes("payment"))
    ) {
      const where =
        provider === "openrouter" ? "openrouter.ai (Credits)" : "console.x.ai (Billing)";
      return `${kind}: Konto ohne Guthaben oder Spending-Limit. ${where}. Key selbst kann gültig sein.`;
    }
    if (provider === "xai" && cachedAuth?.source === "grok-auth.json") {
      return `${kind}: Login-Token hat keine Voice-Rechte. XAI_API_KEY setzen oder OPENROUTER_API_KEY als Fallback.`;
    }
    return `${kind}: API-Key ungültig oder ohne Voice-Zugriff.`;
  }
  if (status === 429)
    return `${kind}: Rate-Limit — kurz warten und erneut versuchen.`;
  if (status === 413) return `${kind}: Audio/Text zu groß.`;
  if (status === 400 && lower.includes("language")) {
    return `${kind}: Sprache ungültig.`;
  }
  try {
    const j = JSON.parse(body);
    if (j.error?.message) return `${kind}: ${j.error.message}`;
    if (typeof j.error === "string") return `${kind}: ${j.error}`;
    if (j.message) return `${kind}: ${j.message}`;
  } catch {
    /* raw */
  }
  if (body && body.length < 200) return `${kind}: ${body}`;
  return null;
}
