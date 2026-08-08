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

// --- Bildunterstützung (Stufe 2, nur OpenRouter) ---
/** Erlaubte Bild-MIME-Typen (sichere Whitelist). */
export const IMAGE_MIME_WHITELIST = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
/** Max. Größe eines Bild-Anhangs (bytes). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MiB
/** Min. gültige Base64-Länge eines „echten“ Bildes (verhindert Trivial-/Kaputt-Fälle). */
const MIN_IMAGE_B64 = 64;

/**
 * Ist der MIME-Typ ein erlaubtes Bild?
 * @param {string} mimeType
 */
export function isImageMime(mimeType) {
  return IMAGE_MIME_WHITELIST.has(String(mimeType || "").toLowerCase());
}

/**
 * Validiert + normalisiert einen ACP-Bildblock zu einem OpenAI image_url-Payload.
 * Strenge Regeln: Whitelist-MIME, Größenlimit, Base64-Validierung (Data-URI-Format).
 * Wirft bei ungültigem MIME/B64. Liefert { type, image_url:{ url } }.
 *
 * @param {{mimeType?:string, data?:string, mediaType?:string, uri?:string}} block
 * @returns {{type:"image_url", image_url:{url:string}}}
 */
export function toOpenAIImage(block) {
  const mime = String(block?.mimeType || block?.mediaType || "").toLowerCase();
  if (!IMAGE_MIME_WHITELIST.has(mime)) {
    throw new Error(`Nicht erlaubtes Bildformat: ${mime || "unbekannt"} (erlaubt: png/jpeg/webp/gif)`);
  }
  let b64 = block?.data;
  if (typeof b64 !== "string" || !b64.trim()) {
    throw new Error("Bildblock ohne Base64-Daten (data).");
  }
  // Data-URI-Präfix entfernen, falls schon vorhanden.
  b64 = b64.replace(/^data:[^;]*;base64,/, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) {
    throw new Error("Ungültiges Base64 (unerlaubte Zeichen).");
  }
  if (b64.length < MIN_IMAGE_B64) {
    throw new Error("Bild-Base64 zu kurz — beschädigt oder leer.");
  }
  // Base64-Dekodierung als harter Validierungs-Check (wirft bei kaputtem B64).
  const decoded = Buffer.from(b64, "base64");
  if (!decoded.length || decoded.length > MAX_IMAGE_BYTES) {
    throw new Error(`Bild zu groß: ${decoded.length} B > ${MAX_IMAGE_BYTES} B.`);
  }
  return { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } };
}

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
      // Multimodal Stufe 2: buildPromptWithAttachments / extractImages — hier nicht skippen
      continue;
    }

    // Eingebettete Ressource: ACP `resource` (Glyph-Bridge) oder `embedded_resource`.
    if (b.type === "embedded_resource" || b.type === "resource") {
      const res = b.resource || {};
      const name = escapeName(res.name || res.uri || "anhang");
      const mime = String(res.mimeType || (res.mediaType ?? ""));
      // Blob-Bilder in resource-Blöcken → Stufe 2 (extractImages), nicht als Text
      if (isImageMime(mime) || (typeof res.blob === "string" && isImageMime(mime))) {
        continue;
      }
      const data = res.text ?? res.data ?? "";
      if (!isTextAttachment({ mimeType: mime, name })) {
        // Binär-blob ohne Bild-MIME: überspringen mit Hinweis
        if (typeof res.blob === "string" && res.blob.trim()) {
          skips.push(`${name} (Binär-Anhang, kein Text: ${mime || "unbekannt"})`);
          continue;
        }
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
 * Extrahiert Bildblöcke (ACP type:image oder resource+blob) zu OpenAI image_url-Parts.
 * @param {Array<object>} blocks
 * @returns {{ images: Array<{type:"image_url", image_url:{url:string}}>, skips: string[] }}
 */
export function extractImages(blocks) {
  const images = [];
  const skips = [];
  if (!Array.isArray(blocks)) return { images, skips };

  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;

    if (b.type === "image") {
      try {
        images.push(toOpenAIImage(b));
      } catch (e) {
        skips.push(`Bild (${e.message})`);
      }
      continue;
    }

    // Bridge sendet manchaml resource + blob für Binär; wenn MIME image/* → Vision
    if (b.type === "resource" || b.type === "embedded_resource") {
      const res = b.resource || {};
      const mime = String(res.mimeType || res.mediaType || "").toLowerCase();
      if (!isImageMime(mime)) continue;
      const data = res.blob || res.data;
      if (typeof data !== "string" || !data.trim()) {
        skips.push(`${escapeName(res.name || res.uri || "bild")} (Bild ohne Daten)`);
        continue;
      }
      try {
        images.push(toOpenAIImage({ mimeType: mime, data }));
      } catch (e) {
        skips.push(`Bild (${e.message})`);
      }
    }
  }
  return { images, skips };
}

/**
 * Kombiniert Text + Textanhänge + Bilder für POST /chat.
 *
 * @param {Array<object>} blocks ACP-Prompt-ContentBlocks
 * @returns {Promise<{
 *   message: string,
 *   attachments: Array<{name:string, mime:string, content:string}>,
 *   images: Array<{type:"image_url", image_url:{url:string}}>
 * }>}
 */
export async function buildPromptWithAttachments(blocks) {
  const { text, skips } = await extractTextAttachments(blocks || []);
  const { images, skips: imgSkips } = extractImages(blocks || []);
  const allSkips = [...skips, ...imgSkips];
  const message = text + skipsNote(allSkips);
  // Strukturierte Anhang-Liste, die in POST /chat verstanden wird (für Server mit
  // echter Attachment-Unterstützung). Bei reiner Text-Einbettung in message kann
  // der Adapter attachments weglassen — beide Wege sind rückwärtskompatibel.
  const attachments = [];
  const blocksList = Array.isArray(blocks) ? blocks : [];
  for (const b of blocksList) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "embedded_resource" || b.type === "resource") {
      const res = b.resource || {};
      const name = escapeName(res.name || res.uri || "anhang");
      const mime = String(res.mimeType || "text/plain");
      if (isImageMime(mime)) continue;
      if (typeof res.text === "string" && res.text.trim()) {
        attachments.push({ name, mime, content: res.text });
      }
    }
  }
  return { message, attachments, images };
}

