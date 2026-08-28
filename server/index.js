/**
 * Glyph UI — bridge (Build Term for Grok via ACP):
 *   Browser  ←WebSocket→  this server  ←ACP stdio→  `grok agent`
 *
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 *
 * Browser events (JSON):
 *   { type: "chat", text: "...", attachments?: AttachmentMeta[],
 *     vaultSearch?: boolean, vaultSelected?: VaultHit[] }
 *   { type: "deep_search", text: "...", attachments?: AttachmentMeta[] }
 *   { type: "fork", text?: "..." }        // ACP session/fork (+ optional directive)
 *   { type: "rewind", dropUserIndex: number } // Verlauf vor diesem User-Turn kappen
 *   { type: "reset" }
 *   { type: "reconnect" }   // start/restart grok agent process
 *   { type: "disconnect" }  // quit agent (like /quit) — stay offline until reconnect
 *
 * AttachmentMeta (after POST /api/attachments):
 *   { id, name, mimeType, size, path, uri }
 *
 * Server → browser:
 *   { type: "status", connected, busy, reconnecting?, ... }
 *   { type: "assistant_chunk", text }
 *   { type: "draft_chunk", text }   // Zwischen-LLM / Entwürfe (°_Agent / ^_Code)
 *   { type: "thought_chunk", text }
 *   { type: "tool", title, status, kind?, toolCallId? }
 *   { type: "plan", entries: PlanEntry[], planId? }  // ACP agent plan (full replace)
 *   { type: "available_commands", commands: AvailableCommand[] }
 *   { type: "system", text }            // bridge notices (fork, deep search start, …)
 *   { type: "turn_done", stopReason? }
 *   { type: "error", message }
 */

import express from "express";
import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
import { Readable, Writable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { parseSeat, SeatHub } from "./seats.js";
import {
  WEB_AGENT_ID,
  WEB_COOKIE,
  WEB_SEAT,
  agentAllowedOnSeat,
  defaultAgentIdForSeat,
  isWebAdminApi,
  isWebGateExempt,
  isWebOrigin,
  isWebRequest,
  parseCookie,
  parseStoredWebSessions,
  serializeWebSessions,
  validateNewWebPassword,
  WEB_SESSION_TTL_S,
  WEB_SESSIONS_MAX,
} from "./webSurface.mjs";
import {
  VAULT_FIND_TIMEOUT_MS,
  vaultFindProxyCatch,
} from "./vaultFindProxy.mjs";
import * as acp from "@agentclientprotocol/sdk";
import {
  DEFAULT_AGENT_ID,
  buildAgentProfiles,
  publicAgent,
  publicAgents,
  resolveAgent,
} from "./agents.js";
import {
  commandsBroadcastPayload,
  normalizeAvailableCommands,
} from "./commands.js";
import { listSkillsForProfile } from "./skills.js";
import {
  planBroadcastPayload,
  planUpdateFromSession,
} from "./plan.js";
import {
  cleanupEmptySessions,
  closeSession,
  applyDiskRewind,
  getSession,
  getSessionForOpen,
  isSessionId,
  listSessions,
  readSessionContext,
  renameSession,
  resolveContextDefaults,
} from "./sessions.js";
import { buildActivity } from "./activity.js";
import { mergeToolFields, resolveToolDisplayTitle } from "./toolTitle.mjs";
import { getWikiRoot } from "./wiki-archive.js";
import {
  listVoices,
  speechToText,
  textToSpeech,
  voiceStatus,
  clearApiKeyCache,
} from "./voice.js";
import {
  buildBindingsStatus,
  buildAgentPush,
  loadBindingsIntoEnv,
  updateBindings,
  pushModelsToAgent,
  probeModelOnAgent,
  resolveModelContextWindow,
  syncModelsIfMismatch,
  readBindingsFile,
  bindingsPath,
} from "./bindings.js";
import {
  getGlyphRoot,
  readGlyphBuild,
  readGlyphVersion,
} from "../shared/meta.js";
import {
  canSwarm,
  deepResearchPrompt,
  parseForkResponse,
} from "../shared/composerActions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = getGlyphRoot();
/** package.json version + git commit count (same sources as the Vite UI bake). */
const GLYPH_VERSION = readGlyphVersion();
const GLYPH_BUILD = readGlyphBuild();
const PORT = Number(process.env.PORT || 5174);
const WORK_CWD = process.env.GLYPH_UI_CWD || process.cwd();
/** Available ACP agents; the active one decides which binary gets spawned. */
const AGENT_PROFILES = buildAgentProfiles();
const STATE_DIR =
  process.env.GLYPH_UI_STATE_DIR ||
  path.join(os.homedir(), ".glyph-ui");
/** Load UI-saved API keys into process.env (does not override existing env). */
await loadBindingsIntoEnv(path.join(STATE_DIR, "bindings.json"));
const UPLOAD_DIR = path.join(STATE_DIR, "uploads");
const MAX_ATTACHMENT_BYTES = Number(
  process.env.GLYPH_UI_MAX_ATTACHMENT || 12 * 1024 * 1024,
);
const MAX_ATTACHMENTS_PER_MSG = 8;
/** Drop files in uploads/ older than this (default 24h). */
const UPLOAD_MAX_AGE_MS = Number(
  process.env.GLYPH_UPLOAD_MAX_AGE_MS || 24 * 60 * 60 * 1000,
);
const ALLOW_REMOTE =
  process.env.GLYPH_ALLOW_REMOTE === "1";
/** Vite dev UI port (proxies /api and /ws → bridge). */
const DEV_UI_PORT = 5173;
/**
 * Shared WS auth token (injected into served index.html; client sends on connect).
 * Rotates every process start unless GLYPH_WS_TOKEN is set.
 */
const WS_TOKEN =
  process.env.GLYPH_WS_TOKEN || crypto.randomBytes(32).toString("hex");
	
/**
 * Bind host: loopback only unless GLYPH_ALLOW_REMOTE=1.
 * The bridge is unauthenticated and can delete sessions + drive the agent.
 */
function resolveBindHost(raw) {
  const host = String(raw || "127.0.0.1").trim() || "127.0.0.1";
  const lower = host.toLowerCase();
  const loopback =
    lower === "127.0.0.1" ||
    lower === "localhost" ||
    lower === "::1" ||
    lower === "[::1]";
  const allInterfaces =
    lower === "0.0.0.0" || lower === "::" || lower === "[::]" || lower === "*";
  if (loopback) return host === "localhost" ? "127.0.0.1" : host;
  if (ALLOW_REMOTE) {
    console.warn(
      `[glyph] WARNING: binding to ${host} with GLYPH_ALLOW_REMOTE=1 — unauthenticated API is network-reachable`,
    );
    return host;
  }
  if (allInterfaces || !loopback) {
    console.error(
      `[glyph] Refusing to bind HOST=${host} (non-loopback). ` +
        `Use 127.0.0.1 or set GLYPH_ALLOW_REMOTE=1 if you really mean it.`,
    );
    process.exit(1);
  }
  return "127.0.0.1";
}

const HOST = resolveBindHost(process.env.HOST || "127.0.0.1");

function isLoopbackAddress(addr) {
  if (!addr) return false;
  const a = String(addr).replace(/^::ffff:/i, "");
  return a === "127.0.0.1" || a === "::1" || a === "localhost";
}

/**
 * Extra Origins (comma-separated), besides loopback and the Web-Fläche.
 *   GLYPH_WS_ORIGINS=https://other.example:5174
 */
function originsFromEnvList() {
  const raw = process.env.GLYPH_WS_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Allowed browser Origins for WebSocket upgrades (prod UI + Vite dev UI). */
function allowedWsOrigins() {
  const origins = new Set([
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://localhost:${DEV_UI_PORT}`,
    `http://127.0.0.1:${DEV_UI_PORT}`,
  ]);
  for (const o of originsFromEnvList()) origins.add(o);
  return origins;
}

function isAllowedWsOrigin(origin) {
  if (!origin) return false;
  if (allowedWsOrigins().has(String(origin))) return true;
  return isWebOrigin(origin);
}

/**
 * Reject cross-origin browser pages and unauthenticated local clients.
 * Origin alone is not enough on localhost (any local process can omit/forge it);
 * the shared token from the served UI raises the bar for drive-by WS clients.
 */
/** token → issuedAt (ms). RAM-Spiegel von web-sessions.json. */
const webSessions = new Map();
let webPassword = "";
const WEB_SESSIONS_FILE = path.join(STATE_DIR, "web-sessions.json");
const WEB_SESSION_TTL_MS = WEB_SESSION_TTL_S * 1000;
/** Env password cannot be changed from the Web-Fläche (would revert on restart). */
const webPasswordFromEnv = Boolean(
  String(process.env.GLYPH_WEB_PASSWORD || "").trim(),
);
const WEB_PASSWORD_FILE = path.join(STATE_DIR, "web-password");

async function loadWebPassword() {
  const fromEnv = String(process.env.GLYPH_WEB_PASSWORD || "").trim();
  if (fromEnv) {
    webPassword = fromEnv;
    return;
  }
  try {
    const existing = String(await fs.readFile(WEB_PASSWORD_FILE, "utf8")).trim();
    if (existing) {
      webPassword = existing;
      return;
    }
  } catch {
    /* create below */
  }
  const generated = crypto.randomBytes(16).toString("hex");
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(WEB_PASSWORD_FILE, `${generated}\n`, { mode: 0o600 });
  webPassword = generated;
  console.warn(`[glyph] Web-Tor: Passwort in ${WEB_PASSWORD_FILE}`);
}

async function saveWebPassword(next) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(WEB_PASSWORD_FILE, `${next}\n`, { mode: 0o600 });
  webPassword = next;
}

async function loadWebSessions() {
  try {
    const raw = JSON.parse(await fs.readFile(WEB_SESSIONS_FILE, "utf8"));
    for (const row of parseStoredWebSessions(raw, Date.now())) {
      webSessions.set(row.token, row.iat);
    }
  } catch {
    /* missing or unreadable — start empty */
  }
}

async function persistWebSessions() {
  const entries = [...webSessions.entries()].map(([token, iat]) => ({
    token,
    iat,
  }));
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(WEB_SESSIONS_FILE, serializeWebSessions(entries), {
    mode: 0o600,
  });
}

function trimWebSessions(now = Date.now()) {
  for (const [token, iat] of webSessions) {
    if (now - iat >= WEB_SESSION_TTL_MS) webSessions.delete(token);
  }
  if (webSessions.size <= WEB_SESSIONS_MAX) return;
  const sorted = [...webSessions.entries()].sort((a, b) => a[1] - b[1]);
  while (webSessions.size > WEB_SESSIONS_MAX) {
    const oldest = sorted.shift();
    if (!oldest) break;
    webSessions.delete(oldest[0]);
  }
}

function webSessionToken(req) {
  return parseCookie(req?.headers?.cookie, WEB_COOKIE);
}

function hasWebSession(req) {
  const token = webSessionToken(req);
  if (!token) return false;
  const iat = webSessions.get(token);
  if (iat == null) return false;
  if (Date.now() - iat >= WEB_SESSION_TTL_MS) {
    webSessions.delete(token);
    void persistWebSessions();
    return false;
  }
  return true;
}

function issueWebSession() {
  const token = crypto.randomBytes(24).toString("hex");
  webSessions.set(token, Date.now());
  trimWebSessions();
  void persistWebSessions();
  return token;
}

function webCookieHeader(token) {
  const parts = [
    `${WEB_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=2592000",
  ];
  // Tunnel is HTTPS; local preview of seat=web stays on http.
  parts.push("Secure");
  return parts.join("; ");
}

function passwordsMatch(got, expected) {
  const a = Buffer.from(String(got || ""), "utf8");
  const b = Buffer.from(String(expected || ""), "utf8");
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

await loadWebPassword();
await loadWebSessions();

function verifyWsClient(info) {
  const req = info.req;
  const web = isWebRequest(req);
  const ip = req?.socket?.remoteAddress || "";
  if (!ALLOW_REMOTE && !web && !isLoopbackAddress(ip)) {
    console.warn(`[glyph] WS rejected: non-loopback ${ip || "(unknown)"}`);
    return false;
  }
  if (web && !hasWebSession(req)) {
    console.warn("[glyph] WS rejected: web gate");
    return false;
  }

  const origin = info.origin || req?.headers?.origin || "";
  if (!isAllowedWsOrigin(origin)) {
    console.warn(`[glyph] WS rejected: origin ${origin || "(none)"}`);
    return false;
  }

  let token = "";
  try {
    const host = info.req?.headers?.host || `127.0.0.1:${PORT}`;
    const url = new URL(info.req.url || "/ws", `http://${host}`);
    token = url.searchParams.get("token") || "";
  } catch {
    token = "";
  }
  // Constant-time compare when lengths match; reject early on empty/mismatch length.
  const expected = Buffer.from(WS_TOKEN, "utf8");
  const got = Buffer.from(String(token), "utf8");
  if (
    expected.length === 0 ||
    got.length !== expected.length ||
    !crypto.timingSafeEqual(got, expected)
  ) {
    console.warn("[glyph] WS rejected: invalid or missing token");
    return false;
  }
  return true;
}

function injectWsToken(html) {
  const inject = `<script>window.__GLYPH_WS_TOKEN__=${JSON.stringify(WS_TOKEN)};</script>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${inject}\n</head>`);
  }
  return `${inject}\n${html}`;
}

