/**
 * Wiki-Karte für Skill /merken — Vorlage + Ablehnregeln.
 * Agent füllt die Karte, zeigt sie, schreibt erst nach Chat-Ja.
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */

const TRIVIAL_TITLE_RE =
  /^(hi|hallo|hey|test|ok|danke|thanks|ping|yo|sup|help|hilfe|\?+|…+)$/i;

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isTrivialMerkenTitle(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return true;
  if (s.length < 8 && TRIVIAL_TITLE_RE.test(s)) return true;
  if (TRIVIAL_TITLE_RE.test(s)) return true;
  const tokens = s
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/i)
    .filter(Boolean);
  if (!tokens.length) return true;
  if (tokens.every((t) => TRIVIAL_TITLE_RE.test(t))) return true;
  if (tokens.length >= 2 && tokens.every((t) => t === tokens[0]) && tokens[0].length <= 8) {
    return true;
  }
  return false;
}

function hasPathOrBeleg(card) {
  const datei = String(card?.datei || "").trim();
  const beleg = String(card?.beleg || "").trim();
  return Boolean(datei || beleg);
}

function loesungStandalone(loesung) {
  const s = String(loesung || "").replace(/\s+/g, " ").trim();
  if (s.length < 12) return false;
  if (/wir haben (diskutiert|gesprochen|geredet)/i.test(s)) return false;
  if (/^(session|chat|verlauf)\b/i.test(s)) return false;
  return true;
}

/**
 * Wiki-Schicht: Karte nur schreiben, wenn Suchwert da ist.
 * @param {{ title?: string, aufgabe?: string, loesung?: string, datei?: string, beleg?: string, suchbegriffe?: string[] }} card
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function evaluateMerkenWikiCard(card = {}) {
  const title = String(card.title || card.aufgabe || "").trim();
  if (isTrivialMerkenTitle(title)) {
    return { ok: false, reason: "Titel trivial oder fehlt" };
  }
  if (!loesungStandalone(card.loesung)) {
    return { ok: false, reason: "Lösung gilt nicht ohne den Chat" };
  }
  if (!hasPathOrBeleg(card)) {
    return { ok: false, reason: "Weder Datei-Pfad noch Beleg-Seite" };
  }
  const tags = Array.isArray(card.suchbegriffe)
    ? card.suchbegriffe.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (tags.length < 1) {
    return { ok: false, reason: "Keine Suchbegriffe" };
  }
  return { ok: true };
}

/**
 * @param {{ title: string, aufgabe: string, loesung: string, datei?: string, beleg?: string, suchbegriffe?: string[] }} card
 * @returns {string}
 */
export function renderMerkenWikiCard(card) {
  const title = String(card.title || card.aufgabe || "").trim().slice(0, 80);
  const datei = String(card.datei || "").trim();
  const beleg = String(card.beleg || "").trim();
  const fileLine = datei
    ? `- Datei: \`${datei}\``
    : `- Beleg: \`${beleg}\``;
  const tags = (Array.isArray(card.suchbegriffe) ? card.suchbegriffe : [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .join(", ");
  return [
    `# ${title}`,
    "",
    `- Aufgabe: ${String(card.aufgabe || title).trim()}`,
    `- Lösung: ${String(card.loesung || "").trim()}`,
    fileLine,
    `- Suchbegriffe: ${tags}`,
    "",
  ].join("\n");
}
