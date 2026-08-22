#!/usr/bin/env node
/**
 * glyph-agent-acp.mjs — ACP-Stdio-Adapter: Glyph (ACP-Client) <-> glyph-agent (lokal)
 *
 * Dünne Brücke: Glyph spricht ACP, glyph-agent liefert die Tool-Orchestrierung
 * über den lokalen HTTP-Dienst (POST /chat). Dieser Adapter hat KEINE Agentenlogik.
 *
 * Modi (Env GLYPH_AGENT_MODE):
 *   agent (Default) — Web + Cloud-Antwort; VaultFind nur bei UI-Toggle
 *   code            — ^_Code: Read/Write/Shell, Genehmigung via ACP; Modell aus Bindings
 *
 * Protokoll: ACP v1 über NDJSON-Stdio (acp.ndJsonStream).
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import { buildPromptWithAttachments } from "../shared/attachments.mjs";
import { createIdleTimer } from "./acpIdle.mjs";
import { buildStepBanner, formatThinkStep } from "./stepBanner.mjs";
import { agentVaultBodyFromMeta } from "./vaultFlags.mjs";
import { sliceMessagesBeforeUser } from "../shared/rewind.mjs";
import { cloneSessionStore } from "../shared/composerActions.mjs";

// glyph-agent HTTP-Dienst (Standard wie in server.py)
const AGENT_URL = process.env.GLYPH_AGENT_URL || "http://127.0.0.1:18899";
// Idle-Deadline eines session/prompt-Turns (kein Wall-Clock ab Start).
// Reset bei jedem NDJSON-Event; Pause während Glyph-Freigabe.
// CODE: Default 8 min ohne Aktivität; agent: 5 min.
// Server-seitig greift zusätzlich CODE_CHAT_TIMEOUT/CHAT_TIMEOUT pro LLM-Call.
const PROTOCOL_VERSION = acp.PROTOCOL_VERSION;
const AGENT_MODE = String(process.env.GLYPH_AGENT_MODE || "agent").toLowerCase();
const AGENT_NAME =
  process.env.GLYPH_AGENT_ACP_NAME ||
  (AGENT_MODE === "code" ? "^_Code" : "°_Agent");
const IS_CODE = AGENT_MODE === "code";
const TIMEOUT_MS = Number(
  process.env.GLYPH_AGENT_TIMEOUT || (IS_CODE ? 480000 : 300000),
);

// Grok-artige Stufen-/Tool-Anzeige im Chat-Text (Ausgabe).
// Standard: AN — zeigt vor der Antwort einen kompakten Block, welche Stufen der
// Agent durchlaufen hat (VaultFind/WebSearch/ExtractUrl) + Modell.
// Auf "0"/"false" setzen, um nur noch den reinen Antworttext zu sehen.
const SHOW_STEP_BANNER = !["0", "false", "off"].includes(
  String(process.env.GLYPH_AGENT_SHOW_STEPS || "1").toLowerCase().trim(),
);

// In-Memory Session-Speicher (Test/Zustand; ohne Langzeit-Persistenz)
const sessions = new Map();
let sessionCounter = 0;
const newSessionId = () =>
  `${IS_CODE ? "code" : "glyph-agent"}-${++sessionCounter}`;

async function streamChunks(text, client, sessionId, chunkSize = 400) {
  // Sequential agent_message_chunk stream (schema-valid ContentChunk only).
  // Must NOT use Promise.all — parallel notifies reorder/drop on stdio.
  // Must NOT send extra fields like `complete` — ACP schema rejects them.
  if (!text) return;
  for (let i = 0; i < text.length; i += chunkSize) {
    const c = text.slice(i, i + chunkSize);
    try {
      await client.notify(acp.methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: c },
        },
      });
    } catch {
      /* still stream remaining chunks */
    }
  }
}

/** Draft channel: prefixed so Glyph UI keeps it out of the primary answer track. */
const DRAFT_PREFIX = "⏺DRAFT⏺";
const DRAFT_CONT = "⏺DRAFT+⏺";

async function streamDraftChunks(text, client, sessionId, chunkSize = 1200) {
  if (!text) return;
  for (let i = 0; i < text.length; i += chunkSize) {
    const slice = text.slice(i, i + chunkSize);
    const prefixed = i === 0 ? `${DRAFT_PREFIX}${slice}` : `${DRAFT_CONT}${slice}`;
    try {
      await client.notify(acp.methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: prefixed },
        },
      });
    } catch {
      /* continue */
    }
  }
}

