/**
 * Public web surface: glyph-ui.com is Sitz `web`, °_Agent only.
 * Admin (Grok Build / ^_Code) stays on loopback.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

export const WEB_SEAT = "web";
export const WEB_AGENT_ID = "glyph-agent";
export const WEB_COOKIE = "glyph_web";

const DEFAULT_WEB_HOSTS = ["glyph-ui.com", "www.glyph-ui.com"];

export function normalizeHostname(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .split(",")[0]
    .trim()
    .split(":")[0]
    .replace(/\.$/, "");
}

export function extraWebHosts(raw = process.env.GLYPH_WEB_HOSTS) {
  return String(raw || "")
    .split(",")
    .map((s) => normalizeHostname(s))
    .filter(Boolean);
}

export function isWebHostname(host, extra = process.env.GLYPH_WEB_HOSTS) {
  const h = normalizeHostname(host);
  if (!h) return false;
  if (DEFAULT_WEB_HOSTS.includes(h)) return true;
  return extraWebHosts(extra).includes(h);
}

export function requestHostname(req) {
  const xf = String(req?.get?.("x-forwarded-host") || req?.headers?.["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = xf || String(req?.get?.("host") || req?.headers?.host || "");
  return normalizeHostname(host);
}

export function isWebRequest(req) {
  return isWebHostname(requestHostname(req));
}

export function defaultAgentIdForSeat(seat, envAgent) {
  const s = String(seat || "").trim().toLowerCase();
  if (s === WEB_SEAT || s.startsWith(`${WEB_SEAT}:`)) return WEB_AGENT_ID;
  const id = String(envAgent || "").trim();
  return id || "grok";
}

export function agentAllowedOnSeat(seat, agentId) {
  // web:<token>-Seats (Geräte-Sessions) sind Web-Surface → nur °_Agent.
  const s = String(seat || "").trim().toLowerCase();
  if (s !== WEB_SEAT && !s.startsWith(`${WEB_SEAT}:`)) return true;
  const id = String(agentId || "");
  return id === WEB_AGENT_ID || id === "agent";
}

export function parseCookie(header, name) {
  const raw = String(header || "");
  if (!raw || !name) return "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k !== name) continue;
    try {
      return decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      return part.slice(i + 1).trim();
    }
  }
  return "";
}

const WEB_ADMIN_PREFIXES = [
  "/api/bindings",
  "/api/models",
  "/api/code/",
  "/api/wiki/open",
  "/api/workspace/open",
  "/api/activity",
  "/api/recurring",
  "/api/voice",
  "/api/tts",
];

/** Grok-disk / admin routes the Web-Fläche must not reach. */
export function isWebAdminApi(path) {
  const p = String(path || "").split("?")[0];
  for (const prefix of WEB_ADMIN_PREFIXES) {
    if (p === prefix || p.startsWith(prefix)) return true;
  }
  if (p === "/api/sessions" || p.startsWith("/api/sessions/cleanup")) return true;
  if (/^\/api\/sessions\/[^/]+$/.test(p)) return true;
  if (/^\/api\/sessions\/[^/]+\/(open|close)$/.test(p)) return true;
  return false;
}

/**
 * New password for the Web-Tor. Caller still checks the current password.
 * @returns {{ ok: true, password: string } | { ok: false, error: string }}
 */
export function validateNewWebPassword(next, current) {
  const n = String(next ?? "");
  if (!n) return { ok: false, error: "Neues Passwort fehlt" };
  if (n !== n.trim()) {
    return { ok: false, error: "Kein Leerzeichen am Rand" };
  }
  if (n.length < 8) return { ok: false, error: "Mindestens 8 Zeichen" };
  if (n.length > 200) return { ok: false, error: "Zu lang (max. 200)" };
  if (current != null && n === String(current)) {
    return { ok: false, error: "Neues Passwort ist gleich dem alten" };
  }
  return { ok: true, password: n };
}

export function isWebGateExempt(req) {
  const method = String(req?.method || "GET").toUpperCase();
  const path = String(req?.path || req?.url || "").split("?")[0];
  if (path === "/api/web-gate") return method === "GET" || method === "POST";
  if (path.startsWith("/api") || path.startsWith("/ws") || path.startsWith("/docs")) {
    return false;
  }
  return true;
}

/**
 * HTTPS origin for the public web hosts (exact hostname, port 443 omitted).
 * Rejects substring tricks like glyph-ui.com.evil.example.
 */
export function isWebOrigin(origin, extra = process.env.GLYPH_WEB_HOSTS) {
  if (!origin) return false;
  try {
    const u = new URL(String(origin));
    if (u.protocol !== "https:") return false;
    if (u.port && u.port !== "443") return false;
    return isWebHostname(u.hostname, extra);
  } catch {
    return false;
  }
}

/** Cookie Max-Age (30 Tage). Sitzungen auf Disk nutzen dasselbe Fenster. */
export const WEB_SESSION_TTL_S = 2592000;
/** Harte Kappe, damit die Datei nicht unbegrenzt wächst. */
export const WEB_SESSIONS_MAX = 40;

/**
 * Lesbare Sitzungsliste aus web-sessions.json.
 * Akzeptiert `{tokens:[{token,iat}]}` oder ein nacktes Array.
 */
export function parseStoredWebSessions(raw, now = Date.now()) {
  const ttlMs = WEB_SESSION_TTL_S * 1000;
  let list = [];
  if (Array.isArray(raw?.tokens)) list = raw.tokens;
  else if (Array.isArray(raw)) list = raw;
  const out = [];
  const seen = new Set();
  for (const row of list) {
    const token = typeof row === "string" ? row : String(row?.token || "");
    if (!token || seen.has(token)) continue;
    const iat = typeof row === "string" ? now : Number(row?.iat);
    const issued = Number.isFinite(iat) && iat > 0 ? iat : now;
    if (now - issued >= ttlMs) continue;
    seen.add(token);
    out.push({ token, iat: issued });
  }
  if (out.length > WEB_SESSIONS_MAX) {
    out.sort((a, b) => b.iat - a.iat);
    return out.slice(0, WEB_SESSIONS_MAX);
  }
  return out;
}

export function serializeWebSessions(entries) {
  const tokens = Array.isArray(entries) ? entries : [];
  return `${JSON.stringify({ tokens }, null, 2)}\n`;
}