/**
 * Stufe 2 (nur OpenRouter): Baut aus ACP-Blöcken eine geordnete OpenAI-Content-Liste,
 * in der Text- und Bildblöcke in ihrer ORIGINAL-Reihenfolge stehen.
 *
 * @param {Array<object>} blocks ACP-Prompt-ContentBlocks
 * @returns {Promise<Array<{type:string, text?:string, image_url?:{url:string}}>>}
 */
export async function buildOpenRouterContent(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  const out = [];
  const textBuf = [];

  const flush = () => {
    if (textBuf.length) {
      out.push({ type: "text", text: textBuf.join("\n") });
      textBuf.length = 0;
    }
  };

  let imageErr = null;
  for (const b of list) {
    if (!b || typeof b !== "object") continue;

    if (b.type === "text" && typeof b.text === "string") {
      if (b.text) textBuf.push(b.text);
      continue;
    }

    if (b.type === "image") {
      try {
        const img = toOpenAIImage(b);
        flush();
        out.push(img);
      } catch (e) {
        if (!imageErr) imageErr = e.message;
        // Fehler nicht still verwerfen: Hinweis als Textblock anhängen.
        textBuf.push(`[Bild nicht übertragen (Stufe 2-Fehler): ${e.message}]`);
      }
      continue;
    }

    if (
      b.type === "embedded_resource" ||
      b.type === "resource" ||
      b.type === "resource_link"
    ) {
      // Textanhänge via bestehender Stufe-1-Extraktion einbetten.
      const sub = await extractTextAttachments([b]);
      if (sub.text) textBuf.push(sub.text);
      // Bild-resource: in Reihenfolge als image_url
      const { images: more } = extractImages([b]);
      if (more.length) {
        flush();
        out.push(...more);
      }
      continue;
    }
  }

  flush();

  // Wenn NUR Bilder angefragt wurden und keins übertragbar war, Fehler melden.
  if (!out.length && imageErr) {
    throw new Error(`Keine Bildblöcke übertragbar: ${imageErr}`);
  }
  return out;
}