/**
 * Send effective server trace via ACP _meta (extensibility), not a fake
 * sessionUpdate type — `agent_message_complete` is not in the ACP schema and
 * the client SDK rejects it with Invalid params (-32602), which spammed logs
 * and blocked the live path for °_Agent / ^_Code.
 */
async function notifyAssistantMeta(client, sessionId, meta) {
  if (!meta || typeof meta !== "object" || !Object.keys(meta).length) return;
  try {
    await client.notify(acp.methods.client.session.update, {
      sessionId,
      _meta: { glyph: meta },
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "" },
        _meta: { glyph: meta },
      },
    });
  } catch {
    /* optional */
  }
}

// Sprach-Mapping für Live-Stufen (identisch zu stepBanner.mjs, hier lokal für die
// Chunk-Serialisierung ohne Import-Zyklus über die reine Funktion).
const STEP_MARKERS = {
  VaultFind: ["SearchVault", "suche im Obsidian-Vault (Arbeitssicherheit/HSEQ)"],
  VaultRecall: ["SearchVault", "suche im Obsidian-Vault (alias)"],
  VaultSearch: ["SearchVault", "suche im Obsidian-Vault (alias)"],
  WikiSearch: ["SearchVault", "suche im Vault/Wiki (alias)"],
  WikiGet: ["ReadNote", "liest Wiki-Notiz (alias)"],
  WikiApply: ["WriteNote", "wendet Wiki-Änderung an (alias)"],
  WikiStatus: ["WikiStatus", "Wiki-Status (agent-digest)"],
  WebSearch: ["SearchWeb", "suche im Internet (Exa, grob)"],
  ExtractUrl: ["Fetch", "rufe konkrete URL ab (TinyFish, fein)"],
  FetchUrl: ["Fetch", "rufe konkrete URL ab (TinyFish, fein)"],
  BrowseUrl: ["Browse", "URL-Zusammenfassung (TinyFish)"],
  ReadPdf: ["ReadPdf", "liest PDF aus dem Vault"],
  MailList: ["Mail", "listet E-Mails (himalaya)"],
  MailRead: ["Mail", "liest E-Mail (himalaya)"],
  MessageSend: ["MessageSend", "sendet Nachricht (openclaw)"],
  OpenRouter: [
    "Think",
    IS_CODE ? "^_Code" : "Cloud-Denker",
  ],
  ReadNote: ["ReadNote", "liest Notiz aus dem Vault"],
  Summarize: ["Summarize", "fasst Notiz zusammen"],
  CreateNote: ["WriteNote", "erstellt Notiz"],
  EditNote: ["WriteNote", "ändert Notiz"],
  ApplyEdit: ["WriteNote", "wendet Vault-Änderung an"],
  ListDir: ["ListDir", "listet Workspace-Verzeichnis"],
  ReadFile: ["ReadFile", "liest Datei im Workspace"],
  Grep: ["Grep", "sucht in Workspace-Dateien"],
  SearchReplace: ["SearchReplace", "ersetzt Text in Datei (1 Treffer)"],
  WriteFile: ["WriteFile", "schreibt Datei (Diff+Backup)"],
  RunCommand: ["RunCommand", "Shell (Whitelist)"],
};

function stepLabel(action) {
  const m = STEP_MARKERS[action] || [action, action];
  return m[0];
}

function renderStepStart(action, detail) {
  if (action === "OpenRouter") {
    return formatThinkStep(detail, { isCode: IS_CODE });
  }
  const m = STEP_MARKERS[action] || [action, action];
  const base = `${m[0]} · ${m[1]}`;
  return detail ? `${base} — ${detail}` : base;
}

function renderStepEnd(action, status, detail) {
  const label = stepLabel(action);
  if (status === "error") {
    return `${label} — fehlgeschlagen${detail ? `: ${detail}` : ""}`;
  }
  if (status === "done" && !detail) {
    return `${label} — erledigt`;
  }
  return `${label}${detail ? ` — ${detail}` : " — erledigt"}`;
}

// Einzelne Stufe als eigener ACP-Chunk mit Marker streamen (UI rendert sie als
// Live-Block). `⏺` = Stufe beginnt, `⏹` = Ergebnis/Status derselben Stufe.
function streamStepChunk(prefixedText, client, sessionId) {
  if (!prefixedText) return Promise.resolve();
  return streamChunks(prefixedText, client, sessionId, 2000);
}

