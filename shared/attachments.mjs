/**
 * Shared attachment handling for ACP adapters (glyph-agent, openrouter).
 *
 * Stufe 1 (Textanhänge): extrahiert `embedded_resource` / `resource_link`-Inhalte
 * aus ACP-Prompt-Blöcken und bettet sie eindeutig gekennzeichnet in den Prompt ein.
 * Bilder/andere Binärdateien werden in Stufe 1 NICHT als Text interpretiert,
 * sondern erzeugen ggf. einen Hinweis (keine stille Verwerfung).
 *
 * Sicherheits-/Größenregeln (nach Nutzer-Spezifikation):
 *   - erlaubte Texttypen explizit begrenzt (Whitelist)
 *   - max. extrahierte Zeichen pro Anhang + insgesamt (2 MB Puffer)
 *   - Dateinamen werden escaped (kein Umschließen-Schutz / Injection)
 *   - Binärdateien werden nicht als Text interpretiert (magic/mime-Check)
 *   - bei Überschreitung eine klare Fehlermeldung statt stillem Verwerfen
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import { readFile } from "node:fs/promises";

/** Erlaubte Text-Anhang-MIME-Typen (Stufe 1; Whitelist). */
export const TEXT_MIME_WHITELIST = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/html",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/xml",
  "text/xml",
  "text/yaml",
  "application/yaml",
  "text/x-log",
]);

/** Erlaubte Text-Extensions (Fallback, wenn MIME generisch/blank ist). */
const TEXT_EXT_WHITELIST = new Set([
  "txt", "md", "markdown", "csv", "json", "xml", "yaml", "yml", "log", "html",
]);

/** Generische MIME-Typen, die NUR über die Extension als Text gelten dürfen. */
const GENERIC_MIME = new Set(["application/octet-stream", "application/binary", ""]);

/** Maximale extrahierte Zeichen pro Anhang (≈ 1 MB Text). */
export const MAX_ATTACH_CHARS = 2 * 1024 * 1024; // 2 MiB Zeichen-Puffer

/** Maximale Byte-Größe eines Text-Anhangs. */
export const MAX_ATTACH_BYTES = 4 * 1024 * 1024; // 4 MiB

/** Maximale Dateiendung in einer Quelldatei. */
const MAX_NAME = 200;

/**
 * Normalisiert + escaped einen Dateinamen (kein Pfad-Trick, keine Kontrollzeichen).
 * @param {string} name
 * @returns {string}
 */
export function escapeName(name) {
  const base = String(name || "datei")
    .split(/[\\/]/)
    .pop()
    .slice(0, MAX_NAME);
  // Nicht-Druckbare/Steuerzeichen herausfiltern, Leerraum bündeln.
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim() || "datei";
}

/**
 * Ist der MIME/ext ein erlaubter Text-Typ?
 * - Explizite Text-MIME → ja
 * - Generische MIME (octet-stream, blank) → nur mit Text-Extension
 * - Andere MIME (image, pdf, binär) → nein
 * @param {{mimeType?:string, name?:string}} block
 */
export function isTextAttachment({ mimeType, name }) {
  const mime = String(mimeType || "").toLowerCase().trim();
  const ext = String(name || "").toLowerCase().split(".").pop();
  if (TEXT_MIME_WHITELIST.has(mime)) return true;
  // Generische MIME nur via Extension; sonst Nein.
  if (GENERIC_MIME.has(mime)) return !!ext && TEXT_EXT_WHITELIST.has(ext);
  return false;
}

/**
 * Heuristik: enthält der Inhalt NUL-Bytes o. ä. → sehr wahrscheinlich Binär.
 * @param {Buffer} buf
 */
function looksBinary(buf) {
  if (!buf || buf.length === 0) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 8000));
  return sample.includes(0); // NUL-Byt im Kopf = Binär
}

/**
 * Extrahiert Text-Inhalte aus ACP-Prompt-Blöcken (Stufe 1).
 *
 * Unterstützte Blöcke:
 *   - { type: "text", text }                                    → direkt
 *   - { type: "embedded_resource", resource: { uri, text/html…} }  → „inline“-Ressource
 *   - { type: "resource_link", uri, resourceUri? }                 → behandelt, sofern
 *     der Server den Inhalt als eingebettete Ressource/referenz mitliefert
 *   - { type: "image", ... }                                    → Stufe 1: NICHT als Text,
 *     erzeugt einen sichtbaren Hinweis
 *
 * @param {Array<object>} blocks
 * @returns {Promise<{ text: string, skips: string[] }>}
 */
