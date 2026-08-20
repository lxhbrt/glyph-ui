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

/**
 * Findet das Ende eines JSON-Objekts ab `start` (`s[start] === "{"`),
 * mit String-/Escape-Awareness. Unvollständige Objekte → -1.
 * @param {string} s
 * @param {number} start
 * @returns {number}
 */
function endOfJsonObject(s, start) {
  if (s[start] !== "{") return -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Erkennt Tool-Aufruf-JSON, das Agenten fälschlich in den Fließtext streamen
 * (z. B. {"tool":"Grep","args":{...}} oder {"name":"ReadFile","arguments":{...}}).
 * @param {string} jsonStr
 * @returns {boolean}
 */
function looksLikeLeakedToolCall(jsonStr) {
  if (/"tool"\s*:/.test(jsonStr)) return true;
  if (
    /"name"\s*:\s*"[A-Za-z][\w./-]*"/.test(jsonStr) &&
    (/"args"\s*:/.test(jsonStr) || /"arguments"\s*:/.test(jsonStr))
  ) {
    return true;
  }
  return false;
}

/**
 * Entfernt geleakte Tool-Call-JSON-Objekte aus Antwort-Prosa.
 * Unvollständige Objekte (Streaming) bleiben stehen, bis sie geschlossen sind.
 * @param {string} text
 * @returns {string}
 */
export function stripLeakedToolCalls(text) {
  const s = String(text || "");
  if (!s.includes("{")) return s;

  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "{") {
      const end = endOfJsonObject(s, i);
      if (end > i) {
        const candidate = s.slice(i, end + 1);
        if (looksLikeLeakedToolCall(candidate)) {
          i = end + 1;
          // Kleber-Whitespace zwischen Dumps und Prosa entfallen lassen
          while (i < s.length && (s[i] === " " || s[i] === "\t")) i += 1;
          continue;
        }
      }
    }
    out += s[i];
    i += 1;
  }

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * Antwort-Lesespur: Banner abtrennen + geleakte Tool-JSON entfernen.
 * @param {string} text
 * @returns {{banner: string, answer: string}}
 */
export function cleanAssistantAnswer(text) {
  const { banner, answer } = splitStepBanner(text);
  return { banner, answer: stripLeakedToolCalls(answer) };
}

/** Beschriftetes Modell-Label (nur Anzeige-Normalisierung; nie Config als Quelle). */
export function modelLabel(model) {
  const m = String(model || "");
  if (!m) return "unbekannt";
  // z. B. openai/gpt-5.6-luna → „GPT-5.6-Luna“ (kompakt)
  return m.split("/").pop().replace(/-/g, "-") || m;
}

/**
 * Kurzes Modell-Kürzel für die Header-Badge (Mobile: lange IDs verschieben das Layout).
 * Volle ID bleibt im title-Attribut / in Details — hier nur Anzeige.
 *
 * Strategie: bekannte Familien → lesbare Kürzel; sonst erstes Token,
 * bei >8 Zeichen die ersten 4 Buchstaben (wie z. B. „deep“).
 *
 * @param {string|null|undefined} model Provider/Modell oder bare ID
 * @returns {string}
 */
