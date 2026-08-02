#!/usr/bin/env node
/**
 * openrouter-acp.mjs — ACP-Stdio-Adapter: Glyph (ACP-Client) <-> OpenRouter (Cloud)
 *
 * Spawnt von Glyph als Agenten-Profil (bin: node, args: ["server/openrouter-acp.mjs"]).
 * Übersetzt ACP-Methoden (initialize, session/new, session/prompt, …) auf die
 * OpenRouter-API (https://openrouter.ai/api/v1) und streamt Antworten live zurück.
 *
 * Ziel: Alle OpenRouter-Modelle (u.a. fallback wenn Grok/Claude-Kontingent
 * ausgelaufen ist) direkt in Glyph nutzen — ohne eigenes Cloud-Abonnement.
 *
 * Protokoll: ACP v1 über NDJSON-Stdio (acp.ndJsonStream).
 * API-Key: via Umgebungsvariable OPENROUTER_API_KEY (wird dem Agenten-Profil
 * mitgegeben). Bei fehlendem Key wird eine verständliche Fehlermeldung geliefert.
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import { buildOpenRouterContent } from "../shared/attachments.mjs";

// --- Konfiguration (per Env überschreibbar) ---
const OPENROUTER_URL = process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1";
// Standard-Modell: DeepSeek V3 (gut im Preis-Leistungs-Verhältnis, offen).
// Überschreibbar z.B. mit "anthropic/claude-3.5-sonnet" oder "meta-llama/llama-3.3-70b-instruct".
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-5.6-luna";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const PROTOCOL_VERSION = acp.PROTOCOL_VERSION;

// --- In-Memory Session-Speicher (Test-Zwecke; ohne Persistenz) ---
// sessionId -> { messages: OpenAI-Konversationsformat }
const sessions = new Map();

// Kleine, stabile Session-ID (keine kryptographische Einmaligkeit nötig)
let sessionCounter = 0;
const newSessionId = () => `openrouter-${++sessionCounter}`;

// Hilfer: OpenAI-Rollen normalisieren
function toOpenAIRole(acpRole) {
  if (acpRole === "user" || acpRole === "assistant" || acpRole === "system") {
    return acpRole;
  }
  return "user";
}

// --- Agent-App aufbauen ---
const app = acp.agent({ name: "openrouter" });

app.onRequest(acp.methods.agent.initialize, async () => {
  return {
    protocolVersion: PROTOCOL_VERSION,
    agentCapabilities: {
      // Reiner Chat; Text- (Stufe 1) UND Bildanhänge (Stufe 2) werden verarbeitet.
      loadSession: false,
      promptCapabilities: {
        attachments: true,
        images: true, // Stufe 2: image_url-Base64 via OpenRouter
        text: true,
      },
      sessionCapabilities: {},
    },
    agentInfo: {
      name: "openrouter",
      version: "0.3.0",
    },
  };
});

// Authenticate: Key ist bereits per Env gesetzt -> leer
app.onRequest(acp.methods.agent.authenticate, async () => {
  return {};
});

app.onRequest(acp.methods.agent.logout, async () => {
  return {};
});

app.onRequest(acp.methods.agent.session.new, async ({ params }) => {
  const sessionId = newSessionId();
  sessions.set(sessionId, { messages: [] });
  return { sessionId };
});

app.onRequest(acp.methods.agent.session.list, async ({ params }) => {
  return {
    sessions: [...sessions.keys()].map((id) => ({
      id,
      path: null,
      title: null,
      updatedAt: Date.now(),
      additionalDirectories: [],
    })),
  };
});

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

// --- session/prompt: Kernstück. Streamt OpenRouter-Antwort live zurück. ---
app.onRequest(acp.methods.agent.session.prompt, async (ctx) => {
  const { params, signal, client } = ctx;
  const sessionId = params.sessionId;
  const store = sessions.get(sessionId);

  if (!store) {
    const err = new Error(`Unbekannte Session: ${sessionId}`);
    err.code = -32602;
    throw err;
  }

  // API-Key prüfen, bevor wir irgendetwas anfragen
  if (!OPENROUTER_API_KEY) {
    const err = new Error(
      "OpenRouter-API-Key fehlt. Bitte OPENROUTER_API_KEY in der Glyph-Umgebung setzen (siehe agents.js)."
    );
    err.code = -32603;
    await client.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "⚠️ Kein OpenRouter-API-Key gesetzt (OPENROUTER_API_KEY).",
        },
      },
    });
    throw err;
  }

  // Nutzer-Content aus ACP-Blöcken bauen (Stufe 2: Text+Bilder geordnet).
  // buildOpenRouterContent erzeugt eine OpenAI-Content-Liste, die BILDER als
  // image_url-Daten-URIs enthält — dieser Payload geht exakt so an OpenRouter.
  const userContent = await buildOpenRouterContent(params.prompt);

  // Neue Nutzer-Nachricht anhängen (content kann String ODER Array sein).
  store.messages.push({ role: "user", content: userContent });

  // OpenAI-Anfrage aufbauen (inkl. der neuen User-Nachricht, Kontext auf letzte 20)
  const openaiMessages = store.messages
    .slice(-20)
    .map((m) => ({ role: toOpenAIRole(m.role), content: m.content }));

  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  signal.addEventListener("abort", onAbort, { once: true });

  let fullText = "";
  let stopped = false;

  try {
    const response = await fetch(`${OPENROUTER_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: openaiMessages,
        stream: true,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `OpenRouter-Fehler (HTTP ${response.status}): ${detail}`.trim()
      );
    }

    if (!response.body) {
      throw new Error("OpenRouter hat keinen Response-Body geliefert.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // OpenRouter streamt SSE-Zeilen an OpenRouter-Abfragen als "data: {…}"
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        // Stream-Ende: "[DONE]"
        if (payload === "[DONE]") {
          stopped = true;
          break;
        }

        let chunk;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }

        const delta = chunk?.choices?.[0]?.delta?.content;
        if (delta && !stopped) {
          fullText += delta;
          // Live-Stream an Glyph
          try {
            await client.notify(acp.methods.client.session.update, {
              sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: delta },
              },
            });
          } catch (e) {
            console.error("[openrouter-acp] notify-Fehler:", e?.message || e);
          }
        }
      }
    }
  } catch (err) {
    signal.removeEventListener("abort", onAbort);
    if (err.name === "AbortError") {
      // Abbruch: fertige Teile zurückschreiben (falls vorhanden)
      if (fullText) store.messages.push({ role: "assistant", content: fullText });
      return { stopReason: "cancelled" };
    }
    throw err;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }

  // Antwort im Session-Speicher sichern (Kontext für Folgefragen)
  if (fullText) store.messages.push({ role: "assistant", content: fullText });

  const stopReason = stopped ? "end_turn" : "end_turn";
  return { stopReason };
});

// --- session/cancel notification ---
app.onNotification(acp.methods.agent.session.cancel, async ({ params }) => {
  // Abbruch wird über den AbortSignal des laufenden prompt gehandhabt.
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
