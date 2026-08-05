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

/** Sentinel, an dem die UI den Tool-Banner vom eigentlichen Antworttext trennt. */
export const STEP_BANNER_SENTINEL = "<!-- glyph-steps-end -->";

/**
 * Trennt den Grok-artigen Tool-Banner (wenn vorhanden) vom Antworttext.
 * @param {string} text Vollständiger Nachrichtentext (Banner + Antwort).
 * @returns {{banner: string, answer: string}}
 */
export function splitStepBanner(text) {
  const t = String(text || "");
  const idx = t.indexOf(STEP_BANNER_SENTINEL);
  if (idx < 0) return { banner: "", answer: t };
  // Banner = alles bis zum Sentinel (inkl. Zeilenumbruch davor), bereinigt.
  const banner = t.slice(0, idx).replace(/\n+$/g, "").trim();
  const answer = t.slice(idx + STEP_BANNER_SENTINEL.length).replace(/^\n+/, "");
  return { banner, answer };
}

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
 * Bevorzugt den neuen zweigeteilten Trace-Block `sources: {vault, web}` und fällt
 * auf das frühere Ableiten über `retrieval`/`tool_calls` zurück, wenn `sources`
 * fehlt (rückwärtskompatibel).
 *
 * @param {object} trace Effektiver Server-Trace.
 * @returns {string} Einzeilige kompakte Anzeige.
 */
export function buildCompact(trace) {
  const provider = trace.provider || "unbekannt";
  const model = modelLabel(trace.model);
  const tcs = Array.isArray(trace.tool_calls) ? trace.tool_calls : [];
  const retrieval = trace.retrieval;
  const sources = trace.sources;

  let activity = "";
  let status = "erfolgreich";

  if (sources && typeof sources === "object" && (sources.vault || sources.web)) {
    // --- Neuer zweigeteilter Trace (sources.vault / sources.web) ---
    const vault = sources.vault || { count: 0, status: "empty" };
    const web = sources.web;

    if (Number(vault.count) > 0 && !web) {
      activity = "Vault-Recall";
      status = `${vault.count} Quellen verwendet`;
    } else if (web) {
      // Web lief (current-Frage oder Vault unzureichend).
      activity = Number(vault.count) > 0 ? "Vault + Web" : "WebSearch";
      if (Number(web.count) > 0) status = "erfolgreich";
      else status = "kein verwertbares Ergebnis";
    } else if (Number(vault.count) === 0) {
      activity = "Vault-Recall";
      status = "keine Quellen gefunden";
    }
  } else {
    // --- Rückwärtskompatibel: altes Ableiten über retrieval / tool_calls ---
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
  }

  // Prefer chronological steps when present (B+ Step-Display).
  if (Array.isArray(trace.steps) && trace.steps.length > 0) {
    const chain = trace.steps
      .map((s) => s.step)
      .filter(Boolean)
      .join(" → ");
    if (chain) activity = chain;
  }

  let line = activity
    ? `${activity} · ${provider} / ${model} · ${status}`
    : `${provider} / ${model}`;
  if (trace.fallback_used) line += " · Fallback aktiv";
  return line;
}

/**
 * Formatiert steps[] für die Detail-Ansicht.
 * @param {Array<{step?:string,status?:string,detail?:string}>|undefined} steps
 * @returns {string[]}
 */
export function formatSteps(steps) {
  if (!Array.isArray(steps) || !steps.length) return [];
  return steps.map((s, i) => {
    const name = s.step || `step-${i + 1}`;
    const st = s.status || "?";
    const d = s.detail ? ` — ${s.detail}` : "";
    return `${i + 1}. ${name} (${st})${d}`;
  });
}
