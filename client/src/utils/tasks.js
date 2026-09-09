/**
 * Manuelle Aufgaben-Übergabe (Plan-Tab), getrennt von der Task-Freigabe.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */

export const TASK_HEADS = [
  ["", "Später festlegen"],
  ["grok", "Grok Build"],
  ["_code", "^_Code"],
  ["glyph-agent", "°_Agent"],
  ["codex", "Codex Build"],
];

export const TASK_STATUSES = {
  new: "neu",
  analysis: "Analyse",
  needs_input: "Rückfrage",
  ready_to_build: "bereit",
  building: "Bau",
  review: "Review",
  done: "fertig",
  blocked: "blockiert",
};

const TRIVIAL_TITLE = /^(test|hi|ok|ping|hallo|hey)[\s!.]*$/i;
const EVIDENCE_CLIP = 100;

/** Aufgabe nur mit Meldung und Antwort — sonst muss der Kontext rekonstruiert werden. */
export function hasHandoffPair({ prompt, answer } = {}) {
  return Boolean(String(prompt || "").trim() && String(answer || "").trim());
}

export function canCreateHandoff({ title, pass, prompt, answer } = {}) {
  return Boolean(
    String(title || "").trim() &&
      String(pass || "").trim() &&
      hasHandoffPair({ prompt, answer }),
  );
}

export function evidenceClip(text, limit = EVIDENCE_CLIP) {
  const one = String(text || "")
    .trim()
    .replace(/\s+/g, " ");
  const cap = Math.max(1, Number(limit) || EVIDENCE_CLIP);
  if (one.length <= cap) return one;
  return `${one.slice(0, cap - 1).trimEnd()}…`;
}

/** Titel der Übergabe: Nutzer-Prompt, nicht die Agent-Antwort. */
export function handoffTitleFrom(userMessage, message) {
  void message;
  const firstLine = (value) =>
    String(value || "")
      .trim()
      .split(/\n/)[0]
      .replace(/\s+/g, " ")
      .slice(0, 80);
  const user = firstLine(userMessage?.text);
  if (user && !TRIVIAL_TITLE.test(user)) return user;
  return "Aufgabe";
}

export function headLabel(id) {
  const hit = TASK_HEADS.find(([value]) => value === id);
  if (hit) return hit[1];
  return id || "kein Kopf";
}

export function statusLabel(status) {
  const key = String(status || "new");
  return TASK_STATUSES[key] || key;
}

export function formatTaskMeta(task) {
  const status = statusLabel(task?.status);
  const head = task?.target ? headLabel(task.target) : "kein Kopf";
  return `${status} · ${head}`;
}

export function cleanPass(value) {
  return String(value || "").trim().slice(0, 400);
}

export function cleanArtifact(value) {
  return String(value || "").trim().slice(0, 1000);
}

/** Fertig nur mit Pfad oder Ort. Chat-Belege zählen nicht. */
export function canMarkDone(task) {
  return Boolean(cleanArtifact(task?.artifact));
}

export function compactTrace(trace) {
  if (!trace || typeof trace !== "object") return {};
  const out = {};
  for (const key of ["provider", "model", "fallback_used", "request_id"]) {
    if (trace[key] != null && trace[key] !== "") out[key] = trace[key];
  }
  if (Array.isArray(trace.tool_calls)) {
    out.tool_calls = trace.tool_calls.slice(0, 24).map((t) => ({
      name: String(t?.name || t?.tool || "").slice(0, 80),
      status: String(t?.status || "").slice(0, 40),
    }));
  }
  if (Array.isArray(trace.steps)) {
    out.steps = trace.steps.slice(0, 40);
  }
  if (trace.retrieval && typeof trace.retrieval === "object") {
    const r = trace.retrieval;
    out.retrieval = {
      type: r.type,
      mode: r.mode,
      status: r.status,
      selected: r.selected,
      candidates: r.candidates,
      threshold: r.threshold,
      ...(Array.isArray(r.sources)
        ? { sources: r.sources.slice(0, 8).map(String) }
        : {}),
    };
  }
  return out;
}

export function sanitizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && typeof a === "object")
    .slice(0, 8)
    .map((a) => ({
      name: String(a.name || "").slice(0, 240),
      path: String(a.path || a.uri || "").slice(0, 1000),
      mimeType: String(a.mimeType || a.mime || "").slice(0, 80),
      size: Number(a.size) || 0,
    }))
    .filter((a) => a.name || a.path);
}

export function sanitizeEvidence({ prompt, answer, trace, attachments } = {}) {
  return {
    prompt: String(prompt || "").slice(0, 8000),
    answer: String(answer || "").slice(0, 16000),
    trace: compactTrace(trace),
    attachments: sanitizeAttachments(attachments),
  };
}

export function tasksEndpointError(json, status, fallback) {
  const err = String(json?.error || "");
  if (
    status === 404 ||
    /^not found$/i.test(err) ||
    /Cannot (GET|POST) \/api\/tasks/i.test(err) ||
    /Endpoint fehlt/i.test(err)
  ) {
    return "Aufgaben-API fehlt — glyph-agent neu starten.";
  }
  return err || fallback || "Aufgabe konnte nicht gespeichert werden";
}