/**
 * buildStepBanner liegt in stepBanner.mjs (pure Funktion, separat getestet) —
 * hier nur importiert und vor dem Antworttext eingefügt.
 */

const app = acp.agent({ name: AGENT_NAME });

app.onRequest(acp.methods.agent.initialize, async () => ({
  protocolVersion: PROTOCOL_VERSION,
  agentCapabilities: {
    loadSession: false,
    promptCapabilities: {
      // Stufe 1: Text (resource / embedded_resource / resource_link)
      // Stufe 2: Bilder → Direct Vision-Exp / OpenRouter (image_url data-URI)
      attachments: true,
      image: true,
      text: true,
    },
    sessionCapabilities: {
      fork: {},
    },
  },
  agentInfo: {
    name: AGENT_NAME,
    title: AGENT_NAME,
    version: IS_CODE ? "0.3.0-code" : "0.2.1",
  },
}));

app.onRequest(acp.methods.agent.authenticate, async () => ({}));
app.onRequest(acp.methods.agent.logout, async () => ({}));

app.onRequest(acp.methods.agent.session.new, async () => {
  const sessionId = newSessionId();
  // Grants leben in glyph-agent (code_grants), nicht als Session-Always.
  sessions.set(sessionId, { messages: [], allowWriteTools: false });
  return { sessionId };
});

app.onRequest(acp.methods.agent.session.list, async () => ({
  sessions: [...sessions.keys()].map((id) => ({
    id,
    path: null,
    title: null,
    updatedAt: Date.now(),
    additionalDirectories: [],
  })),
}));

// --- session/history (custom): aktiver In-Memory-Verlauf für Summarize ---
// ACP erfordert für custom-Methoden einen params-parser (3-Argument-onRequest).
app.onRequest(
  "session.history",
  (raw) => ({ sessionId: raw?.sessionId }),
  async ({ params }) => {
    const store = sessions.get(params.sessionId);
    if (!store) {
      const err = new Error(`Unbekannte oder beendete Session: ${params.sessionId}`);
      err.code = -32602;
      throw err;
    }
    return { sessionId: params.sessionId, messages: store.messages || [] };
  },
);

app.onRequest(acp.methods.agent.session.fork, async ({ params }) => {
  const sourceId = params?.sessionId;
  const store = sessions.get(sourceId);
  if (!store) {
    const err = new Error(`Unbekannte Session: ${sourceId}`);
    err.code = -32602;
    throw err;
  }
  const sessionId = newSessionId();
  sessions.set(sessionId, cloneSessionStore(store));
  return { sessionId };
});

app.onRequest(
  "session.rewind",
  (raw) => ({
    sessionId: raw?.sessionId,
    dropUserIndex: raw?.dropUserIndex,
  }),
  async ({ params }) => {
    const store = sessions.get(params.sessionId);
    if (!store) {
      const err = new Error(`Unbekannte oder beendete Session: ${params.sessionId}`);
      err.code = -32602;
      throw err;
    }
    const drop = Number(params.dropUserIndex);
    if (!Number.isInteger(drop) || drop < 0) {
      const err = new Error("dropUserIndex ungültig");
      err.code = -32602;
      throw err;
    }
    store.messages = sliceMessagesBeforeUser(store.messages || [], drop);
    return {
      sessionId: params.sessionId,
      dropUserIndex: drop,
      messages: store.messages,
    };
  },
);

app.onRequest(acp.methods.agent.session.close, async ({ params }) => {
  sessions.delete(params.sessionId);
  return {};
});

app.onRequest(acp.methods.agent.session.delete, async ({ params }) => {
  sessions.delete(params.sessionId);
  return {};
});

/**
 * Stream one /chat NDJSON response; returns { answerText, stepBlocks, trace, final }.
 */
