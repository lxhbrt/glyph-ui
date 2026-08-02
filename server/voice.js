/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * Grok / xAI Voice API proxy helpers.
 * STT: POST https://api.x.ai/v1/stt
 * TTS: POST https://api.x.ai/v1/tts
 *
 * API key resolution (first hit wins):
 *   1. process.env.XAI_API_KEY
 *   2. process.env.GROK_API_KEY
 *   3. ~/.grok/auth.json OIDC access token (may lack Voice scopes)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const XAI_BASE = "https://api.x.ai/v1";
const GROK_HOME = process.env.GROK_HOME || path.join(os.homedir(), ".grok");
const AUTH_PATH = path.join(GROK_HOME, "auth.json");

const DEFAULT_VOICE = process.env.GROK_TTS_VOICE || "eve";
const DEFAULT_STT_LANG = process.env.GROK_STT_LANGUAGE || "de";
const DEFAULT_TTS_LANG = process.env.GROK_TTS_LANGUAGE || "de";

/** @type {{ key: string, source: string } | null} */
let cachedKey = null;

export function clearApiKeyCache() {
  cachedKey = null;
}

/**
 * @returns {Promise<{ key: string, source: string } | null>}
 */
export async function resolveApiKey() {
  if (cachedKey?.key) return cachedKey;

  const fromEnv =
    (process.env.XAI_API_KEY || "").trim() ||
    (process.env.GROK_API_KEY || "").trim();
  if (fromEnv) {
    cachedKey = {
      key: fromEnv,
      source: process.env.XAI_API_KEY ? "XAI_API_KEY" : "GROK_API_KEY",
    };
    return cachedKey;
  }

  try {
    const raw = await fs.readFile(AUTH_PATH, "utf8");
    const data = JSON.parse(raw);
    for (const val of Object.values(data || {})) {
      if (val && typeof val === "object" && typeof val.key === "string" && val.key.length > 20) {
        cachedKey = { key: val.key, source: "grok-auth.json" };
        return cachedKey;
      }
    }
  } catch {
    /* no auth file */
  }

  return null;
}

/**
 * @returns {Promise<{ available: boolean, source: string | null, defaults: object, hint?: string }>}
 */
export async function voiceStatus() {
  const auth = await resolveApiKey();
  return {
    available: Boolean(auth?.key),
    source: auth?.source || null,
    defaults: {
      voiceId: DEFAULT_VOICE,
      sttLanguage: DEFAULT_STT_LANG,
      ttsLanguage: DEFAULT_TTS_LANG,
    },
    hint: auth?.key
      ? null
      : "Kein API-Key. Setze XAI_API_KEY (Console: https://console.x.ai) oder nutze grok login.",
  };
}

/**
 * @param {Buffer} audioBuffer
 * @param {{ filename?: string, mimeType?: string, language?: string }} opts
 */
export async function speechToText(audioBuffer, opts = {}) {
  const auth = await resolveApiKey();
  if (!auth?.key) {
    const err = new Error(
      "Kein XAI_API_KEY — Voice-STT braucht einen API-Key von console.x.ai",
    );
    err.status = 503;
    throw err;
  }

  const language = opts.language || DEFAULT_STT_LANG;
  const mimeType = opts.mimeType || "audio/webm";
  const filename =
    opts.filename ||
    (mimeType.includes("wav")
      ? "audio.wav"
      : mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "audio.m4a"
        : mimeType.includes("mpeg") || mimeType.includes("mp3")
          ? "audio.mp3"
          : mimeType.includes("ogg")
            ? "audio.ogg"
            : "audio.webm");

  const form = new FormData();
  // Fields before file (xAI STT requirement)
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
      mapVoiceError(res.status, body, "STT") ||
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
  };
}

/**
 * @param {string} text
 * @param {{ voiceId?: string, language?: string, speed?: number }} opts
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export async function textToSpeech(text, opts = {}) {
  const auth = await resolveApiKey();
  if (!auth?.key) {
    const err = new Error(
      "Kein XAI_API_KEY — Voice-TTS braucht einen API-Key von console.x.ai",
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
  // Unary TTS max 15_000 chars — trim safely for chat use
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
      mapVoiceError(res.status, body, "TTS") ||
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
  };
}

/**
 * @returns {Promise<{ voices: Array<{ voice_id: string, name?: string }> }>}
 */
export async function listVoices() {
  const auth = await resolveApiKey();
  if (!auth?.key) {
    const err = new Error("Kein XAI_API_KEY");
    err.status = 503;
    throw err;
  }

  const res = await fetch(`${XAI_BASE}/tts/voices`, {
    headers: { Authorization: `Bearer ${auth.key}` },
  });

  if (!res.ok) {
    // Fallback built-in list if endpoint fails
    if (res.status === 404 || res.status >= 500) {
      return {
        voices: [
          { voice_id: "eve", name: "Eve" },
          { voice_id: "ara", name: "Ara" },
          { voice_id: "rex", name: "Rex" },
          { voice_id: "sal", name: "Sal" },
          { voice_id: "leo", name: "Leo" },
        ],
        fallback: true,
      };
    }
    const body = await res.text().catch(() => "");
    const err = new Error(
      mapVoiceError(res.status, body, "Voices") ||
        `Stimmen laden fehlgeschlagen (${res.status})`,
    );
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  return {
    voices: Array.isArray(json.voices) ? json.voices : [],
  };
}

function mapVoiceError(status, body, kind) {
  const lower = String(body || "").toLowerCase();
  if (status === 401 || status === 403) {
    // 403 mit Kredit-/Limit-Hinweis ist KEIN Key-Problem:
    // xAI lehnt ab, weil das Konto kein Guthaben hat oder das
    // monatliche Spending-Limit erreicht ist (console.x.ai → Billing).
    if (status === 403 && (lower.includes("credits") || lower.includes("spending limit") || lower.includes("billing") || lower.includes("payment"))) {
      return `${kind}: xAI-Konto ohne Guthaben oder Spending-Limit erreicht. Lade Guthaben auf oder erhöhe das Limit in console.x.ai (Billing). Der Key selbst ist gültig.`;
    }
    if (cachedKey?.source === "grok-auth.json") {
      return `${kind}: Login-Token hat keine Voice-Rechte. Setze XAI_API_KEY aus der Console (console.x.ai).`;
    }
    return `${kind}: API-Key ungültig oder ohne Voice-Zugriff.`;
  }
  if (status === 429) return `${kind}: Rate-Limit — kurz warten und erneut versuchen.`;
  if (status === 413) return `${kind}: Audio/Text zu groß.`;
  if (status === 400 && lower.includes("language")) {
    return `${kind}: Sprache ungültig.`;
  }
  try {
    const j = JSON.parse(body);
    if (j.error?.message) return `${kind}: ${j.error.message}`;
    if (j.message) return `${kind}: ${j.message}`;
  } catch {
    /* raw */
  }
  if (body && body.length < 200) return `${kind}: ${body}`;
  return null;
}
