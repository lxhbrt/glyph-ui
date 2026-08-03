/**
 * assistantTrace.js — Kompakte Modell-/Provider-/Tool-Statuszeile.
 *
 * Reine (pure) Funktionen ohne React/JSX, damit sie von der UI-Komponente
 * UND von Node-Unit-Tests direkt importiert werden können.
 *
 * Wichtig: Die Anzeige basiert AUSSCHLIESSLICH auf dem EFFEKTIVEN Server-Trace
 * (nie auf UI-Konfiguration). Fehlende Metadaten → „unbekannt“ (nie durch
 * Config-Werte ersetzt). API-Keys/interne Prompts/sensible Request-Daten
 * werden niemals übernommen — nur explizite Meta-Felder.
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */

/** Beschriftetes Modell-Label (nur Anzeige-Normalisierung; nie Config als Quelle). */
export function modelLabel(model) {
  const m = String(model || "");
  if (!m) return "unbekannt";
  // z. B. openai/gpt-5.6-luna → „GPT-5.6-Luna“ (kompakt)
  return m.split("/").pop().replace(/-/g, "-") || m;
}

/**
 * Baut die kompakte Zeile: {Aktivität} · {Provider} / {Modell} · {Status}
 * Status-Unterscheidung: nicht verwendet / erfolgreich / fehlgeschlagen /
 * kein verwertbares Ergebnis. fallback_used wird sichtbar angehängt.
 *
 * @param {object} trace Effektiver Server-Trace.
 * @returns {string} Einzeilige kompakte Anzeige.
 */
export function buildCompact(trace) {
  const provider = trace.provider || "unbekannt";
  const model = modelLabel(trace.model);
  const tcs = Array.isArray(trace.tool_calls) ? trace.tool_calls : [];
  const retrieval = trace.retrieval;

  let activity = "";
  let status = "erfolgreich";

  // Vault-Recall hat Vorrang in der Kennzeichnung der Aktivität.
  if (retrieval && Number(retrieval.selected) > 0) {
    activity = "Vault-Recall";
    status = `${retrieval.selected} Quellen verwendet`;
  } else if (tcs.length) {
    const names = tcs.map((t) => t.tool).filter(Boolean).join(", ");
    activity = names || "Tool";
    const anyErr = tcs.some((t) => t.status === "error");
    const anyEmpty = tcs.some(
      (t) => t.tool === "WebSearch" && (t.result_length || 0) === 0,
    );
    if (anyErr) status = "fehlgeschlagen";
    else if (anyEmpty) status = "kein verwertbares Ergebnis";
    else status = "erfolgreich";
  }

  let line = activity
    ? `${activity} · ${provider} / ${model} · ${status}`
    : `${provider} / ${model}`;
  if (trace.fallback_used) line += " · Fallback aktiv";
  return line;
}
