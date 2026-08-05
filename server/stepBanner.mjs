/**
 * stepBanner.mjs — Reine (pure) Funktion: Grok-artiger Stufen-Banner für den
 * glyph-agent-Chattext (Ausgabe).
 *
 * Holt die Stufen NICHT aus der UI-Config, sondern aus dem ECHTEN Server-Trace
 * (steps[] + provider/model). Wird von glyph-agent-acp.mjs vor dem eigentlichen
 * Antworttext eingefügt, damit die Tool-/Denk-Stufen textlich sichtbar im Chat
 * stehen (analog zu Groks „Tool“/„Think“-Blöcken).
 *
 * Bewusst ohne React/JSX/Seiteneffekte, damit sie direkt aus Node-Tests
 * importiert werden kann. Keine API-Keys/interne Prompts in der Ausgabe.
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */

// Sprach-Mapping: Tool-Schrittname → [sichtbares Label, verständliche Aktion].
const STEP_LABELS = {
  VaultFind: ["SearchVault", "suche im Obsidian-Vault (Arbeitssicherheit/HSEQ)"],
  VaultRecall: ["SearchVault", "suche im Obsidian-Vault (alias)"],
  VaultSearch: ["SearchVault", "suche im Obsidian-Vault (alias)"],
  WebSearch: ["SearchWeb", "suche im Internet (Exa, grob)"],
  ExtractUrl: ["Fetch", "rufe konkrete URL ab (TinyFish, fein)"],
  FetchUrl: ["Fetch", "rufe konkrete URL ab (TinyFish, fein)"],
  ReadNote: ["ReadNote", "liest Notiz aus dem Vault"],
  Summarize: ["Summarize", "fasst Notiz zusammen"],
  CreateNote: ["WriteNote", "erstellt Notiz"],
  EditNote: ["WriteNote", "ändert Notiz"],
};

/**
 * Baut den Grok-artigen Stufen-Banner aus dem Server-Trace.
 *
 * Format (eine Zeile je Stufe):
 *   Tool · <Label> — <Aktion><Ergebnis-Zusatz>
 * Dann eine Modell-Zeile + Trennlinie; der eigentliche Antworttext folgt danach.
 *
 * steps[] (aus core/tool_loop.py) enthalten {step, status, detail}. Bekannte
 * Namen werden übersetzt, unbekannte roh übernommen. Die Schritte „LLM“ und
 * „answer“ sind keine Werkzeuge und werden NICHT als Tool-Block ausgegeben;
 * stattdessen fließt das Modell in die OpenRouter-Zeile ein.
 *
 * @param {object} data Antwort des glyph-agent-Servers ({answer, trace:{steps, provider, model, ...}}).
 * @returns {string} Banner-Text; leer, wenn keine Schritte vorliegen.
 */
export function buildStepBanner(data) {
  const trace = data && typeof data.trace === "object" ? data.trace : null;
  const steps = trace && Array.isArray(trace.steps) ? trace.steps : [];
  if (!steps.length) return "";

  const lines = [];
  for (const s of steps) {
    const name = (s && s.step) || "";
    if (!name || name === "LLM" || name === "answer") continue; // keine Tool-Stufe
    const status = (s && s.status) || "";
    const detail = (s && s.detail && String(s.detail)) || "";
    const [label, action] = STEP_LABELS[name] || [name, name];

    // Ergebnis-Zusatz menschenlesbar: leer → „nichts gefunden“, Fehler → „fehlgeschlagen“,
    // sonst Detailtext (z.B. „grob/exa · 3 Treffer“) anhängen.
    let resultTxt = "";
    if (status === "empty") resultTxt = " — nichts gefunden";
    else if (status === "error") resultTxt = " — fehlgeschlagen";
    else if (detail) resultTxt = ` — ${detail}`;

    lines.push(`Tool · ${label} — ${action}${resultTxt}`);
  }

  if (!lines.length) return "";

  // Modell-/OpenRouter-Zeile aus dem echten Trace.
  const provider = trace.provider || "OpenRouter";
  const model = trace.model || "unbekannt";
  const openrouter = `OpenRouter · ${provider === "openrouter" ? "OpenRouter" : provider} / ${model}`;

  // Endet mit einem Markierer, damit die UI den Tool-Block sauber vom
  // eigentlichen Antworttext trennen und separat stylen kann (dunkler/kleiner).
  return `${lines.join("\n")}\n${openrouter}\n<!-- glyph-steps-end -->\n\n`;
}