async function streamChat(body, client, sessionId, signal, onActivity) {
  const resp = await fetch(`${AGENT_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    throw new Error(
      `glyph-agent HTTP ${resp.status} — läuft der lokale Dienst? (server.py)`,
    );
  }
  if (!resp.body) {
    throw new Error("glyph-agent: leerer Antwortstream (kein body).");
  }

  let answerText = "";
  const stepBlocks = [];
  let trace = null;
  let final = null;

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const raw = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!raw) continue;
      let ev;
      try {
        ev = JSON.parse(raw);
      } catch {
        continue;
      }
      const type = ev && ev.type;
      if (typeof onActivity === "function") {
        try {
          onActivity();
        } catch {
          /* idle arm */
        }
      }
      if (type === "step") {
        const action = ev.action || "step";
        const status = ev.status || "";
        const detail = ev.detail;
        if (status === "start") {
          const line = renderStepStart(action, detail);
          stepBlocks.push({ action, line });
          await streamStepChunk(`⏺STEP⏺${line}`, client, sessionId);
        } else {
          const line = renderStepEnd(action, status, detail);
          await streamStepChunk(`⏹STEP⏹${line}`, client, sessionId);
        }
      } else if (type === "draft") {
        // Zwischen-LLM → Protokoll (nie Primärspur).
        if (typeof ev.text === "string" && ev.text) {
          await streamDraftChunks(ev.text, client, sessionId);
        }
      } else if (type === "answer") {
        // Nur Final/Status. Replace, nicht append (ein answer pro Turn).
        if (typeof ev.text === "string" && ev.text) {
          answerText = ev.text;
          await streamChunks(ev.text, client, sessionId);
        }
      } else if (type === "pending_confirmation") {
        // Live-Hinweis: Genehmigung steht an (final kommt als done).
        const tool = ev.tool || "tool";
        await streamStepChunk(
          `⏺STEP⏺Permission · ${tool} wartet auf Freigabe`,
          client,
          sessionId,
        );
      } else if (type === "done" || type === "error") {
        final = ev;
        if (ev && typeof ev.trace === "object" && ev.trace !== null) trace = ev.trace;
        if (ev && typeof ev.answer === "string" && ev.answer && !answerText) {
          answerText = ev.answer;
          // done-only answers (z.B. pending_confirmation) noch streamen
          await streamChunks(ev.answer, client, sessionId);
        }
        if (type === "error" && !answerText) {
          answerText = `Fehler: ${ev.error || "unbekannt"}`;
          await streamChunks(answerText, client, sessionId);
        }
      }
    }
  }

  return { answerText, stepBlocks, trace, final };
}

function parseGrantOptionId(optionId) {
  const id = String(optionId || "");
  if (id === "allow-auftrag" || id === "allow_auftrag") {
    return { allowed: true, scope: "auftrag", spec: null };
  }
  if (id === "allow-once" || id === "allow_once") {
    return { allowed: true, scope: "once", spec: null };
  }
  if (id === "allow-always" || id === "allow_always") {
    return { allowed: true, scope: "auftrag", spec: null };
  }
  if (id === "allow-task" || id === "allow_task") {
    return { allowed: true, scope: "task", spec: null };
  }
  if (id.startsWith("allow-task:")) {
    try {
      const spec = JSON.parse(id.slice("allow-task:".length));
      return { allowed: true, scope: "task", spec };
    } catch {
      return { allowed: true, scope: "task", spec: null };
    }
  }
  return { allowed: false, scope: null, spec: null };
}

/**
 * Ask Glyph (ACP client) for permission.
 * Returns { allowed, scope, spec }.
 * Elevated: nur Einmal/Ablehnen. Sonst Einmal / Auftrag / Task — kein Session-Always.
 */
async function askPermission(client, sessionId, pending) {
  const tool = pending?.tool || "tool";
  const preview = String(pending?.preview || "").slice(0, 3500);
  const elevated = Boolean(pending?.elevated);
  const risk = String(pending?.risk || "").trim();
  const toolCallId = `code-${Date.now()}`;
  const title = elevated && risk ? `${tool} · ${risk}` : tool;
  const options = elevated
    ? [
        { optionId: "allow-once", name: "Einmal", kind: "allow_once" },
        { optionId: "reject-once", name: "Ablehnen", kind: "reject_once" },
      ]
    : [
        { optionId: "allow-once", name: "Einmal", kind: "allow_once" },
        { optionId: "allow-auftrag", name: "Für Auftrag", kind: "allow_always" },
        { optionId: "allow-task", name: "Für Task", kind: "allow_always" },
        { optionId: "reject-once", name: "Ablehnen", kind: "reject_once" },
      ];
  const grantMeta = {
    requires_grant: Boolean(pending?.requires_grant) || !elevated,
    outside_task: Boolean(pending?.outside_task),
    hint: pending?.hint || "",
    suggested: pending?.suggested || {},
    grant_scopes: pending?.grant_scopes || ["once", "auftrag", "task"],
    staged_count: pending?.staged_count || 0,
  };
  try {
    const res = await client.request(acp.methods.client.session.requestPermission, {
      sessionId,
      toolCall: {
        toolCallId,
        title,
        kind: tool === "RunCommand" ? "execute" : "edit",
        status: "pending",
        rawInput: { ...(pending?.args || {}), _grant: grantMeta },
        content: preview
          ? [{ type: "content", content: { type: "text", text: preview } }]
          : undefined,
      },
      options,
    });
    const outcome = res?.outcome;
    if (!outcome) return { allowed: false };
    if (outcome.outcome === "cancelled") return { allowed: false };
    if (outcome.outcome === "selected") {
      const parsed = parseGrantOptionId(outcome.optionId);
      if (elevated) {
        return {
          allowed: parsed.allowed && parsed.scope === "once",
          scope: "once",
          spec: null,
        };
      }
      return parsed;
    }
    return { allowed: false };
  } catch {
    return { allowed: false };
  }
}

// --- session/prompt: dünne Brücke zu glyph-agent /chat ---
app.onRequest(acp.methods.agent.session.prompt, async (ctx) => {
  const { params, signal, client } = ctx;
  const sessionId = params.sessionId;
  const store = sessions.get(sessionId);
  if (!store) {
    const err = new Error(`Unbekannte Session: ${sessionId}`);
    err.code = -32602;
    throw err;
  }

  // Text + Textanhänge + Bilder (Stufe 1 Text / Stufe 2 Vision image_url).
  const built = await buildPromptWithAttachments(params.prompt || []);
  store.messages.push({ role: "user", content: built.message });

  const abortController = new AbortController();
  let timedOut = false;
  const onAbort = () => abortController.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  // Idle, nicht Wall-Clock: lange Tool-Ketten bleiben lebendig, solange
  // der Stream Events schickt. Hängender /chat ohne Bytes → Abbruch.
  const idle = createIdleTimer({
    timeoutMs: TIMEOUT_MS,
    onFire: () => {
      timedOut = true;
      abortController.abort();
    },
  });
  idle.arm();

  try {
    // Multi-Turn: prior Turns mitschicken (store enthält die gerade gepushte
    // user-message bereits — Server dedupliziert, slice(0,-1) ist trotzdem sauber).
    const priorHistory = Array.isArray(store.messages)
      ? store.messages.slice(0, -1).map((m) => ({
          role: m?.role === "assistant" ? "assistant" : "user",
          content: typeof m?.content === "string" ? m.content : String(m?.content || ""),
        }))
      : [];
    const glyphMeta = params?._meta?.glyph || {};
    let body = {
      message: built.message,
      attachments: built.attachments,
      // OpenAI-style image_url parts (data: URLs) for vision models
      images: Array.isArray(built.images) ? built.images : [],
      mode: IS_CODE ? "code" : "agent",
      // Chat-Verlauf → glyph-agent (ohne Historie startet jeder Turn bei null)
      history: priorHistory,
      // Interactive °_Agent: Vault-Suche nur bei Toggle. Fehlt _meta → aus
      // (Jobs rufen /chat direkt auf und behalten den B+-Default).
      ...agentVaultBodyFromMeta(glyphMeta, { isCode: IS_CODE }),
      ...(glyphMeta.swarm === true ? { swarm: true } : {}),
    }

    let { answerText, stepBlocks, trace, final } = await streamChat(
      body,
      client,
      sessionId,
      abortController.signal,
      () => idle.arm(),
    );

    // CODE: Genehmigungsschleife — Write/Shell brauchen Grant (kein Session-Always).
    let guard = 0;
    while (
      IS_CODE &&
      final?.pending_confirmation &&
      final?.resume_token &&
      guard < 24
    ) {
      guard += 1;
      const pending = final.pending || {
        tool: "tool",
        args: {},
        preview: final.answer || "",
        elevated: false,
        risk: "",
      };
      if (final.pending) {
        pending.elevated = Boolean(final.pending.elevated);
        pending.risk = final.pending.risk || "";
        pending.preview = final.pending.preview || pending.preview;
        pending.tool = final.pending.tool || pending.tool;
        pending.args = final.pending.args || pending.args;
        pending.requires_grant = Boolean(final.pending.requires_grant);
        pending.outside_task = Boolean(final.pending.outside_task);
        pending.hint = final.pending.hint || "";
        pending.suggested = final.pending.suggested || {};
        pending.grant_scopes = final.pending.grant_scopes;
        pending.staged_count = final.pending.staged_count;
      }
      idle.pause();
      const decision = await askPermission(client, sessionId, pending);
      idle.arm();
      const allowed = Boolean(decision?.allowed);
      const why =
        decision?.scope === "task"
          ? "Task"
          : decision?.scope === "auftrag"
            ? "Auftrag"
            : decision?.scope === "once"
              ? "einmal"
              : "";
      await streamStepChunk(
        allowed
          ? `⏹STEP⏹Permission · ${pending.tool} freigegeben` +
              (why ? ` (${why})` : "")
          : `⏹STEP⏹Permission · ${pending.tool} abgelehnt`,
        client,
        sessionId,
      );
      const resume = await streamChat(
        {
          message: "",
          mode: "code",
          resume_token: final.resume_token,
          allow_pending: allowed,
          grant_scope: allowed ? decision.scope || "once" : undefined,
          grant_spec: allowed ? decision.spec || undefined : undefined,
        },
        client,
        sessionId,
        abortController.signal,
        () => idle.arm(),
      );
      // Fortsetzung anhängen (Antwort kann neu sein)
      if (resume.answerText) {
        // Wenn die erste Antwort nur der Freigabe-Hinweis war, ersetzen;
        // sonst anhängen.
        if (final.pending_confirmation && answerText === final.answer) {
          answerText = resume.answerText;
        } else {
          answerText = (answerText ? answerText + "\n\n" : "") + resume.answerText;
        }
      }
      stepBlocks = stepBlocks.concat(resume.stepBlocks || []);
      if (resume.trace) trace = resume.trace;
      final = resume.final;
      // Hard-error nach Allow: Schleife beenden
      if (final?.hard_error) break;
    }

    // Für Fallback-Clients ohne UI-Steps-Rendering: dünner Zusammenfassungs-Header
    // nur, wenn noch KEINE Live-Stufen gezeigt wurden UND ein Banner gewünscht ist.
    let displayText = answerText;
    if (stepBlocks.length === 0 && SHOW_STEP_BANNER && trace) {
      const banner = buildStepBanner({ trace, answer: answerText });
      if (banner) displayText = banner + answerText;
    }

    store.messages.push({ role: "assistant", content: displayText });

    // Effective server trace via ACP _meta (schema-valid). UI reads glyph.trace.
    const meta = {};
    if (trace) meta.trace = trace;
    if (final?.used_model) meta.used_model = final.used_model;
    if (final?.mode) meta.mode = final.mode;
    if (final?.hard_error) {
      meta.hardError = String(final.error || final.answer || "Code-Aktion fehlgeschlagen");
    }
    await notifyAssistantMeta(client, sessionId, meta);

    return { stopReason: "end_turn" };
  } catch (err) {
    if (err.name === "AbortError") {
      if (timedOut) {
        const secs = Math.round(TIMEOUT_MS / 1000);
        const msg =
          `Timeout nach ${secs}s ohne Stream — glyph-agent hängt ` +
          `(GLYPH_AGENT_TIMEOUT). Bitte erneut versuchen oder Server prüfen.`;
        try {
          await streamChunks(msg, client, sessionId);
          store.messages.push({ role: "assistant", content: msg });
        } catch {
          /* still */
        }
        return { stopReason: "end_turn" };
      }
      return { stopReason: "stop" };
    }
    throw err;
  } finally {
    idle.stop();
    signal.removeEventListener("abort", onAbort);
  }
});

// --- session/cancel notification ---
app.onNotification(acp.methods.agent.session.cancel, async () => {
  // Abbruch wird über das AbortSignal des laufenden prompt gehandhabt.
  return;
});

// --- Stdio-Verbindung aufspannen ---
// process.stdout/stdin sind Node-Streams; ndJsonStream braucht WHATWG-Web-Streams.
const stream = acp.ndJsonStream(
  Writable.toWeb(process.stdout),
  Readable.toWeb(process.stdin),
);

const connection = app.connect(stream);

// Fehler am Ende nicht stumm verschlucken
connection.closed.catch(() => {}).finally(() => {
  process.exit(0);
});
