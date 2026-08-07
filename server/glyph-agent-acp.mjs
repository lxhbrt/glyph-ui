#!/usr/bin/env node
/**
 * glyph-agent-acp.mjs — ACP-Stdio-Adapter: Glyph (ACP-Client) <-> glyph-agent (lokal)
 *
 * Dünne Brücke: Glyph spricht ACP, glyph-agent liefert die Tool-Orchestrierung
 * über den lokalen HTTP-Dienst (POST /chat). Dieser Adapter hat KEINE Agentenlogik.
 *
 * Modi (Env GLYPH_AGENT_MODE):
 *   agent (Default) — VaultFind + Web + Cloud-Antwort
 *   code            — ^_Code: DeepSeek + Read/Write/Shell, Genehmigung via ACP
 *
 * Protokoll: ACP v1 über NDJSON-Stdio (acp.ndJsonStream).
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import { buildPromptWithAttachments } from "../shared/attachments.mjs";
import { buildStepBanner } from "./stepBanner.mjs";

// glyph-agent HTTP-Dienst (Standard wie in server.py)
const AGENT_URL = process.env.GLYPH_AGENT_URL || "http://127.0.0.1:18899";
// Wall-Clock für einen session/prompt-Turn (inkl. CODE-Genehmigungsschleife).
// CODE: Default 8 min (mehrere DeepSeek-Runden); agent: 5 min.
// Server-seitig greift zusätzlich CODE_CHAT_TIMEOUT/CHAT_TIMEOUT pro LLM-Call.
const PROTOCOL_VERSION = acp.PROTOCOL_VERSION;
const AGENT_MODE = String(process.env.GLYPH_AGENT_MODE || "agent").toLowerCase();
const AGENT_NAME =
  process.env.GLYPH_AGENT_ACP_NAME ||
  (AGENT_MODE === "code" ? "^_Code" : "glyph-agent");
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

function streamChunks(text, client, sessionId, chunkSize = 400) {
  // Zerlegt die Antwort in Chunks und sendet sie als agent_message_chunk,
  // damit Glyph (wie bei Ollama-Stream) zeichenweise aufbauen kann.
  if (!text) return Promise.resolve();
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return Promise.all(
    chunks.map(async (c, idx) => {
      try {
        await client.notify(acp.methods.client.session.update, {
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: c },
            complete: idx === chunks.length - 1,
          },
        });
      } catch (e) {
        // still
      }
    })
  );
}

// Sprach-Mapping für Live-Stufen (identisch zu stepBanner.mjs, hier lokal für die
// Chunk-Serialisierung ohne Import-Zyklus über die reine Funktion).
const STEP_MARKERS = {
  VaultFind: ["SearchVault", "suche im Obsidian-Vault (Arbeitssicherheit/HSEQ)"],
  VaultRecall: ["SearchVault", "suche im Obsidian-Vault (alias)"],
  VaultSearch: ["SearchVault", "suche im Obsidian-Vault (alias)"],
  WebSearch: ["SearchWeb", "suche im Internet (Exa, grob)"],
  ExtractUrl: ["Fetch", "rufe konkrete URL ab (TinyFish, fein)"],
  FetchUrl: ["Fetch", "rufe konkrete URL ab (TinyFish, fein)"],
  OpenRouter: [
    "Think",
    IS_CODE ? "DeepSeek CODE (OpenRouter)" : "Cloud-Denker (OpenRouter)",
  ],
  ReadNote: ["ReadNote", "liest Notiz aus dem Vault"],
  Summarize: ["Summarize", "fasst Notiz zusammen"],
  CreateNote: ["WriteNote", "erstellt Notiz"],
  EditNote: ["WriteNote", "ändert Notiz"],
  ListDir: ["ListDir", "listet Workspace-Verzeichnis"],
  ReadFile: ["ReadFile", "liest Datei im Workspace"],
  WriteFile: ["WriteFile", "schreibt Datei (Diff+Backup)"],
  RunCommand: ["RunCommand", "Shell (Whitelist)"],
};

function stepLabel(action) {
  const m = STEP_MARKERS[action] || [action, action];
  return m[0];
}

function renderStepStart(action, detail) {
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
      // Stufe 1: Textanhänge werden vom Adapter verarbeitet (embedded_resource,
      // resource_link). Bilder folgen als multimodale Stufe 2.
      attachments: true,
      text: true,
    },
    sessionCapabilities: {},
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
  sessions.set(sessionId, { messages: [] });
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
async function streamChat(body, client, sessionId, signal) {
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
      } else if (type === "answer") {
        if (typeof ev.text === "string" && ev.text) {
          answerText += ev.text;
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

/**
 * Ask Glyph (ACP client) for permission; returns true if allow_once/allow_always.
 */
