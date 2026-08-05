/**
 * AssistantMeta — kompakte Modell-/Provider-/Tool-Statuszeile aus dem EFFEKTIVEN
 * Server-Trace (nie aus UI-Konfiguration). Vollständiger Trace einklappbar unter „Details“.
 *
 * Sicherheit: API-Keys/interne Prompts/sensible Request-Daten werden NIEMALS angezeigt.
 * Fehlende Metadaten → „unbekannt“ (nicht durch Config ersetzt).
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import { useState } from "react";
import { buildCompact, formatSteps, modelLabel } from "../utils/assistantTrace.js";

function AssistantMeta({ trace }) {
  const [open, setOpen] = useState(false);
  if (!trace || typeof trace !== "object") return null;
  const compact = buildCompact(trace);

  return (
    <div className="assistant-meta" data-testid="assistant-meta">
      <button
        type="button"
        className="assistant-meta-line"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="assistant-meta-dot" aria-hidden="true" />
        {compact}
        <span className="assistant-meta-toggle">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <details className="assistant-meta-details" open>
          <summary>Details (effektiver Trace)</summary>
          <ul className="assistant-meta-list">
            <li><b>Provider:</b> {trace.provider || "unbekannt"}</li>
            <li><b>Modell:</b> {modelLabel(trace.model)}</li>
            <li><b>Fallback:</b> {trace.fallback_used ? "ja" : "nein"}</li>
            <li><b>Request-ID:</b> {trace.request_id === "local" ? "lokal (keine externe ID)" : String(trace.request_id ?? "unbekannt")}</li>
            {Array.isArray(trace.tool_calls) && trace.tool_calls.length > 0 && (
              <li>
                <b>Tools:</b>
                <ul>
                  {trace.tool_calls.map((t, i) => (
                    <li key={i}>
                      {t.tool} · {t.status || "unbekannt"} · Länge {t.result_length ?? "?"}
                      {t.error ? ` · Fehler: ${String(t.error)}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {trace.retrieval && (
              <li>
                <b>Retrieval:</b> {trace.retrieval.type}
                {trace.retrieval.mode ? ` (${trace.retrieval.mode})` : ""} ·{" "}
                {trace.retrieval.status} ·{" "}
                {trace.retrieval.selected ?? 0} aus {trace.retrieval.candidates ?? 0} ·{" "}
                Schwelle {trace.retrieval.threshold ?? "?"}
                {Array.isArray(trace.retrieval.sources) && trace.retrieval.sources.length
                  ? ` · Quellen: ${trace.retrieval.sources.join(", ")}`
                  : ""}
              </li>
            )}
            {Array.isArray(trace.steps) && trace.steps.length > 0 && (
              <li>
                <b>Schritte:</b>
                <ul>
                  {formatSteps(trace.steps).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        </details>
      )}
    </div>
  );
}

export { AssistantMeta, buildCompact };