export function shortModelLabel(model) {
  const raw = String(model || "").trim();
  if (!raw) return "—";
  const bare = (raw.includes("/") ? raw.split("/").pop() : raw) || raw;
  const s = bare.toLowerCase();

  // Längere Patterns zuerst.
  const rules = [
    [/grok[-_.]?4\.6/, "4.6"],
    [/grok[-_.]?4\.1/, "4.1"],
    [/grok[-_.]?4[-_.]?fast/, "4-fast"],
    [/grok[-_.]?4[-_.]?heavy/, "4-heavy"],
    [/grok[-_.]?3[-_.]?mini/, "3-mini"],
    [/grok[-_.]?4/, "4"],
    [/grok[-_.]?3/, "3"],
    [/grok[-_.]?2/, "2"],
    [/grok/, "Build"],
    [/deepseek[-_.]?v?4[-_.]?pro/, "DS-V4P"],
    [/deepseek[-_.]?v?4[-_.]?flash/, "DS-V4F"],
    [/deepseek[-_.]?v?3[-_.]?flash/, "DS-V3F"],
    [/deepseek[-_.]?r1/, "DS-R1"],
    [/deepseek[-_.]?chat/, "DS-Chat"],
    [/deepseek[-_.]?coder/, "DS-Coder"],
    [/deepseek/, "DS"],
    [/gpt-?4o[-_.]?mini/, "4o-mini"],
    [/gpt-?4o/, "GPT-4o"],
    [/gpt-?4\.?1/, "GPT-4.1"],
    [/gpt-?5\.?6/, "GPT-5.6"],
    [/gpt-?5/, "GPT-5"],
    [/claude[-_.]?sonnet/, "Sonnet"],
    [/claude[-_.]?opus/, "Opus"],
    [/claude[-_.]?haiku/, "Haiku"],
    [/claude/, "Claude"],
    [/gemini[-_.]?2\.?5[-_.]?pro/, "Gem-Pro"],
    [/gemini[-_.]?2\.?5[-_.]?flash/, "Gem-Flash"],
    [/gemini[-_.]?flash/, "Gem-Flash"],
    [/gemini/, "Gemini"],
    [/qwen/, "Qwen"],
    [/llama[-_.]?3/, "Llama3"],
    [/llama/, "Llama"],
    [/mistral/, "Mistral"],
    [/kimi/, "Kimi"],
  ];
  for (const [re, label] of rules) {
    if (re.test(s)) return label;
  }

  // Unbekannt: erstes Segment; wenn zu lang → 4 Zeichen (Nutzerwunsch).
  const token = bare.split(/[-_.]/)[0] || bare;
  if (token.length <= 8) return token;
  return token.slice(0, 4);
}

function isModelChainLabel(value) {
  const t = String(value || "");
  return t.includes("→") || t.includes(" -> ");
}

function modelBelongsToPair(id, primary, fallback) {
  const n = String(id || "").trim();
  if (!n) return false;
  const p = String(primary || "").trim();
  const fb = String(fallback || "").trim();
  if (n === p || (fb && n === fb)) return true;
  const short = shortModelLabel(n);
  if (p && short === shortModelLabel(p)) return true;
  if (fb && short === shortModelLabel(fb)) return true;
  return false;
}

/**
 * Welches Modell die Header-Pille zeigt: Session-Trace, sonst Live-Label
 * wenn es zum Primary/Reserve-Paar des Kopfs gehört, sonst Primary.
 * Keine Kette (Primary→Reserve) — °_Agent wie ^_Code.
 *
 * @param {{ primary?: string, fallback?: string, used?: string, liveLabel?: string }} src
 * @returns {string}
 */
export function resolveHudModel({ primary, fallback, used, liveLabel } = {}) {
  const p = String(primary || "").trim();
  const u = String(used || "").trim();
  if (u && !isModelChainLabel(u)) return u;
  const live = String(liveLabel || "").trim();
  if (live && !isModelChainLabel(live) && modelBelongsToPair(live, p, fallback)) {
    return live;
  }
  return p;
}

/**
 * Header-Pille: nur das eingesetzte Modell als Kürzel.
 * Primary→Reserve bleibt Config/Tooltip — nicht in der Pille.
 *
 * @param {string} primary
 * @param {string} [fallback]
 * @param {string} [used] Session-Trace
 * @param {string} [liveLabel] Health `models.active.label` (kein Paar)
 * @returns {string}
 */
export function modelHudText(primary, fallback, used, liveLabel) {
  return shortModelLabel(
    resolveHudModel({ primary, fallback, used, liveLabel }),
  );
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