async function askPermission(client, sessionId, pending) {
  const tool = pending?.tool || "tool";
  const preview = String(pending?.preview || "").slice(0, 3500);
  const toolCallId = `code-${Date.now()}`;
  try {
    const res = await client.request(acp.methods.client.session.requestPermission, {
      sessionId,
      toolCall: {
        toolCallId,
        title: tool,
        kind: tool === "RunCommand" ? "execute" : "edit",
        status: "pending",
        rawInput: pending?.args || {},
        content: preview
          ? [{ type: "content", content: { type: "text", text: preview } }]
          : undefined,
      },
      options: [
        { optionId: "allow-once", name: "Einmal erlauben", kind: "allow_once" },
        { optionId: "reject-once", name: "Ablehnen", kind: "reject_once" },
      ],
    });
    const outcome = res?.outcome;
    if (!outcome) return false;
    if (outcome.outcome === "cancelled") return false;
    if (outcome.outcome === "selected") {
      const id = outcome.optionId || "";
      return id === "allow-once" || id === "allow-always" || id === "allow_once" || id === "allow_always";
    }
    return false;
  } catch {
    return false;
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

  // Text + Textanhänge aus ACP-Blöcken extrahieren (Stufe 1).
  // Bilder/Binär => Hinweis im skips (keine stille Verwerfung).
  const built = await buildPromptWithAttachments(params.prompt || []);
  store.messages.push({ role: "user", content: built.message });

  const abortController = new AbortController();
  let timedOut = false;
  const onAbort = () => abortController.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  // Hartes Wall-Clock-Cancel: TIMEOUT_MS war definiert, aber unbenutzt —
  // ohne Timer wartet Glyph ewig, wenn der Agent-Stream hängt.
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, TIMEOUT_MS);

  try {
    let body = {
      message: built.message,
      attachments: built.attachments,
      mode: IS_CODE ? "code" : "agent",
    };

    let { answerText, stepBlocks, trace, final } = await streamChat(
      body,
      client,
      sessionId,
      abortController.signal,
    );

    // CODE: Genehmigungsschleife (WriteFile / RunCommand)
    let guard = 0;
    while (
      IS_CODE &&
      final?.pending_confirmation &&
      final?.resume_token &&
      guard < 8
    ) {
      guard += 1;
      const pending = final.pending || {
        tool: "tool",
        args: {},
        preview: final.answer || "",
      };
      const allowed = await askPermission(client, sessionId, pending);
      await streamStepChunk(
        allowed
          ? `⏹STEP⏹Permission · ${pending.tool} freigegeben`
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
        },
        client,
        sessionId,
        abortController.signal,
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
    }

    // Für Fallback-Clients ohne UI-Schritt-Rendering: dünner Zusammenfassungs-Header
    // nur, wenn noch KEINE Live-Stufen gezeigt wurden UND ein Banner gewünscht ist.
    let displayText = answerText;
    if (stepBlocks.length === 0 && SHOW_STEP_BANNER && trace) {
      const banner = buildStepBanner({ trace, answer: answerText });
      if (banner) displayText = banner + answerText;
    }

    store.messages.push({ role: "assistant", content: displayText });

    // Abschluss als finales Ergebnis signalisieren (inkl. effektivem Server-Trace als
    // Metadaten, damit die UI Provider/Modell/Tool-Status aus dem ECHTEN Server anzeigt,
    // nicht aus der UI-Konfiguration).
    try {
      const meta = {};
      if (trace) {
        meta.trace = trace;
      }
      if (final?.used_model) meta.used_model = final.used_model;
      if (final?.mode) meta.mode = final.mode;
      await client.notify(acp.methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "agent_message_complete",
          message: {
            role: "assistant",
            content: [{ type: "text", text: displayText }],
            ...(Object.keys(meta).length ? { metadata: meta } : {}),
          },
        },
      });
    } catch (e) {
      // optional
    }

    return { stopReason: "end_turn" };
  } catch (err) {
    if (err.name === "AbortError") {
      if (timedOut) {
        const secs = Math.round(TIMEOUT_MS / 1000);
        const msg =
          `Timeout nach ${secs}s — glyph-agent hat nicht rechtzeitig geantwortet ` +
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
    clearTimeout(timeoutTimer);
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
