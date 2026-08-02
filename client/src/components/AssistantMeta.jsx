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

/** Beschriftetes Modell-Label (nur Anzeige-Normalisierung; nie Config als Quelle). */
function modelLabel(model) {
  const m = String(model || "");
  if (!m) return "unbekannt";
  // z. B. openai/gpt-5.6-luna → „GPT-5.6-Luna“ (kompakt)
  const short = m.split("/").pop().replace(/-/g, "-");
  return short || m;
}

/**
 * Baut die kompakte Zeile: {Recherche-Typ} · {Provider} / {Modell} · {Status}
 */
function buildCompact(trace) {
  const provider = trace.provider || "unbekannt";
  const model = modelLabel(trace.model);
  // Tool-Status ableiten
  const tcs = Array.isArray(trace.tool_calls) ? trace.tool_calls : [];
  const retrieval = trace.retrieval;
  let activity = "";
  let status = "erfolgreich";

  if (retrieval && Number(retrieval.selected) > 0) {
    activity = "Vault-Recall";
    status = `${retrieval.selected} Quellen verwendet`;
  } else if (tcs.length) {
    const names = tcs.map((t) => t.tool).filter(Boolean).join(", ");
    activity = names || "Tool";
    const anyErr = tcs.some((t) => t.status === "error");
    const anyEmpty = tcs.some((t) => t.tool === "WebSearch" && (t.result_length || 0) === 0);
    if (anyErr) status = "fehlgeschlagen";
    else if (anyEmpty) status = "kein verwertbares Ergebnis";
    else status = "erfolgreich";
  }

  let line = activity ? `${activity} · ${provider} / ${model} · ${status}` : `${provider} / ${model}`;
  if (trace.fallback_used) line += " · Fallback aktiv";
  return line;
}

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
                <b>Retrieval:</b> {trace.retrieval.type} · {trace.retrieval.status} ·{" "}
                {trace.retrieval.selected ?? 0} aus {trace.retrieval.candidates ?? 0} ·{" "}
                Schwelle {trace.retrieval.threshold ?? "?"}
                {Array.isArray(trace.retrieval.sources) && trace.retrieval.sources.length
                  ? ` · Quellen: ${trace.retrieval.sources.join(", ")}`
                  : ""}
              </li>
            )}
          </ul>
        </details>
      )}
    </div>
  );
}

export { AssistantMeta, buildCompact };