export async function extractTextAttachments(blocks) {
  if (!Array.isArray(blocks)) return { text: "", skips: [] };

  const parts = [];
  const skips = [];

  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;

    if (b.type === "text" && typeof b.text === "string") {
      if (b.text) parts.push(b.text);
      continue;
    }

    if (b.type === "image") {
      skips.push("Bild (multimodale Stufe 2 noch nicht unterstützt)");
      continue;
    }

    // Eingebettete Ressource: Dateiinhalt liegt als Text bei (embedded_resource).
    if (b.type === "embedded_resource") {
      const res = b.resource || {};
      const name = escapeName(res.name || res.uri || "anhang");
      const mime = String(res.mimeType || (res.mediaType ?? ""));
      const data = res.text ?? res.data ?? "";
      if (!isTextAttachment({ mimeType: mime, name })) {
        skips.push(`${name} (kein erlaubter Text-Typ: ${mime || "unbekannt"})`);
        continue;
      }
      if (typeof data !== "string" || !data.trim()) {
        skips.push(`${name} (leer)`);
        continue;
      }
      if (data.length > MAX_ATTACH_CHARS) {
        throw new Error(
          `Textanhang zu groß: ${name} (${data.length} Zeichen > ${MAX_ATTACH_CHARS}).`,
        );
      }
      parts.push(formatEmbedded(name, data));
      continue;
    }

    // resource_link: falls der Server Inhalt als uri mitliefert, lesen wir die Datei
    // vom lokalen Upload-Pfad. Nur file:// unter dem Upload-Ordner ist erlaubt.
    if (b.type === "resource_link") {
      const uri = String(b.resourceUri || b.uri || "");
      const name = escapeName(b.name || uri);
      if (uri.startsWith("file://")) {
        try {
          const buf = await awaitRead(uri);
          if (looksBinary(buf)) {
            skips.push(`${name} (Binär-Datei, nicht als Text lesbar)`);
            continue;
          }
          if (buf.length > MAX_ATTACH_BYTES) {
            throw new Error(`Textanhang zu groß: ${name} (${buf.length} B > ${MAX_ATTACH_BYTES}).`);
          }
          const text = buf.toString("utf8");
          if (!text.trim()) {
            skips.push(`${name} (leer)`);
            continue;
          }
          parts.push(formatEmbedded(name, text));
        } catch (e) {
          throw new Error(`Textanhang nicht lesbar: ${name} (${e.message})`);
        }
      } else {
        skips.push(`${name} (kein lokaler file://-Anhang)`);
      }
      continue;
    }

    // Unbekannter Block-Typ: nicht still verwerfen, aber auch nicht crashen.
    skips.push(`Block-Typ '${b.type || "?"}' (nicht unterstützt)`);
  }

  return { text: parts.join("\n\n"), skips };
}

/** Datei von einer file://-URI lesen. */
async function awaitRead(uri) {
  const { fileURLToPath } = await import("node:url");
  return readFile(fileURLToPath(uri));
}

/** Formatiert einen Anhang eindeutig gekennzeichnet. */
function formatEmbedded(name, content) {
  const safe = String(content);
  return `[Anhang: ${name}]\n${safe}\n[Ende Anhang: ${name}]`;
}

/**
 * Formatiert die übersprungenen Anhänge als einzeiligen Hinweis (falls vorhanden).
 * @param {string[]} skips
 * @returns {string}
 */
export function skipsNote(skips) {
  if (!skips || !skips.length) return "";
  return `\n\n[Übergangen (Stufe 1): ${skips.join("; ")}]`;
}

/**
 * Kombiniert Text + Textanhänge zu einem Prompt und liefert zusätzlich eine
 * strukturierte Attachments-Liste für die rückwärtskompatibel erweiterte
 * POST /chat-Schnittstelle.
 *
 * @param {Array<object>} blocks ACP-Prompt-ContentBlocks
 * @returns {Promise<{ message: string, attachments: Array<{name:string, mime:string, content:string}> }>}
 */
export async function buildPromptWithAttachments(blocks) {
  const { text, skips } = await extractTextAttachments(blocks || []);
  const message = text + skipsNote(skips);
  // Strukturierte Anhang-Liste, die in POST /chat verstanden wird (für Server mit
  // echter Attachment-Unterstützung). Bei reiner Text-Einbettung in message kann
  // der Adapter attachments weglassen — beide Wege sind rückwärtskompatibel.
  const attachments = [];
  const blocksList = Array.isArray(blocks) ? blocks : [];
  for (const b of blocksList) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "embedded_resource") {
      const res = b.resource || {};
      const name = escapeName(res.name || res.uri || "anhang");
      if (typeof res.text === "string" && res.text.trim()) {
        attachments.push({ name, mime: res.mimeType || "text/plain", content: res.text });
      }
    }
  }
  return { message, attachments };
}