async function sendIndexHtml(req, res) {
  const filePath = path.join(ROOT, "client/dist", "index.html");
  const raw = await fs.readFile(filePath, "utf8");
  res.setHeader("Cache-Control", "no-store");
  const gated = isWebRequest(req) && !hasWebSession(req);
  res.type("html").send(gated ? raw : injectWsToken(raw));
}

/** Safe single-segment filename for uploads. */
function sanitizeFilename(name) {
  const base = path.basename(String(name || "file")).replace(/[^\w.\- ()[\]]+/g, "_");
  const trimmed = base.trim() || "file";
  return trimmed.slice(0, 120);
}

function isPathInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isImageMime(mime) {
  return String(mime || "").toLowerCase().startsWith("image/");
}

function isTextyAttachment(mime, name) {
  const m = String(mime || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  if (m.startsWith("text/")) return true;
  if (
    m.includes("json") ||
    m.includes("xml") ||
    m.includes("javascript") ||
    m.includes("typescript") ||
    m.includes("yaml") ||
    m.includes("x-sh") ||
    m === "application/x-ndjson"
  ) {
    return true;
  }
  return /\.(txt|md|markdown|json|jsonl|csv|tsv|ya?ml|xml|html?|css|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|bash|zsh|toml|ini|env|log|sql|graphql|r|lua|vim|diff|patch|dockerfile)$/i.test(
    n,
  );
}

/**
 * Build ACP ContentBlocks from text + saved attachments.
 * Images → image blocks; text files → embedded resource; others → resource_link (+ blob).
 */
async function buildPromptBlocks(text, attachments = []) {
  const prompt = [];
  const t = String(text || "").trim();
  const list = Array.isArray(attachments) ? attachments.slice(0, MAX_ATTACHMENTS_PER_MSG) : [];

  if (t) {
    prompt.push({ type: "text", text: t });
  } else if (list.length) {
    const names = list.map((a) => a.name || "Datei").join(", ");
    prompt.push({
      type: "text",
      text: `Anhang (${list.length}): ${names}`,
    });
  }

  for (const att of list) {
    const filePath = String(att.path || "");
    if (!filePath || !isPathInside(UPLOAD_DIR, filePath)) {
      throw new Error(`Anhang ungültig oder außerhalb Upload-Ordner: ${att.name || "?"}`);
    }
    let buf;
    try {
      buf = await fs.readFile(filePath);
    } catch {
      throw new Error(`Anhang nicht gefunden: ${att.name || filePath}`);
    }
    if (!buf.length) continue;
    if (buf.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Anhang zu groß: ${att.name || "Datei"}`);
    }

    const mime = String(att.mimeType || "application/octet-stream");
    const name = String(att.name || path.basename(filePath));
    const uri = att.uri || pathToFileURL(filePath).href;

    if (isImageMime(mime)) {
      prompt.push({
        type: "image",
        mimeType: mime,
        data: buf.toString("base64"),
        uri,
      });
      continue;
    }

    if (isTextyAttachment(mime, name) && buf.length <= 2 * 1024 * 1024) {
      prompt.push({
        type: "resource",
        resource: {
          uri,
          mimeType: mime.startsWith("text/") || mime.includes("json")
            ? mime
            : "text/plain",
          text: buf.toString("utf8"),
        },
      });
      // Also link so the agent can re-open from disk if needed
      prompt.push({
        type: "resource_link",
        uri,
        name,
        mimeType: mime,
        size: buf.length,
        title: name,
      });
      continue;
    }

    // Binary / other: resource_link (baseline) + embedded blob when useful
    prompt.push({
      type: "resource_link",
      uri,
      name,
      mimeType: mime,
      size: buf.length,
      title: name,
      description: `Hochgeladen nach ${filePath}`,
    });
    if (buf.length <= 4 * 1024 * 1024) {
      prompt.push({
        type: "resource",
        resource: {
          uri,
          mimeType: mime,
          blob: buf.toString("base64"),
        },
      });
    }
  }

  if (!prompt.length) {
    throw new Error("Empty message");
  }
  return prompt;
}

const app = express();
const httpServer = createServer(app);

/** Filled after GrokBridge is defined. */
let seats;
function seatFromReq(req) {
  if (isWebRequest(req)) return WEB_SEAT;
  return parseSeat(req.get("x-glyph-seat") || req.query?.seat);
}
function live(req) {
  return seats.get(seatFromReq(req));
}
const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws",
  verifyClient: verifyWsClient,
});

// Default JSON body limit; large payloads use a route-local parser.
app.use((req, res, next) => {
  if (req.path === "/api/stt" || req.path === "/api/attachments") return next();
  return express.json({ limit: "1mb" })(req, res, next);
});

/**
 * glyph-ui.com: require the Web-Tor cookie. HTML/assets stay reachable so
 * the login surface can load. Tunnel source IP is loopback — Host decides.
 */
app.use((req, res, next) => {
  if (!isWebRequest(req)) return next();
  if (isWebGateExempt(req)) return next();
  if (hasWebSession(req)) return next();
  res.status(401).json({ error: "Web-Tor", gate: true });
});

app.use((req, res, next) => {
  if (!isWebRequest(req)) return next();
  if (!isWebAdminApi(req.path)) return next();
  res.status(403).json({ error: "Nur Admin-Fläche (Mac)" });
});

/**
 * Mutating API must come from loopback *and* an allowed Origin when present.
 * Loopback alone is not enough: a browser tab on this machine still has a
 * loopback source IP, so cross-site POSTs (CSRF) would otherwise succeed.
 * Same Origin allow-list as the WebSocket handshake / /api/ws-token.
 */
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  if (!req.path.startsWith("/api")) return next();
  if (ALLOW_REMOTE) return next();
  const ip = req.socket?.remoteAddress || "";
  if (!isLoopbackAddress(ip)) {
    res.status(403).json({
      error: "Forbidden: mutating API is loopback-only (set GLYPH_ALLOW_REMOTE=1 to override)",
    });
    return;
  }
  // Browsers always send Origin on cross-origin POSTs; reject foreign sites.
  // Same-origin may omit Origin (e.g. some non-CORS paths) — allow those.
  const origin = req.get("origin") || "";
  if (origin && !isAllowedWsOrigin(origin)) {
    res.status(403).json({ error: "Forbidden: disallowed Origin" });
    return;
  }
  next();
});

/** Normalize client attachment meta; only paths under UPLOAD_DIR are accepted later. */
function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ATTACHMENTS_PER_MSG).map((a) => ({
    id: a?.id != null ? String(a.id) : "",
    name: sanitizeFilename(a?.name || "file"),
    mimeType: String(a?.mimeType || "application/octet-stream"),
    size: Number(a?.size) || 0,
    path: a?.path != null ? String(a.path) : "",
    uri: a?.uri != null ? String(a.uri) : undefined,
  }));
}

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

/**
 * Delete stale attachment files under UPLOAD_DIR (mtime older than maxAgeMs).
 * Safe: only unlinks regular files directly inside UPLOAD_DIR.
 * @param {{ maxAgeMs?: number }} [opts]
 * @returns {Promise<{ removed: number, freedBytes: number }>}
 */
async function cleanupUploads({ maxAgeMs = UPLOAD_MAX_AGE_MS } = {}) {
  let removed = 0;
  let freedBytes = 0;
  let entries;
  try {
    entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
  } catch {
    return { removed: 0, freedBytes: 0 };
  }
  const age = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : UPLOAD_MAX_AGE_MS;
  const cutoff = Date.now() - age;
  for (const ent of entries) {
    if (!ent.isFile() || ent.name.startsWith(".")) continue;
    const full = path.join(UPLOAD_DIR, ent.name);
    if (!isPathInside(UPLOAD_DIR, full)) continue;
    try {
      const st = await fs.stat(full);
      if (st.mtimeMs > cutoff) continue;
      await fs.unlink(full);
      removed += 1;
      freedBytes += st.size;
    } catch {
      /* race / permission — skip */
    }
  }
  return { removed, freedBytes };
}

/**
 * Save one base64 payload under UPLOAD_DIR.
 * @returns {Promise<{ id: string, name: string, mimeType: string, size: number, path: string, uri: string }>}
 */
async function saveAttachmentFile({ name, mimeType, dataBase64 }) {
  const safeName = sanitizeFilename(name || "file");
  const mime = String(mimeType || "application/octet-stream");
  if (!dataBase64 || typeof dataBase64 !== "string") {
    throw Object.assign(new Error(`dataBase64 fehlt: ${safeName}`), { status: 400 });
  }
  // Strip optional data-URL prefix
  const b64 = dataBase64.includes(",")
    ? dataBase64.slice(dataBase64.indexOf(",") + 1)
    : dataBase64;
  let buf;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw Object.assign(new Error(`Base64 ungültig: ${safeName}`), { status: 400 });
  }
  if (!buf.length) {
    throw Object.assign(new Error(`Leere Datei: ${safeName}`), { status: 400 });
  }
  if (buf.length > MAX_ATTACHMENT_BYTES) {
    throw Object.assign(
      new Error(
        `Zu groß: ${safeName} (max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB)`,
      ),
      { status: 413 },
    );
  }

  await ensureUploadDir();
  const id = crypto.randomUUID();
  const ext = path.extname(safeName);
  const stored = `${id}${ext || ""}`;
  const filePath = path.join(UPLOAD_DIR, stored);
  if (!isPathInside(UPLOAD_DIR, filePath)) {
    throw Object.assign(new Error("Ungültiger Speicherpfad"), { status: 400 });
  }
  await fs.writeFile(filePath, buf);
  // Opportunistic sweep so long-lived LaunchAgent processes still honor TTL
  // without waiting for the next hourly interval / process restart.
  void cleanupUploads().catch(() => {});
  return {
    id,
    name: safeName,
    mimeType: mime,
    size: buf.length,
    path: filePath,
    uri: pathToFileURL(filePath).href,
  };
}

// API routes are registered below BEFORE static — do not move static above them.
app.get("/api/health", (req, res) => {
  const b = seats ? live(req) : null;
  const web = Boolean(b?.seat === WEB_SEAT || isWebRequest(req));
  const agent = publicAgent(b?.agentProfile?.() || null);
  const allAgents = publicAgents(AGENT_PROFILES);
  const agents = web
    ? allAgents.filter((a) => agentAllowedOnSeat(WEB_SEAT, a.id))
    : allAgents;
  const payload = {
    ok: true,
    version: GLYPH_VERSION,
    build: GLYPH_BUILD,
    host: HOST,
    port: PORT,
    connected: Boolean(b?.connected),
    reconnecting: Boolean(b?.starting),
    sessionId: b?.sessionId || null,
    seat: b?.seat || (web ? WEB_SEAT : "desk"),
    surface: web ? "web" : "admin",
    cwd: web ? "" : WORK_CWD,
    agent: web && agent && !agentAllowedOnSeat(WEB_SEAT, agent.id)
      ? publicAgent(
          AGENT_PROFILES.find((p) => p.id === WEB_AGENT_ID) || null,
        )
      : agent,
    agents,
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    maxAttachmentsPerMsg: MAX_ATTACHMENTS_PER_MSG,
  };
  if (!web) {
    payload.root = ROOT;
    payload.seats = seats
      ? seats.all().map((x) => ({
          seat: x.seat,
          connected: Boolean(x.connected),
          sessionId: x.sessionId || null,
          agent: publicAgent(x.agentProfile?.() || null)?.id || null,
        }))
      : [];
    payload.wikiRoot = getWikiRoot();
    payload.uploads = UPLOAD_DIR;
  }
  res.json(payload);
});

app.get("/api/web-gate", (req, res) => {
  const web = isWebRequest(req);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    required: web,
    ok: web ? hasWebSession(req) : true,
    seat: web ? WEB_SEAT : parseSeat(req.get("x-glyph-seat") || req.query?.seat),
  });
});

app.post("/api/web-gate", (req, res) => {
  if (!isWebRequest(req)) {
    res.json({ ok: true, required: false });
    return;
  }
  const origin = req.get("origin") || "";
  if (origin && !isAllowedWsOrigin(origin)) {
    res.status(403).json({ error: "Forbidden", gate: true });
    return;
  }
  if (!passwordsMatch(req.body?.password, webPassword)) {
    res.status(401).json({ error: "Passwort falsch", gate: true });
    return;
  }
  const token = issueWebSession();
  res.setHeader("Set-Cookie", webCookieHeader(token));
  res.json({ ok: true, required: true });
});

app.post("/api/web-gate/password", async (req, res) => {
  if (!isWebRequest(req)) {
    res.status(403).json({ error: "Nur auf der Web-Fläche" });
    return;
  }
  if (!hasWebSession(req)) {
    res.status(401).json({ error: "Web-Tor", gate: true });
    return;
  }
  if (webPasswordFromEnv) {
    res.status(409).json({
      error: "Passwort kommt aus GLYPH_WEB_PASSWORD — Env auf dem Mac entfernen, dann in der Web-UI ändern",
    });
    return;
  }
  const origin = req.get("origin") || "";
  if (origin && !isAllowedWsOrigin(origin)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!passwordsMatch(req.body?.current, webPassword)) {
    res.status(401).json({ error: "Aktuelles Passwort falsch" });
    return;
  }
  const check = validateNewWebPassword(req.body?.next, webPassword);
  if (!check.ok) {
    res.status(400).json({ error: check.error });
    return;
  }
  try {
    await saveWebPassword(check.password);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  webSessions.clear();
  await persistWebSessions();
  const token = issueWebSession();
  res.setHeader("Set-Cookie", webCookieHeader(token));
  res.json({ ok: true });
});

/**
 * Profile-dependent skills for Extensions-Modal / Slash-Popup.
 * Query: ?profile=grok|claude|glyph-agent (default: active bridge agent or grok)
 */
app.get("/api/skills", async (req, res) => {
  try {
    const activeId = live(req)?.agentProfile?.()?.id;
    const profile = String(
      req.query.profile || activeId || DEFAULT_AGENT_ID || "grok",
    ).trim();
    const result = await listSkillsForProfile(profile, {
      home: os.homedir(),
      cwd: WORK_CWD,
      env: process.env,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Upload chat attachments (JSON + base64 — same style as /api/stt, no multer).
 * Body: { files: [{ name, mimeType, dataBase64 }] } or a single file object.
 * Response: { attachments: AttachmentMeta[] }
 */
const ATTACH_JSON_LIMIT = `${Math.ceil((MAX_ATTACHMENT_BYTES * MAX_ATTACHMENTS_PER_MSG * 1.4) / (1024 * 1024)) + 2}mb`;
app.post(
  "/api/attachments",
  express.json({ limit: ATTACH_JSON_LIMIT }),
  async (req, res) => {
    try {
      const body = req.body || {};
      const rawFiles = Array.isArray(body.files)
        ? body.files
        : body.dataBase64 || body.data
          ? [body]
          : [];
      if (!rawFiles.length) {
        res.status(400).json({ error: "Keine Dateien (files[] oder dataBase64)" });
        return;
      }
      if (rawFiles.length > MAX_ATTACHMENTS_PER_MSG) {
        res.status(400).json({
          error: `Maximal ${MAX_ATTACHMENTS_PER_MSG} Anhänge pro Upload`,
        });
        return;
      }

      const attachments = [];
      for (const f of rawFiles) {
        attachments.push(
          await saveAttachmentFile({
            name: f?.name,
            mimeType: f?.mimeType || f?.type,
            dataBase64: f?.dataBase64 || f?.data,
          }),
        );
      }
      res.json({ attachments });
    } catch (err) {
      const status = err?.status || 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

/**
 * WS token for the UI when index.html is not served by this process (Vite dev).
 * Loopback + allowed Origin only — same bar as the WebSocket handshake itself.
 */
app.get("/api/ws-token", (req, res) => {
  if (isWebRequest(req)) {
    if (!hasWebSession(req)) {
      res.status(401).json({ error: "Web-Tor", gate: true });
      return;
    }
  } else if (!ALLOW_REMOTE && !isLoopbackAddress(req.socket?.remoteAddress || "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const origin = req.get("origin") || "";
  // Same-origin navigations may omit Origin; require it when present to be allowed.
  if (origin && !isAllowedWsOrigin(origin)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ token: WS_TOKEN });
});

/** Open a path (macOS `open` / Windows / xdg). Multiple strategies for robustness. */
async function openInOs(targetPath, { reveal = false } = {}) {
  const p = String(targetPath || "");
  if (!p) throw new Error("Pfad fehlt");
  if (process.platform === "darwin") {
    if (reveal) {
      await execFileAsync("open", ["-R", p]);
    } else {
      await execFileAsync("open", [p]);
    }
  } else if (process.platform === "win32") {
    await execFileAsync("explorer", [p]);
  } else {
    await execFileAsync("xdg-open", [p]);
  }
  return { ok: true, path: p };
}

/**
 * Open wiki entry: prefer Obsidian URI → .md file → reveal in Finder.
 */
async function openWikiEntry() {
  const { promises: fs } = await import("node:fs");
  const wikiRoot = getWikiRoot();
  const candidates = [
    path.join(wikiRoot, "WIKI.md"),
    path.join(wikiRoot, "index.md"),
    wikiRoot,
  ];
  let target = wikiRoot;
  for (const c of candidates) {
    try {
      await fs.access(c);
      target = c;
      break;
    } catch {
      /* try next */
    }
  }

  const attempts = [];
  const vaultName = path.basename(wikiRoot);

  // 1) Obsidian deep-link (best for “Wiki modern”)
  if (process.platform === "darwin") {
    try {
      let rel = path.relative(wikiRoot, target);
      if (rel && !rel.startsWith("..")) {
        // Obsidian file param: path without .md, use /
        rel = rel.split(path.sep).join("/");
        if (rel.toLowerCase().endsWith(".md")) rel = rel.slice(0, -3);
        const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(rel)}`;
        await execFileAsync("open", [uri]);
        return {
          ok: true,
          path: target,
          opened: target,
          via: "obsidian-uri",
          uri,
          wikiRoot,
        };
      }
    } catch (err) {
      attempts.push(
        `obsidian: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2) open -a Obsidian with the file/vault
    try {
      await execFileAsync("open", ["-a", "Obsidian", target]);
      return {
        ok: true,
        path: target,
        opened: target,
        via: "obsidian-app",
        wikiRoot,
      };
    } catch (err) {
      attempts.push(
        `obsidian-app: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3) Default handler for .md / folder
  try {
    await openInOs(target);
    return {
      ok: true,
      path: target,
      opened: target,
      via: "open",
      wikiRoot,
    };
  } catch (err) {
    attempts.push(`open: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4) Reveal in Finder so the user at least sees the file
  if (process.platform === "darwin") {
    try {
      await openInOs(target, { reveal: true });
      return {
        ok: true,
        path: target,
        opened: target,
        via: "reveal",
        wikiRoot,
        note: "In Finder gezeigt (keine App zum Öffnen gefunden)",
      };
    } catch (err) {
      attempts.push(
        `reveal: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  throw new Error(
    `Wiki konnte nicht geöffnet werden (${target}). ${attempts.join(" · ")}`,
  );
}

app.post("/api/wiki/open", async (_req, res) => {
  try {
    const result = await openWikiEntry();
    res.json(result);
  } catch (err) {
    console.error("[wiki/open]", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET deliberately omitted: opening apps is a side effect (CSRF via localhost).

app.post("/api/workspace/open", async (_req, res) => {
  try {
    const result = await openInOs(WORK_CWD);
    res.json({ ...result, cwd: WORK_CWD });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/bridge/cancel", async (req, res) => {
  try {
    const result = await live(req).cancelTurn();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Start/restart the local `grok agent` process (no Terminal needed).
 * Safe to call while offline or already connected (force restart).
 */
/**
 * Switch the active ACP agent (grok | claude) and restart into it.
 * Body: { id: "claude" }
 */
app.post("/api/bridge/agent", async (req, res) => {
  try {
    const result = await live(req).switchAgent(req.body?.id);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /unbekannter agent/i.test(message)
      ? 400
      : /wartet|warten|arbeitet/i.test(message)
        ? 409
        : 500;
    const b = live(req);
    res.status(status).json({
      ok: false,
      error: message,
      agent: publicAgent(b?.agentProfile?.() || null),
      connected: Boolean(b?.connected),
    });
  }
});

app.post("/api/bridge/reconnect", async (req, res) => {
  try {
    const result = await live(req).reconnect();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      connected: Boolean(live(req)?.connected),
    });
  }
});

/**
 * Stop the local `grok agent` (equivalent to /quit in the TUI).
 * Bridge HTTP/WS stays up; agent goes offline until reconnect.
 */
app.post("/api/bridge/disconnect", async (req, res) => {
  try {
    const result = await live(req).disconnect();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      connected: Boolean(live(req)?.connected),
    });
  }
});

/**
 * List sessions only — never deletes.
 * Empty-shell cleanup is POST /api/sessions/cleanup-empty (explicit).
 */
app.get("/api/sessions", async (req, res) => {
  try {
    const data = await listSessions();
    res.json({
      ...data,
      activeSessionId: live(req).sessionId || null,
      wikiRoot: getWikiRoot(),
      cleaned: null,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Explicit empty-session cleanup (no wiki). Never run from GET/list.
 * Body optional: { confirm: true } required so accidental POSTs are safe.
 */
app.post("/api/sessions/cleanup-empty", async (req, res) => {
  try {
    if (req.body?.confirm !== true) {
      res.status(400).json({
        error: "Bestätigung fehlt: body { confirm: true } erforderlich",
      });
      return;
    }
    const result = await cleanupEmptySessions({
      protectId: seats.all().map((b) => b.sessionId).filter(Boolean),
      deleteDisk: true,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Activity heatmap (Claude-Code-style calendar) from local session events.
 * Query: ?weeks=20 (4–52)
 */
app.get("/api/activity", async (req, res) => {
  try {
    const weeks = Number(req.query.weeks) || 20;
    const data = await buildActivity({ weeks });
    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/** Resolve glyph-agent base URL (bindings or env). */
async function glyphAgentBaseUrl() {
  try {
    const file = await readBindingsFile(bindingsPath(STATE_DIR));
    return (
      String(
        process.env.GLYPH_AGENT_URL || file.settings?.GLYPH_AGENT_URL || "",
      ).trim() || "http://127.0.0.1:18899"
    );
  } catch {
    return (
      String(process.env.GLYPH_AGENT_URL || "").trim() || "http://127.0.0.1:18899"
    );
  }
}

/**
 * Shared proxy for glyph-agent bind registries (vaults / workspaces).
 * POST 30s; GET/PATCH/DELETE 15s. Engine 400 only on POST/PATCH; else 502.
 * Body forwarded on POST/PATCH/DELETE (DELETE pins needs `{path}`).
 */
function proxyAgent(
  prefix,
  { postTimeout = 30000, otherTimeout = 15000, extra = [] } = {},
) {
  const pass400 = (method) => method === "POST" || method === "PATCH";
  const timeoutOf = (method) => (method === "POST" ? postTimeout : otherTimeout);
  const withBody = (method) =>
    method === "POST" || method === "PATCH" || method === "DELETE";

  async function forward(req, res, relPath, method) {
    try {
      const base = await glyphAgentBaseUrl();
      const init = {
        method,
        signal: AbortSignal.timeout(timeoutOf(method)),
      };
      if (withBody(method)) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(req.body || {});
      }
      const r = await fetch(`${base}${relPath}`, init);
      const json = await r.json().catch(() => ({}));
      if (!r.ok && r.status === 404 && (!json.error || json.error === "Not found")) {
        res.status(502).json({
          ok: false,
          error: `${prefix}: Endpoint fehlt (glyph-agent neu starten).`,
        });
        return;
      }
      const status = r.ok
        ? 200
        : pass400(method) && r.status === 400
          ? 400
          : 502;
      res.status(status).json(json);
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  app.get(`/api/${prefix}`, (req, res) =>
    forward(req, res, `/${prefix}`, "GET"),
  );
  app.post(`/api/${prefix}`, (req, res) =>
    forward(req, res, `/${prefix}`, "POST"),
  );
  app.patch(`/api/${prefix}/:id`, (req, res) =>
    forward(
      req,
      res,
      `/${prefix}/${encodeURIComponent(req.params.id)}`,
      "PATCH",
    ),
  );
  app.delete(`/api/${prefix}/:id`, (req, res) =>
    forward(
      req,
      res,
      `/${prefix}/${encodeURIComponent(req.params.id)}`,
      "DELETE",
    ),
  );
  for (const name of extra) {
    app.post(`/api/${prefix}/:id/${name}`, (req, res) =>
      forward(
        req,
        res,
        `/${prefix}/${encodeURIComponent(req.params.id)}/${name}`,
        "POST",
      ),
    );
    app.delete(`/api/${prefix}/:id/${name}`, (req, res) =>
      forward(
        req,
        res,
        `/${prefix}/${encodeURIComponent(req.params.id)}/${name}`,
        "DELETE",
      ),
    );
  }
}

/**
 * Kabelsalat — Vault-Registry (glyph-agent /vaults → ~/.glyph/vaults.json).
 */
proxyAgent("vaults", { extra: ["pins"] });

/**
 * Manuelle Ordner-Suche (°_Agent): POST /api/vault/find → glyph-agent /vault/find
 */
app.post("/api/vault/find", async (req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const r = await fetch(`${base}/vault/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(VAULT_FIND_TIMEOUT_MS),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok) {
      res.status(200).json(json);
      return;
    }
    const status = r.status === 400 || r.status === 404 ? r.status : 502;
    res.status(status).json({
      ok: false,
      hits: [],
      ...json,
      error:
        json.error ||
        (r.status === 404
          ? "Vault-Suche: Endpoint fehlt (glyph-agent neu starten)."
          : `Suche fehlgeschlagen (HTTP ${r.status})`),
    });
  } catch (err) {
    const fail = vaultFindProxyCatch(err);
    res.status(fail.status).json(fail.body);
  }
});

/**
 * Kabelsalat — Workspace-Registry (^_Code /workspaces → ~/.glyph/workspaces.json).
 */
proxyAgent("workspaces");

app.get("/api/code/grants", async (_req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const r = await fetch(`${base}/code/grants`, {
      signal: AbortSignal.timeout(10000),
    });
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(json);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/code/grants/close-task", async (_req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const r = await fetch(`${base}/code/grants/close-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(json);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/code/grants/:id/revoke", async (req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const id = encodeURIComponent(req.params.id);
    const r = await fetch(`${base}/code/grants/${id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(json);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/** Gemeinsame, manuell übergebene Aufgaben (SoT: ~/.glyph/tasks.json). */
proxyAgent("tasks");
app.get("/api/tasks/:id/prompt", async (req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const id = encodeURIComponent(String(req.params.id || ""));
    const r = await fetch(`${base}/tasks/${id}/prompt`, {
      signal: AbortSignal.timeout(15000),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok && r.status === 404 && (!json.error || json.error === "Not found")) {
      res.status(502).json({
        ok: false,
        error: "tasks: Endpoint fehlt (glyph-agent neu starten).",
      });
      return;
    }
    res.status(r.ok ? 200 : r.status === 404 ? 404 : 502).json(json);
  } catch (err) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Proxy againkehrende To-dos (glyph-agent /recurring).
 * Plan-Tab in der UI — keine OpenClaw-Cron-Doppelbuchhaltung.
 */
app.get("/api/recurring", async (_req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const r = await fetch(`${base}/recurring`, {
      signal: AbortSignal.timeout(15000),
    });
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(json);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/api/recurring/events", async (req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const after = String(req.query.after || "");
    const q = after ? `?after=${encodeURIComponent(after)}` : "";
    const r = await fetch(`${base}/recurring/events${q}`, {
      signal: AbortSignal.timeout(10000),
    });
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(json);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/recurring", async (req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const r = await fetch(`${base}/recurring`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(15000),
    });
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : r.status === 400 ? 400 : 502).json(json);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.patch("/api/recurring/:id", async (req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const id = encodeURIComponent(String(req.params.id || ""));
    const r = await fetch(`${base}/recurring/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(15000),
    });
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : r.status === 400 ? 400 : 502).json(json);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.delete("/api/recurring/:id", async (req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const id = encodeURIComponent(String(req.params.id || ""));
    const r = await fetch(`${base}/recurring/${id}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(15000),
    });
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 404).json(json);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/recurring/:id/run", async (req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const id = encodeURIComponent(String(req.params.id || ""));
    const r = await fetch(`${base}/recurring/${id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || { force: true }),
      signal: AbortSignal.timeout(900000),
    });
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(json);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/recurring/:id/pause", async (req, res) => {
  try {
    const base = await glyphAgentBaseUrl();
    const id = encodeURIComponent(String(req.params.id || ""));
    const r = await fetch(`${base}/recurring/${id}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || { paused: true }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(json);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Voice STT/TTS — xAI primary, OpenRouter fallback (same OR key as chat).
 * Docs: https://docs.x.ai/developers/model-capabilities/audio/voice
 *       https://openrouter.ai/docs/guides/overview/multimodal/tts
 */
app.get("/api/voice/status", async (_req, res) => {
  try {
    res.json(await voiceStatus());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Connection bindings: OAuth/key status + local secret store (~/.glyph-ui/bindings.json).
 * GET never returns raw secrets. PUT accepts DIRECT_API_KEY, DIRECT_API_URL,
 * OPENROUTER_API_KEY, XAI_API_KEY, GLYPH_AGENT_URL (empty string clears).
 */
app.get("/api/bindings", async (_req, res) => {
  try {
    res.json(
      await buildBindingsStatus({
        stateDir: STATE_DIR,
        env: process.env,
      }),
    );
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.put("/api/bindings", async (req, res) => {
  try {
    const body = req.body || {};
    // Optional contextWindow fill for shared primary on save
    if (body.models?.shared?.primary && !body.models.shared.contextWindow) {
      try {
        const win = await resolveModelContextWindow(body.models.shared.primary, {
          cached: body.models.shared.contextWindow,
        });
        body.models.shared.contextWindow = win.window;
      } catch {
        /* keep without window */
      }
    }
    if (body.models?.code?.primary && !body.models.code.contextWindow) {
      try {
        const win = await resolveModelContextWindow(body.models.code.primary);
        body.models.code.contextWindow = win.window;
      } catch {
        /* ignore */
      }
    }
    const saved = await updateBindings(body, {
      stateDir: STATE_DIR,
      env: process.env,
    });
    clearApiKeyCache();

    let modelsApply = null;
    const agentUrl =
      String(
        process.env.GLYPH_AGENT_URL ||
          saved.settings?.GLYPH_AGENT_URL ||
          "",
      ).trim() || "http://127.0.0.1:18899";
    const plan = buildAgentPush(saved, body);
    if (plan.push) {
      modelsApply = await pushModelsToAgent(agentUrl, plan.models, {
        direct: plan.direct,
      });
    }

    res.json(
      await buildBindingsStatus({
        stateDir: STATE_DIR,
        env: process.env,
        modelsApply,
      }),
    );
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Apply bindings models to running glyph-agent (or sync if mismatch).
 * POST { } empty → sync from file if mismatch; or { models } to push explicit.
 */
app.post("/api/models/apply", async (req, res) => {
  try {
    const body = req.body || {};
    if (body.models) {
      const file = await readBindingsFile(bindingsPath(STATE_DIR));
      const models = body.models;
      const agentUrl =
        String(
          process.env.GLYPH_AGENT_URL || file.settings?.GLYPH_AGENT_URL || "",
        ).trim() || "http://127.0.0.1:18899";
      const push = await pushModelsToAgent(agentUrl, models);
      res.status(push.ok ? 200 : 502).json(push);
      return;
    }
    const result = await syncModelsIfMismatch({
      stateDir: STATE_DIR,
      env: process.env,
    });
    res.status(result.ok || result.skipped ? 200 : 502).json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Probe model via glyph-agent (production key/URL). Body: { model }
 */
app.post("/api/models/probe", async (req, res) => {
  try {
    const model = String(req.body?.model || req.body?.primary || "").trim();
    if (!model) {
      res.status(400).json({ ok: false, error: "model fehlt" });
      return;
    }
    const file = await readBindingsFile(bindingsPath(STATE_DIR));
    const agentUrl =
      String(
        process.env.GLYPH_AGENT_URL || file.settings?.GLYPH_AGENT_URL || "",
      ).trim() || "http://127.0.0.1:18899";
    const result = await probeModelOnAgent(agentUrl, model);
    if (result.ok && result.context_length) {
      /* client may cache */
    } else if (result.ok) {
      const win = await resolveModelContextWindow(model);
      result.context_length = win.window;
      result.context_source = win.source;
    }
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/api/tts/voices", async (_req, res) => {
  try {
    res.json(await listVoices());
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/** Speech → text (JSON body with base64 audio — no multer needed). */
app.post(
  "/api/stt",
  express.json({ limit: "30mb" }),
  async (req, res) => {
    try {
      const {
        audioBase64,
        mimeType = "audio/webm",
        language,
        filename,
      } = req.body || {};
      if (!audioBase64 || typeof audioBase64 !== "string") {
        res.status(400).json({ error: "audioBase64 fehlt" });
        return;
      }
      const buffer = Buffer.from(audioBase64, "base64");
      if (!buffer.length) {
        res.status(400).json({ error: "Leeres Audio" });
        return;
      }
      if (buffer.length > 25 * 1024 * 1024) {
        res.status(413).json({ error: "Audio zu groß (max ~25 MB)" });
        return;
      }
      const result = await speechToText(buffer, {
        mimeType: String(mimeType || "audio/webm"),
        language: language ? String(language) : undefined,
        filename: filename ? String(filename) : undefined,
      });
      res.json(result);
    } catch (err) {
      const status = err?.status || 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : String(err),
        detail: err?.detail || undefined,
      });
    }
  },
);

/** Text → speech (returns raw audio/mpeg). */
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice_id, voiceId, language, speed } = req.body || {};
    const result = await textToSpeech(String(text || ""), {
      voiceId: voiceId || voice_id,
      language: language ? String(language) : undefined,
      speed,
    });
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "no-store");
    res.send(result.buffer);
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : String(err),
      detail: err?.detail || undefined,
    });
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  try {
    if (!isSessionId(req.params.id)) {
      res.status(400).json({ error: "Invalid session id" });
      return;
    }
    const session = await getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ session, activeSessionId: live(req).sessionId || null });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Manual title (TUI /rename). Body: { title: string }
 */
app.patch("/api/sessions/:id", async (req, res) => {
  try {
    if (!isSessionId(req.params.id)) {
      res.status(400).json({ error: "Invalid session id" });
      return;
    }
    const result = await renameSession(req.params.id, req.body?.title);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message)
      ? 404
      : /titel|invalid/i.test(message)
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});

/**
 * LVL-UP context meter: used/window for the active or named session.
 * Grok: signals.json ground truth. Others: window map + estimated used (client).
 * Query: ?sessionId=&profile=&model=
 */
app.get("/api/context", async (req, res) => {
  try {
    const b = live(req);
    const profile = String(
      req.query.profile || b?.agentProfile?.()?.id || DEFAULT_AGENT_ID || "grok",
    ).trim();
    // Prefer explicit query sessionId. Only fall back to the live seat
    // session when the *active* profile is grok — a leftover grok UUID must
    // not pin the LVL window at 500k after switching to glyph-agent / claude.
    const bridgeProfile = String(b?.agentProfile?.()?.id || "").trim();
    const bridgeSid = String(b?.sessionId || "").trim();
    const querySid = String(req.query.sessionId || "").trim();
    let sessionId = querySid;
    if (!sessionId && bridgeSid && (profile === "grok" || bridgeProfile === profile)) {
      sessionId = bridgeSid;
    }
    // Effective model: query → env cloud model for glyph-agent → empty
    let modelHint = String(req.query.model || "").trim();
    if (!modelHint && profile === "glyph-agent") {
      modelHint = String(process.env.OPENROUTER_MODEL || "").trim();
    }

    let ctx = null;
    if (sessionId && isSessionId(sessionId)) {
      ctx = await readSessionContext(sessionId, { profile, modelHint });
    }
    if (!ctx) {
      ctx = await resolveContextDefaults({ profile, modelHint });
      if (sessionId) ctx = { ...ctx, sessionId };
    }

    res.json({
      ok: true,
      ...ctx,
      profile,
      activeSessionId: b?.sessionId || null,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Open session in chat: load disk transcript + try ACP session/load so chat continues there.
 * Body unused; GET would also work, but POST signals "activate".
 */
app.post("/api/sessions/:id/open", async (req, res) => {
  try {
    if (!isSessionId(req.params.id)) {
      res.status(400).json({ error: "Invalid session id" });
      return;
    }
    const owner = seats.findBySession(req.params.id);
    const mine = live(req);
    if (owner && owner.seat !== mine.seat) {
      res.status(409).json({
        error: `Session läuft auf Sitz ${owner.seat}`,
        seat: owner.seat,
      });
      return;
    }
    const result = await mine.openSession(req.params.id);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message)
      ? 404
      : /not connected|busy|invalid/i.test(message)
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});

/**
 * Close session (UI: Lupe → Schließen).
 * Body: { deleteDisk: true }. writeWiki ist tot (400) — Persistenz /merken.
 */
app.post("/api/sessions/:id/close", async (req, res) => {
  try {
    if (!isSessionId(req.params.id)) {
      res.status(400).json({ error: "Invalid session id" });
      return;
    }
    // Explicit flags only — empty/missing body must not default to disk wipe.
    const deleteDisk = req.body?.deleteDisk === true;
    const writeWiki = req.body?.writeWiki === true;
    if (writeWiki) {
      res.status(400).json({
        error: "Wiki-Archiv tot — Persistenz nur /merken",
      });
      return;
    }
    if (!deleteDisk) {
      res.status(400).json({
        error: "Nichts zu tun: setze deleteDisk explizit auf true",
      });
      return;
    }
    const result = await closeSession(req.params.id, {
      deleteDisk,
      writeWiki: false,
      protectId: seats.all().map((x) => x.sessionId).filter(Boolean),
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message)
      ? 404
      : /aktive chat-session|invalid session|nichts zu tun|refusing to delete/i.test(
            message,
          )
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});

/**
 * Session-ID für In-Memory-Verlauf (ACP session/history): UUID oder Adapter-IDs.
 * isSessionId (sessions.js) bleibt für Disk-Endpunkte.
 */
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
function isLiveSessionId(id) {
  if (typeof id !== "string" || !id.trim() || id.length > 64) return false;
  if (isSessionId(id)) return true;
  return SAFE_SESSION_ID_RE.test(id);
}

/**
 * Aktiven In-Memory-Verlauf einer Session abrufen (ACP session/history).
 * Kein serverseitiger Puffer; der Adapter liefert store.messages.
 */
app.get("/api/sessions/:id/history", async (req, res) => {
  try {
    if (!isLiveSessionId(req.params.id)) {
      res.status(400).json({ error: "Ungültige Session-ID" });
      return;
    }
    const histBridge =
      seats.findBySession(req.params.id) ||
      (live(req).connected ? live(req) : null);
    if (!histBridge || !histBridge.connected) {
      res.status(503).json({ error: "Kein aktiver Agent verbunden" });
      return;
    }
    const result = await histBridge.getSessionHistory(req.params.id);
    const messages = Array.isArray(result?.messages) ? result.messages : [];
    res.json({ ok: true, sessionId: req.params.id, messages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /unbekannte|beendet|nicht.*support|unknown/i.test(msg) ? 404 : 500;
    res.status(status).json({ error: msg });
  }
});

/** Tool kinds that should finish cleanly rather than hard-abort mid-flight. */
const CRITICAL_TOOL_KINDS = new Set(["edit", "delete", "move", "execute"]);

/** Pull a short preview string from an ACP toolCall for the permission modal. */
function extractPermissionPreview(toolCall) {
  if (!toolCall || typeof toolCall !== "object") return "";
  const parts = [];
  if (toolCall.rawInput && typeof toolCall.rawInput === "object") {
    try {
      parts.push(JSON.stringify(toolCall.rawInput, null, 2).slice(0, 2000));
    } catch {
      /* ignore */
    }
  }
  const content = toolCall.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      const text =
        block?.content?.text ||
        block?.text ||
        (typeof block?.content === "string" ? block.content : "");
      if (text) parts.push(String(text).slice(0, 2500));
    }
  }
  return parts.join("\n").slice(0, 4000);
}

class GrokBridge {
  constructor(opts = {}) {
    this.seat = parseSeat(opts.seat);
    this.connected = false;
    this.sessionId = null;
    /**
     * Active ACP agent profile id. Switching spawns a different binary —
     * Glyph never talks to a model API, so this is the only "provider" knob.
     * Web-Sitz is locked to °_Agent.
     */
    this.agentId = resolveAgent(
      AGENT_PROFILES,
      defaultAgentIdForSeat(this.seat, process.env.GLYPH_AGENT),
    ).id;
    this.process = null;
    this.connection = null;
    this.busy = false;
    this.starting = false;
    this.stopping = false;
    /** Soft-cancel in progress (session/cancel sent, waiting for prompt to return). */
    this.cancelling = false;
    /** Active tool calls for the current turn: id → { title, kind, status }. */
    this.activeTools = new Map();
    /** Watchdog timer when cancel is slow / tools must finish. */
    this.cancelWatchdog = null;
    this.clients = new Set();
    this.stderrTail = [];
    this.loadSessionSupported = false;
    /** While true, ignore session update streams (e.g. during session/load replay). */
    this.suppressUpdates = false;
    /**
     * Current ACP execution plan (clientCapabilities.plan).
     * Full-replace on each plan / plan_update; null when none.
     * @type {{ planId: string | null, entries: Array<{ content: string, status: string, priority: string }> } | null}
     */
    this.plan = null;
    /**
     * Latest availableCommands from the agent (sessionUpdate).
     * @type {Array<{ name: string, description: string, inputHint: string }>}
     */
    this.availableCommands = [];
    /**
     * Pending ACP permission request (for ^_Code Write/Shell).
     * { id, resolve, params, timer }
     * @type {null | { id: string, resolve: Function, params: object, timer: NodeJS.Timeout }}
     */
    this.pendingPermission = null;
  }

  /** Currently selected agent profile (never null — resolveAgent falls back). */
  agentProfile() {
    return resolveAgent(AGENT_PROFILES, this.agentId);
  }

  /**
   * Interactive permission for ^_Code (never auto-approve shell/write).
   * Broadcasts to browser; waits for permission_response or timeout/cancel.
   */
  askBrowserPermission(params) {
    return new Promise((resolve) => {
      // Cancel any previous waiter
      if (this.pendingPermission) {
        try {
          clearTimeout(this.pendingPermission.timer);
          this.pendingPermission.resolve({
            outcome: { outcome: "cancelled" },
          });
        } catch {
          /* ignore */
        }
        this.pendingPermission = null;
      }
      const id = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toolCall = params?.toolCall || {};
      const options = Array.isArray(params?.options) ? params.options : [];
      const timer = setTimeout(() => {
        if (this.pendingPermission?.id === id) {
          this.pendingPermission = null;
          this.broadcast({ type: "permission_dismiss", id });
          resolve({ outcome: { outcome: "cancelled" } });
        }
      }, 5 * 60 * 1000);
      this.pendingPermission = { id, resolve, params, timer };
      const raw = toolCall.rawInput && typeof toolCall.rawInput === "object"
        ? toolCall.rawInput
        : {};
      const grant = raw._grant && typeof raw._grant === "object" ? raw._grant : null;
      this.broadcast({
        type: "permission_request",
        id,
        sessionId: params?.sessionId || this.sessionId,
        title: toolCall.title || toolCall.toolCallId || "Aktion freigeben",
        kind: toolCall.kind || "other",
        preview: extractPermissionPreview(toolCall),
        options: options.map((o) => ({
          optionId: o.optionId,
          name: o.name || o.optionId,
          kind: o.kind || "allow_once",
        })),
        grant,
      });
    });
  }

  resolveBrowserPermission(id, optionId) {
    if (!this.pendingPermission || this.pendingPermission.id !== id) {
      return false;
    }
    clearTimeout(this.pendingPermission.timer);
    const resolve = this.pendingPermission.resolve;
    this.pendingPermission = null;
    this.broadcast({ type: "permission_dismiss", id });
    if (!optionId || optionId === "cancelled") {
      resolve({ outcome: { outcome: "cancelled" } });
    } else {
      resolve({
        outcome: { outcome: "selected", optionId: String(optionId) },
      });
    }
    return true;
  }

  statusPayload(extra = {}) {
    return {
      type: "status",
      connected: this.connected,
      sessionId: this.sessionId,
      seat: this.seat,
      busy: this.busy || this.starting,
      cancelling: this.cancelling,
      reconnecting: this.starting,
      cwd: WORK_CWD,
      agent: publicAgent(this.agentProfile()),
      ...extra,
    };
  }

  /** Apply plan state and fan out to browsers. */
  setPlan(entries, planId = null) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) {
      this.plan = null;
      this.broadcast(planBroadcastPayload([]));
      return;
    }
    this.plan = {
      planId: planId != null ? String(planId) : this.plan?.planId || null,
      entries: list,
    };
    this.broadcast(
      planBroadcastPayload(this.plan.entries, this.plan.planId),
    );
  }

  clearPlan({ broadcast = true } = {}) {
    this.plan = null;
    if (broadcast) {
      this.broadcast(planBroadcastPayload([]));
    }
  }

  setAvailableCommands(raw, { broadcast = true } = {}) {
    this.availableCommands = normalizeAvailableCommands(raw);
    if (broadcast) {
      this.broadcast(commandsBroadcastPayload(this.availableCommands));
    }
  }

  clearAvailableCommands({ broadcast = true } = {}) {
    this.availableCommands = [];
    if (broadcast) {
      this.broadcast(commandsBroadcastPayload([]));
    }
  }

  clearCancelWatchdog() {
    if (this.cancelWatchdog) {
      clearTimeout(this.cancelWatchdog);
      this.cancelWatchdog = null;
    }
  }

  /** End cancel bookkeeping when the prompt turn actually finishes. */
  endCancelState(stopReason) {
    const wasCancelling = this.cancelling;
    this.clearCancelWatchdog();
    this.cancelling = false;
    this.activeTools.clear();

    if (!wasCancelling && stopReason !== "cancelled") return;

    if (stopReason === "cancelled") {
      this.broadcast({
        type: "system",
        text: "Antwort abgebrochen.",
      });
    } else if (wasCancelling) {
      // Agent finished the turn instead of aborting (safer for mid-tool work)
      this.broadcast({
        type: "system",
        text:
          "Abbruch nicht sofort möglich — Arbeit wurde sicher zu Ende geführt.",
      });
    }
  }

  /** Critical in-flight tools that should not be hard-killed mid-write/exec. */
  criticalToolsInFlight() {
    const list = [];
    for (const t of this.activeTools.values()) {
      const kind = String(t.kind || "").toLowerCase();
      const st = String(t.status || "").toLowerCase();
      if (st === "completed" || st === "failed" || st === "cancelled") continue;
      if (CRITICAL_TOOL_KINDS.has(kind)) list.push(t);
    }
    return list;
  }

  broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const ws of this.clients) {
      if (ws.readyState === 1) ws.send(data);
    }
  }

  addClient(ws) {
    this.clients.add(ws);
    ws.send(JSON.stringify(this.statusPayload()));
    // Catch up late joiners with the live plan (if any)
    if (this.plan?.entries?.length) {
      ws.send(
        JSON.stringify(
          planBroadcastPayload(this.plan.entries, this.plan.planId),
        ),
      );
    }
    if (this.availableCommands.length) {
      ws.send(
        JSON.stringify(commandsBroadcastPayload(this.availableCommands)),
      );
    }
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  /**
   * Spawn + initialize `grok agent` via ACP.
   * Safe to call only when process is cleared (use reconnect() otherwise).
   */
  async start() {
    if (this.connected) return { ok: true, already: true };
    if (this.process) {
      throw new Error("Grok process still running — use reconnect()");
    }

    // Binary + args come from the active profile (see server/agents.js).
    // env: Profile-spezifische Env-Variablen (z.B. OPENROUTER_API_KEY) auf
    // process.env legen; profile.env überschreibt bei Kollision.
    const profile = this.agentProfile();
    const childEnv = {
      ...process.env,
      NO_COLOR: "1",
      ...(profile.env || {}),
    };
    const child = spawn(profile.bin, profile.args, {
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: WORK_CWD,
    });
    this.process = child;
    this.stderrTail = [];

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      this.stderrTail.push(...chunk.split("\n").filter(Boolean));
      this.stderrTail = this.stderrTail.slice(-30);
    });
    child.on("exit", (code, signal) => {
      this.handleDisconnect(
        `${profile.label} exited (${signal || code || "unknown"})`,
      );
    });
    child.on("error", (err) => {
      // ENOENT here usually means the agent binary is missing — name it.
      this.handleDisconnect(
        `${profile.label} konnte nicht gestartet werden (${profile.bin}): ${err.message}`,
      );
    });

    try {
      const stream = acp.ndJsonStream(
        Writable.toWeb(child.stdin),
        Readable.toWeb(child.stdout),
      );

      const clientApp = acp
        .client({ name: "grok-build-terminal" })
        .onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
          // ACP: after session/cancel, pending permissions MUST be cancelled
          if (this.cancelling) {
            return { outcome: { outcome: "cancelled" } };
          }
          // ^_Code: Write/Shell immer interaktiv in Glyph bestätigen (nie auto-approve).
          // Grok/Build: always-approve (CLI-Äquivalent --always-approve).
          const profileId = this.agentId;
          if (profileId === "_code" || profileId === "code") {
            return await this.askBrowserPermission(params || {});
          }
          return {
            outcome: { outcome: "selected", optionId: "allow-once" },
          };
        })
        .onNotification(acp.methods.client.session.update, ({ params }) => {
          this.onSessionUpdate(params);
        });

      const connection = clientApp.connect(stream);
      this.connection = connection;

      const initialized = await connection.agent.request(
        acp.methods.agent.initialize,
        {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {
            terminal: false,
            plan: {},
            session: {},
          },
          clientInfo: {
            name: "glyph",
            title: "Glyph UI",
            version: GLYPH_VERSION,
          },
        },
      );

      this.loadSessionSupported = Boolean(
        initialized.agentCapabilities?.loadSession,
      );

      if (initialized.authMethods?.length) {
        const preferred =
          typeof initialized._meta?.defaultAuthMethodId === "string"
            ? initialized._meta.defaultAuthMethodId
            : "";
        const method =
          initialized.authMethods.find((m) => m.id === preferred) ||
          initialized.authMethods.find((m) => m.id === "cached_token") ||
          initialized.authMethods[0];
        await connection.agent.request(acp.methods.agent.authenticate, {
          methodId: method.id,
        });
      }

      await this.createSession();
      this.connected = true;
      this.broadcast(
        this.statusPayload({
          busy: false,
          reconnecting: false,
          agent:
            initialized.agentInfo?.title ||
            initialized.agentInfo?.name ||
            "Grok Build",
        }),
      );

      // OpenRouter model hot-apply when Code/Agent connects and bindings differ
      const profileId = this.agentId || this.agentProfile?.()?.id;
      if (profileId === "_code" || profileId === "glyph-agent") {
        void syncModelsIfMismatch({
          stateDir: STATE_DIR,
          env: process.env,
        }).catch(() => {});
      }

      void connection.closed.then(() => {
        this.handleDisconnect("ACP channel closed");
      });

      return { ok: true, sessionId: this.sessionId };
    } catch (err) {
      // Failed mid-start: tear down child without treating as user-facing disconnect spam mid-reconnect
      await this.stop({ silent: true });
      throw err;
    }
  }

  /**
   * Kill any running agent and start a fresh one.
   * Used from UI when status shows offline (connect) or for force restart.
   */
  /**
   * Switch the active ACP agent and restart into it.
   *
   * A switch is a full restart: different binary, different session store.
   * The new session id differs, so the UI drops the old transcript on its
   * own (same invariant as any reconnect).
   *
   * @param {string} id
   */
  async switchAgent(id) {
    const next = resolveAgent(AGENT_PROFILES, id);
    if (!next || next.id !== String(id)) {
      throw new Error(`Unbekannter Agent: ${id}`);
    }
    if (!agentAllowedOnSeat(this.seat, next.id)) {
      throw new Error("Web-Fläche: nur °_Agent");
    }
    if (this.starting) {
      throw new Error("Verbindung wird gerade aufgebaut — bitte warten");
    }
    if (next.id === this.agentId) {
      return {
        ok: true,
        already: true,
        agent: publicAgent(next),
        connected: this.connected,
      };
    }
    if (this.busy) {
      throw new Error("Agent arbeitet noch — erst abbrechen oder warten");
    }

    this.agentId = next.id;
    this.clearPlan({ broadcast: true });
    this.setAvailableCommands([]);
    this.broadcast({
      type: "system",
      text: `Agent gewechselt → ${next.label}. Neue Session, kein gemeinsamer Verlauf.`,
    });

    const result = await this.reconnect();
    return { ...result, agent: publicAgent(this.agentProfile()) };
  }

  async reconnect() {
    if (this.starting) {
      return {
        ok: false,
        error: "Reconnect läuft bereits",
        connected: this.connected,
      };
    }

    this.starting = true;
    this.busy = true;
    this.broadcast(this.statusPayload({ reconnecting: true }));

    try {
      await this.stop({ silent: true });
      // brief settle so OS releases stdio / portless child handles
      await new Promise((r) => setTimeout(r, 200));
      const result = await this.start();
      return {
        ok: true,
        connected: this.connected,
        sessionId: this.sessionId,
        ...result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const detail = this.stderrTail.at(-1);
      const full =
        detail && !message.includes(detail) ? `${message} — ${detail}` : message;
      this.broadcast({ type: "error", message: full });
      this.broadcast(this.statusPayload({ reconnecting: false, busy: false }));
      throw new Error(full);
    } finally {
      this.starting = false;
      // Reconnect ends any prior turn; busy only for live prompts
      this.busy = false;
      this.broadcast(this.statusPayload());
    }
  }

  /**
   * Quit the agent process (like TUI `/quit`). Leaves the UI bridge running offline.
   */
  async disconnect() {
    if (this.starting) {
      return {
        ok: false,
        error: "Verbindung wird gerade aufgebaut — bitte warten",
        connected: this.connected,
      };
    }
    if (!this.connected && !this.process) {
      this.broadcast(this.statusPayload());
      return { ok: true, connected: false, already: true };
    }

    await this.stop({ silent: false });
    return { ok: true, connected: false, sessionId: null };
  }

  async createSession() {
    const result = await this.connection.agent.request(
      acp.methods.agent.session.new,
      {
        cwd: WORK_CWD,
        mcpServers: [],
        _meta: { yoloMode: true },
      },
    );
    this.sessionId = result.sessionId;
    // New ACP session → drop prior plan (not part of the new turn)
    this.clearPlan({ broadcast: true });
    return result;
  }

  /**
   * Aktiven In-Memory-Verlauf einer Session über die custom ACP-Methode
   * session/history abrufen (kein serverseitiger Puffer; der Adapter besitzt
   * den Verlauf). Liefert { messages: [...] } oder wirft bei unbekannter Session.
   */
  async getSessionHistory(sessionId) {
    if (!this.connection) throw new Error("Keine Adapter-Verbindung.");
    const result = await this.connection.agent.request(
      "session.history",
      { sessionId },
    );
    return result;
  }

  onSessionUpdate(params) {
    if (this.suppressUpdates) return;

    const update = params?.update || params;
    const kind = update?.sessionUpdate;
    if (!kind) return;

    // Effective server trace via ACP _meta (glyph-agent adapter) or legacy
    // agent_message_complete (pre-fix). Prefer _meta — complete is not in schema.
    const glyphMeta =
      params?._meta?.glyph ||
      update?._meta?.glyph ||
      update?.message?.metadata ||
      null;
    if (glyphMeta?.trace && typeof glyphMeta.trace === "object") {
      this.broadcast({ type: "assistant_meta", trace: glyphMeta.trace });
    }
    // ^_Code hard-stop after failed write/shell — red banner with real reason
    if (glyphMeta?.hardError) {
      this.broadcast({
        type: "error",
        message: String(glyphMeta.hardError).slice(0, 800),
      });
    }

    if (kind === "agent_message_chunk") {
      const text = update.content?.text || update.text || "";
      if (!text) return;
      // Live-Tool-/Denk-Stufen (von glyph-agent-adapter) vom normalen Antworttext
      // trennen: ⏺STEP⏺... = Stufe beginnt, ⏹STEP⏹... = Ergebnis derselben Stufe.
      // ⏺DRAFT⏺ / ⏺DRAFT+⏺ = Zwischen-LLM (Protokoll · Entwürfe), nie Primär.
      const STEP_START = "⏺STEP⏺";
      const STEP_END = "⏹STEP⏹";
      const DRAFT_START = "⏺DRAFT⏺";
      const DRAFT_CONT = "⏺DRAFT+⏺";
      if (text.startsWith(STEP_START)) {
        this.broadcast({ type: "step_chunk", phase: "start", text: text.slice(STEP_START.length) });
        return;
      }
      if (text.startsWith(STEP_END)) {
        this.broadcast({ type: "step_chunk", phase: "end", text: text.slice(STEP_END.length) });
        return;
      }
      if (text.startsWith(DRAFT_START)) {
        this.broadcast({ type: "draft_chunk", text: text.slice(DRAFT_START.length), cont: false });
        return;
      }
      if (text.startsWith(DRAFT_CONT)) {
        this.broadcast({ type: "draft_chunk", text: text.slice(DRAFT_CONT.length), cont: true });
        return;
      }
      this.broadcast({ type: "assistant_chunk", text });
      return;
    }
    // Legacy: ignore invalid agent_message_complete if it ever reaches here
    // (SDK usually rejects it before this handler).
    if (kind === "agent_message_complete") {
      return;
    }
    if (kind === "agent_thought_chunk") {
      const text = update.content?.text || update.text || "";
      if (text) this.broadcast({ type: "thought_chunk", text });
      return;
    }
    if (kind === "tool_call" || kind === "tool_call_update") {
      const toolCallId = update.toolCallId || "";
      const status =
        update.status || (kind === "tool_call" ? "pending" : "in_progress");
      const prev = toolCallId
        ? this.activeTools.get(toolCallId) || {}
        : {};
      // Prefer title → name → kind/path — never dump opaque call-… UUIDs in the UI
      const title = resolveToolDisplayTitle(update, prev);
      const toolKind = update.kind || prev.kind || "";
      const fields = mergeToolFields(update, prev);

      if (toolCallId) {
        const done =
          status === "completed" ||
          status === "failed" ||
          status === "cancelled";
        if (done) {
          this.activeTools.delete(toolCallId);
        } else {
          this.activeTools.set(toolCallId, {
            title,
            kind: toolKind,
            status,
            ...fields,
          });
        }
      }

      this.broadcast({
        type: "tool",
        title,
        status,
        kind: toolKind,
        toolCallId,
        name: fields.name,
        rawInput: fields.rawInput,
        rawOutput: fields.rawOutput,
        content: fields.content,
        locations: fields.locations,
      });
      return;
    }

    // ACP agent plan — declared in clientCapabilities.plan; must not be dropped
    if (kind === "plan" || kind === "plan_update" || kind === "plan_removed") {
      const parsed = planUpdateFromSession(update);
      if (!parsed) return;
      if (parsed.remove) {
        // Only clear if this removal matches the active plan (or no id)
        if (
          !parsed.planId ||
          !this.plan?.planId ||
          parsed.planId === this.plan.planId
        ) {
          this.clearPlan();
        }
        return;
      }
      this.setPlan(parsed.entries, parsed.planId);
      return;
    }

    // Live slash-command catalog from the agent (replaces static UI lists)
    if (kind === "available_commands_update") {
      this.setAvailableCommands(update.availableCommands);
    }
  }

  /**
   * Open a disk session: always return transcript for UI.
   * If agent is connected and supports loadSession, resume live context too.
   */
  async openSession(sessionId) {
    if (!isSessionId(sessionId)) {
      throw new Error("Invalid session id");
    }
    if (this.busy || this.starting) {
      throw new Error("Grok ist gerade beschäftigt — bitte warten");
    }

    const session = await getSessionForOpen(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const messages = (session.turns || session.transcriptPreview || []).map(
      (t, i) => ({
        id: `hist-${sessionId}-${i}`,
        role: t.role === "user" ? "user" : "assistant",
        text: t.text,
        streaming: false,
      }),
    );

    let live = false;
    let liveError = null;

    // Already the active agent session — just show disk history, keep sessionId.
    if (this.connected && this.sessionId === sessionId) {
      live = true;
      this.broadcast(
        this.statusPayload({
          openedSessionId: sessionId,
          opened: true,
          reset: true,
        }),
      );
      return {
        ok: true,
        session: {
          id: session.id,
          title: session.title,
          cwd: session.cwd,
          model: session.model,
          truncated: session.truncated,
        },
        messages,
        sessionId: this.sessionId,
        live,
        liveError,
      };
    }

    if (this.connected && this.connection && this.loadSessionSupported) {
      this.suppressUpdates = true;
      try {
        await this.connection.agent.request(acp.methods.agent.session.load, {
          sessionId,
          cwd: session.cwd || WORK_CWD,
          mcpServers: [],
          _meta: { yoloMode: true },
        });
        this.sessionId = sessionId;
        live = true;
      } catch (err) {
        liveError = err instanceof Error ? err.message : String(err);
        live = false;
      } finally {
        this.suppressUpdates = false;
      }
    } else if (this.connected && this.connection && !this.loadSessionSupported) {
      liveError =
        "Agent unterstützt session/load nicht — Verlauf geladen, Chat bleibt in der aktuellen Live-Session";
    } else if (!this.connected) {
      liveError =
        "Grok offline — Verlauf geladen; zum Weiterschreiben erst verbinden";
    }

    this.broadcast(
      this.statusPayload({
        openedSessionId: sessionId,
        opened: true,
        reset: true,
        live,
        liveError,
      }),
    );

    return {
      ok: true,
      session: {
        id: session.id,
        title: session.title,
        cwd: session.cwd,
        model: session.model,
        truncated: session.truncated,
      },
      messages,
      // Always the agent’s live id (unchanged when load fails). Client must not
      // treat a failed open as a session switch — see handleOpenSession.
      sessionId: this.sessionId,
      live,
      liveError,
    };
  }

  /**
   * @param {string} text
   * @param {Array<{ id?: string, name?: string, mimeType?: string, size?: number, path?: string, uri?: string }>} [attachments]
   */
  async chat(text, attachments = [], opts = {}) {
    if (!this.connected || !this.connection || !this.sessionId) {
      throw new Error("Grok is not connected yet");
    }
    if (this.busy) throw new Error("A turn is already running");

    const normalized = normalizeAttachments(attachments);
    const prompt = await buildPromptBlocks(text, normalized);

    this.busy = true;
    this.cancelling = false;
    this.clearCancelWatchdog();
    this.activeTools.clear();
    this.broadcast(this.statusPayload({ busy: true, cancelling: false }));

    let stopReason = "end_turn";
    let failed = null;
    try {
      const glyph = {};
      const isAgent =
        this.agentId === "glyph-agent" || this.agentId === "agent";
      if (isAgent) {
        // Immer setzen: fehlt das Flag, fällt die Engine auf B+-Auto-Suche zurück.
        glyph.vaultSearch = opts.vaultSearch === true;
        if (Array.isArray(opts.vaultSelected)) {
          glyph.vaultSelected = opts.vaultSelected;
        }
      }
      if (opts.swarm === true) glyph.swarm = true;
      const result = await this.connection.agent.request(
        acp.methods.agent.session.prompt,
        {
          sessionId: this.sessionId,
          prompt,
          ...(Object.keys(glyph).length ? { _meta: { glyph } } : {}),
        },
      );
      stopReason = result?.stopReason || "end_turn";
    } catch (err) {
      failed = err;
      // ACP: cancelled prompts sometimes surface as errors from SDK/tools
      const msg = err instanceof Error ? err.message : String(err);
      if (this.cancelling || /cancel/i.test(msg)) {
        stopReason = "cancelled";
        failed = null; // not a user-facing error
      } else {
        stopReason = "error";
      }
    } finally {
      // Always end the turn for the UI so the follow-up queue can drain
      // (even when the agent request throws). Wait until HERE before idle —
      // never mark idle just because cancel was requested.
      this.endCancelState(stopReason);
      this.busy = false;
      this.broadcast({
        type: "turn_done",
        stopReason,
      });
      this.broadcast(this.statusPayload({ busy: false, cancelling: false }));
    }
    if (failed) throw failed;
  }

  /**
   * Deep Search — Grok ACP intercepts `/deep-research` in session/prompt
   * (slash_exec). Not a pager-only command. Other profiles have no host.
   * @param {string} query
   * @param {Array} [attachments]
   */
  async deepSearch(query, attachments = []) {
    if (this.agentId !== "grok") {
      throw new Error(
        "Deep Search nur im Grok-Profil (TUI /deep-research).",
      );
    }
    const q = String(query || "").trim();
    const atts = normalizeAttachments(attachments);
    if (!q && !atts.length) throw new Error("Deep Search braucht eine Query");
    const prompt = deepResearchPrompt(q);
    this.broadcast({
      type: "system",
      text: "Deep Search gestartet. Der Bericht kommt in diesen Chat, sobald die Recherche fertig ist.",
    });
    await this.chat(prompt, atts);
  }

  /**
   * Swarm — °_Agent / ^_Code Engine (Planer → Suche → Synthese).
   * Grok bleibt bei Deep Search.
   * @param {string} query
   * @param {Array} [attachments]
   */
  async swarm(query, attachments = []) {
    if (!canSwarm(this.agentId)) {
      throw new Error(
        "Swarm läuft über °_Agent und ^_Code (Grok: Deep Search).",
      );
    }
    const q = String(query || "").trim();
    const atts = normalizeAttachments(attachments);
    if (!q && !atts.length) throw new Error("Swarm braucht ein Thema");
    this.broadcast({
      type: "system",
      text: "Swarm gestartet (°_Agent / ^_Code). Bericht kommt in diesen Chat.",
    });
    await this.chat(q, atts, { swarm: true });
  }

  /**
   * Fork current session (Grok `x.ai/session/fork`, else ACP `session/fork`).
   * Optional directive is the first prompt in the new session.
   * Slash-as-prompt is not a fallback — that leaves Glyph on the old session.
   */
  async forkSession(directive = "") {
    if (!this.connected || !this.connection || !this.sessionId) {
      throw new Error("Agent ist noch nicht verbunden");
    }
    if (this.busy) throw new Error("A turn is already running");

    const sourceId = this.sessionId;
    const params = {
      sessionId: sourceId,
      sourceSessionId: sourceId,
      cwd: WORK_CWD,
      mcpServers: [],
      _meta: { yoloMode: true, noWorktree: true },
    };

    const tryRequest = async (method) => {
      try {
        return {
          method,
          result: await this.connection.agent.request(method, params),
        };
      } catch (err) {
        const code = err?.code ?? err?.data?.code;
        const msg = String(err?.message || err || "");
        const missing =
          code === -32601 ||
          /method not found|unknown method|not implemented|unrecognized/i.test(
            msg,
          );
        if (missing) return null;
        throw err;
      }
    };

    const hit =
      (await tryRequest("x.ai/session/fork")) ||
      (await tryRequest(acp.methods.agent.session.fork));
    if (!hit) {
      throw new Error(
        "Fork: Agent bietet weder x.ai/session/fork noch session/fork.",
      );
    }

    const newId = parseForkResponse(hit.result);
    if (!newId) {
      throw new Error("Fork fehlgeschlagen: keine neue sessionId");
    }

    this.sessionId = newId;
    this.clearPlan({ broadcast: true });
    this.clearAvailableCommands({ broadcast: true });
    this.broadcast(
      this.statusPayload({
        forked: true,
        sourceSessionId: sourceId,
        sessionId: newId,
      }),
    );
    this.broadcast({
      type: "system",
      text: `Session geforkt → ${newId.slice(0, 8)}… (Quelle ${sourceId.slice(0, 8)}…)`,
    });

    const d = String(directive || "").trim();
    if (d) {
      await this.chat(d);
    } else {
      this.broadcast({ type: "turn_done", stopReason: "fork" });
    }

    return {
      ok: true,
      via: hit.method,
      sourceSessionId: sourceId,
      sessionId: newId,
    };
  }

  /**
   * Rewind: drop the chosen user turn and everything after.
   * Files on disk stay. Grok: ACP method or disk+session/load.
   * °_Agent / ^_Code: session.rewind on the adapter.
   */
  async rewindTurn(dropUserIndex) {
    const drop = Number(dropUserIndex);
    if (!Number.isInteger(drop) || drop < 0) {
      throw new Error("dropUserIndex ungültig");
    }
    if (this.busy) throw new Error("Agent arbeitet noch — erst abbrechen oder warten");

    const sessionId = this.sessionId;
    const profile = this.agentId;
    let via = "ui";

    const tryRequest = async (method, params) => {
      if (!this.connection?.agent?.request) return null;
      try {
        return await this.connection.agent.request(method, params);
      } catch (err) {
        const code = err?.code ?? err?.data?.code;
        const msg = String(err?.message || err || "");
        const missing =
          code === -32601 ||
          /method not found|unknown method|not implemented|unrecognized/i.test(
            msg,
          );
        if (missing) return null;
        throw err;
      }
    };

    if (this.connected && this.connection && sessionId) {
      const params = { sessionId, dropUserIndex: drop, promptIndex: drop };
      const grok = await tryRequest("x.ai/rewind", params);
      if (grok) {
        via = "x.ai/rewind";
      } else {
        const grokApply = await tryRequest("x.ai/rewind/apply", params);
        if (grokApply) via = "x.ai/rewind/apply";
        else {
          const local = await tryRequest("session.rewind", params);
          if (local) via = "session.rewind";
        }
      }
    }

    if (
      via === "ui" &&
      profile === "grok" &&
      sessionId &&
      isSessionId(sessionId)
    ) {
      await applyDiskRewind(sessionId, drop);
      via = "disk";
      if (this.connected && this.connection && this.loadSessionSupported) {
        this.suppressUpdates = true;
        try {
          await this.connection.agent.request(acp.methods.agent.session.load, {
            sessionId,
            cwd: WORK_CWD,
            mcpServers: [],
            _meta: { yoloMode: true },
          });
          via = "disk+load";
        } catch {
          /* disk truncated; live context may still hold later turns */
        } finally {
          this.suppressUpdates = false;
        }
      }
    }

    if (via === "ui" && profile !== "grok") {
      throw new Error("Rewind: Adapter ohne session.rewind — Agent nicht verbunden?");
    }

    this.clearPlan({ broadcast: true });
    this.broadcast({
      type: "rewind_result",
      ok: true,
      dropUserIndex: drop,
      via,
      sessionId: sessionId || null,
    });
    this.broadcast({
      type: "system",
      text:
        via === "ui"
          ? `Rewind · Turn ${drop} (nur Anzeige).`
          : `Rewind · Turn ${drop} weg (${via}). Dateien bleiben.`,
    });
    return { ok: true, dropUserIndex: drop, via, sessionId };
  }

  /**
   * Cancel the current prompt turn (ACP session/cancel).
   *
   * Soft cancel only — never kills the agent process mid-tool (that could
   * corrupt writes). Critical tools finish; UI stays busy until turn_done.
   */
  async cancelTurn() {
    if (!this.connected || !this.connection || !this.sessionId) {
      throw new Error("Grok is not connected");
    }
    // Offene ^_Code-Genehmigung verwerfen
    if (this.pendingPermission) {
      this.resolveBrowserPermission(this.pendingPermission.id, "cancelled");
    }
    if (!this.busy) {
      return { ok: true, cancelled: false, reason: "not_busy" };
    }
    if (this.cancelling) {
      return {
        ok: true,
        cancelled: true,
        reason: "already_cancelling",
        method: "pending",
      };
    }

    const sessionId = this.sessionId;
    const agent = this.connection.agent;
    let method = "none";
    const critical = this.criticalToolsInFlight();

    try {
      // ClientContext.notify → session/cancel (notification, not request)
      if (agent && typeof agent.notify === "function") {
        method = "agent.notify";
        await agent.notify(acp.methods.agent.session.cancel, { sessionId });
      } else if (agent && typeof agent.cancel === "function") {
        method = "agent.cancel";
        await agent.cancel({ sessionId });
      } else if (typeof this.connection.sendNotification === "function") {
        method = "connection.sendNotification";
        await this.connection.sendNotification(
          acp.methods.agent.session.cancel,
          { sessionId },
        );
      } else {
        throw new Error("No ACP cancel path on connection");
      }

      this.cancelling = true;

      if (critical.length > 0) {
        const names = critical
          .map((t) => t.title || t.kind || "Werkzeug")
          .slice(0, 3)
          .join(", ");
        this.broadcast({
          type: "system",
          text: `Stopp angefordert — laufendes Werkzeug wird sicher zu Ende geführt (${names}), danach Abbruch.`,
        });
      } else {
        this.broadcast({
          type: "system",
          text: "Abbruch angefordert…",
        });
      }

      this.broadcast(
        this.statusPayload({
          busy: true,
          cancelling: true,
        }),
      );

      // If the agent is slow to honour cancel, explain — do NOT fake idle.
      this.clearCancelWatchdog();
      this.cancelWatchdog = setTimeout(() => {
        if (!this.busy || !this.cancelling) return;
        const stillCritical = this.criticalToolsInFlight();
        this.broadcast({
          type: "system",
          text: stillCritical.length
            ? "Abbruch wartet noch auf sicheres Tool-Ende — bitte kurz warten."
            : "Abbruch dauert länger als erwartet — Agent arbeitet noch; UI bleibt gesperrt bis Turn endet.",
        });
        this.broadcast(this.statusPayload({ busy: true, cancelling: true }));
      }, 8000);

      return {
        ok: true,
        cancelled: true,
        method,
        deferred: critical.length > 0,
        criticalTools: critical.map((t) => t.title || t.kind),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[cancelTurn]", method, message);
      this.cancelling = false;
      this.clearCancelWatchdog();
      throw new Error(`Cancel failed (${method}): ${message}`);
    }
  }

  async reset() {
    if (!this.connection) throw new Error("Not connected");
    await this.createSession();
    this.clearPlan({ broadcast: true });
    // Commands usually re-arrive after session/new; clear so the UI does not
    // show a catalog from the previous session until the agent refreshes it.
    this.clearAvailableCommands({ broadcast: true });
    this.broadcast({
      type: "status",
      connected: true,
      sessionId: this.sessionId,
      busy: false,
      cwd: WORK_CWD,
      reset: true,
    });
  }

  handleDisconnect(message) {
    // Intentional stop/reconnect: clear quietly (exit event may race)
    if (this.stopping) {
      this.connected = false;
      this.sessionId = null;
      this.connection = null;
      this.process = null;
      this.busy = false;
      this.cancelling = false;
      this.clearCancelWatchdog();
      this.activeTools.clear();
      this.clearPlan({ broadcast: false });
      this.clearAvailableCommands({ broadcast: false });
      return;
    }

    const detail = this.stderrTail.at(-1);
    const full =
      detail && !message.includes(detail) ? `${message} — ${detail}` : message;
    this.connected = false;
    this.busy = false;
    this.cancelling = false;
    this.clearCancelWatchdog();
    this.activeTools.clear();
    this.clearPlan({ broadcast: true });
    this.clearAvailableCommands({ broadcast: true });
    this.sessionId = null;
    this.connection = null;
    if (
      this.process &&
      this.process.exitCode === null &&
      this.process.signalCode === null
    ) {
      try {
        this.process.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    this.process = null;
    this.broadcast({ type: "error", message: full });
    this.broadcast(this.statusPayload());
  }

  async stop({ silent = false } = {}) {
    this.stopping = true;
    const child = this.process;
    this.connection = null;
    this.connected = false;
    this.sessionId = null;
    this.busy = false;
    this.cancelling = false;
    this.clearCancelWatchdog();
    this.activeTools.clear();
    this.process = null;

    if (child && child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      // Wait briefly for clean exit; escalate if needed
      await new Promise((resolve) => {
        const t = setTimeout(() => {
          try {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill("SIGKILL");
            }
          } catch {
            /* ignore */
          }
          resolve();
        }, 800);
        child.once("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }

    this.stopping = false;
    if (!silent) {
      this.broadcast(this.statusPayload());
    }
  }
}

seats = new SeatHub((seat) => new GrokBridge({ seat }));

wss.on("connection", (ws, req) => {
  let seat = "desk";
  try {
    if (isWebRequest(req)) {
      seat = WEB_SEAT;
    } else {
      const host = req?.headers?.host || `127.0.0.1:${PORT}`;
      const url = new URL(req.url || "/ws", `http://${host}`);
      seat = parseSeat(url.searchParams.get("seat"));
    }
  } catch {
    seat = isWebRequest(req) ? WEB_SEAT : "desk";
  }
  const b = seats.get(seat);
  if (
    (seat === "phone" || seat === WEB_SEAT) &&
    !b.connected &&
    !b.starting &&
    !b.process
  ) {
    b.start().catch((err) => {
      console.error(`Failed to start ${seat} seat:`, err);
    });
  }
  b.addClient(ws);

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    try {
      if (msg.type === "chat") {
        await b.chat(msg.text || "", normalizeAttachments(msg.attachments), {
          vaultSearch: msg.vaultSearch,
          vaultSelected: msg.vaultSelected,
        });
      } else if (msg.type === "deep_search" || msg.type === "deep-search") {
        await b.deepSearch(
          msg.text || msg.query || "",
          normalizeAttachments(msg.attachments),
        );
      } else if (msg.type === "swarm") {
        await b.swarm(
          msg.text || msg.query || "",
          normalizeAttachments(msg.attachments),
        );
      } else if (msg.type === "fork") {
        const result = await b.forkSession(msg.text || msg.directive || "");
        ws.send(JSON.stringify({ type: "fork_result", ...result }));
      } else if (msg.type === "rewind") {
        const result = await b.rewindTurn(msg.dropUserIndex);
        ws.send(JSON.stringify({ type: "rewind_ack", ...result }));
      } else if (msg.type === "reset") {
        await b.reset();
      } else if (msg.type === "cancel" || msg.type === "stop") {
        await b.cancelTurn();
      } else if (msg.type === "reconnect") {
        await b.reconnect();
      } else if (msg.type === "disconnect" || msg.type === "quit") {
        await b.disconnect();
      } else if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      } else if (msg.type === "permission_response") {
        const ok = b.resolveBrowserPermission(
          msg.id,
          msg.optionId || (msg.allow ? "allow-once" : "reject-once"),
        );
        ws.send(
          JSON.stringify({
            type: "permission_ack",
            id: msg.id,
            ok,
          }),
        );
      }
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  });

  ws.on("close", () => b.removeClient(ws));
});

// Static UI after all API routes (POST /api/* must not be swallowed).
// index: false — SPA HTML goes through sendIndexHtml so the WS token is injected.
app.use(express.static(path.join(ROOT, "client/dist"), { index: false }));
// Repo-Doku statisch ausliefern (z. B. docs/glyph-profile-diagrams.html) für die Buch-Taste.
app.use("/docs", express.static(path.join(ROOT, "docs"), { index: false }));
// SPA fallback for client-side routes (GET only)
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/ws")) return next();
  sendIndexHtml(req, res).catch((err) => next(err));
});

// Listen first so Dock / health checks work even while the agent is connecting.
httpServer.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `Port ${HOST}:${PORT} already in use — stop the other process or change PORT.`,
    );
    process.exit(1);
  }
  console.error("HTTP server error:", err);
  process.exit(1);
});

httpServer.listen(PORT, HOST, () => {
  console.log(
    `Glyph bridge → http://${HOST === "127.0.0.1" ? "localhost" : HOST}:${PORT}`,
  );
  console.log(`Build              → #${GLYPH_BUILD} · v${GLYPH_VERSION}`);
  console.log(
    `WebSocket          → ws://${HOST === "127.0.0.1" ? "localhost" : HOST}:${PORT}/ws`,
  );
  console.log(`Working directory  → ${WORK_CWD}`);
  console.log(`Uploads            → ${UPLOAD_DIR}`);
  console.log(`Grok connected     → ${seats.get("desk").connected}`);

  // Re-push OpenRouter models from bindings if agent is up but drifted
  // (agent restart loses hot-apply; bindings.json is source of truth).
  void syncModelsIfMismatch({
    stateDir: STATE_DIR,
    env: process.env,
  })
    .then((r) => {
      if (r?.applied) console.log("Models sync         → applied to glyph-agent");
      else if (r?.reason === "in_sync") console.log("Models sync         → in sync");
      else if (r?.reason === "agent_down")
        console.log("Models sync         → agent offline (apply on connect)");
    })
    .catch(() => {});

  // Ensure upload dir exists so the first attachment does not race mkdir.
  const logUploadCleanup = (r) => {
    if (r?.removed > 0) {
      console.log(
        `Uploads cleanup     → removed ${r.removed} file(s), freed ${r.freedBytes} B`,
      );
    }
  };
  ensureUploadDir()
    .then(() => cleanupUploads())
    .then(logUploadCleanup)
    .catch((err) => {
      console.error("Could not create/cleanup upload dir:", err);
    });

  // LaunchAgent KeepAlive can keep this process up for weeks — re-sweep hourly
  // so the 24h maxAge actually applies without a reboot. unref: don't block exit.
  const uploadCleanupTimer = setInterval(() => {
    void cleanupUploads()
      .then(logUploadCleanup)
      .catch((err) => console.error("Uploads cleanup failed:", err));
  }, 60 * 60 * 1000);
  if (typeof uploadCleanupTimer.unref === "function") {
    uploadCleanupTimer.unref();
  }

  // Connect ACP agent after the UI is already reachable.
  seats.get("desk").start().catch((err) => {
    console.error("Failed to start Grok bridge:", err);
    console.error(
      "Is `grok` on PATH and authenticated? Try: grok doctor / grok login",
    );
  });
});

async function shutdown() {
  await Promise.all(seats.all().map((b) => b.stop()));
  httpServer.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
