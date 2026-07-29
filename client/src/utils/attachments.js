/**
 * Chat attachment helpers (upload + wire format).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/** Mirror server defaults (GLYPH_UI_MAX_ATTACHMENT / max 8). */
export const MAX_ATTACHMENTS_PER_MSG = 8;
export const DEFAULT_MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

/**
 * @param {File | Blob} file
 * @returns {Promise<string>} raw base64 (no data-URL prefix)
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const i = dataUrl.indexOf(",");
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
    };
    reader.onerror = () => reject(new Error("Datei lesen fehlgeschlagen"));
    reader.readAsDataURL(file);
  });
}

/** @param {string | undefined | null} mime */
export function isImageMime(mime) {
  return typeof mime === "string" && mime.startsWith("image/");
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Strip FileList / clipboard into a plain File array.
 * @param {FileList | File[] | null | undefined} list
 * @returns {File[]}
 */
export function collectFiles(list) {
  if (!list) return [];
  return Array.from(list).filter((f) => f instanceof File || f instanceof Blob);
}

/**
 * Files from a paste event (images from screenshots, etc.).
 * @param {DataTransfer | null | undefined} dataTransfer
 * @returns {File[]}
 */
export function filesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return [];
  if (dataTransfer.files?.length) {
    return collectFiles(dataTransfer.files);
  }
  const out = [];
  const items = dataTransfer.items;
  if (!items) return out;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f) out.push(f);
  }
  return out;
}

/** @param {DataTransfer | null | undefined} dt */
export function dataTransferHasFiles(dt) {
  if (!dt) return false;
  if (dt.types && typeof dt.types.includes === "function") {
    if (dt.types.includes("Files")) return true;
  }
  // Some browsers only expose files on drop
  return Boolean(dt.files?.length);
}

/**
 * Ensure pasted blobs without a name get a usable filename.
 * @param {File} file
 * @param {number} [index]
 * @returns {string}
 */
export function attachmentDisplayName(file, index = 0) {
  const raw = (file?.name || "").trim();
  if (raw && raw !== "image.png" && raw !== "blob") return raw;
  const mime = file?.type || "";
  let ext = "bin";
  if (mime === "image/png") ext = "png";
  else if (mime === "image/jpeg" || mime === "image/jpg") ext = "jpg";
  else if (mime === "image/webp") ext = "webp";
  else if (mime === "image/gif") ext = "gif";
  else if (mime === "application/pdf") ext = "pdf";
  else if (mime.startsWith("text/")) ext = "txt";
  else if (mime.includes("json")) ext = "json";
  const stamp = Date.now().toString(36);
  if (mime.startsWith("image/")) return `paste-${stamp}${index ? `-${index}` : ""}.${ext}`;
  return `file-${stamp}${index ? `-${index}` : ""}.${ext}`;
}

/**
 * @param {Array<{ name?: string }>} attachments
 * @returns {string}
 */
export function formatAttachmentSummary(attachments) {
  if (!attachments?.length) return "";
  const names = attachments.map((a) => a.name || "Datei");
  if (names.length === 1) return `📎 ${names[0]}`;
  if (names.length <= 3) return `📎 ${names.join(", ")}`;
  return `📎 ${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/**
 * Server wire format for WS chat / deep_search.
 * @param {Array<{ id?: string, name?: string, mimeType?: string, size?: number, path?: string, uri?: string }>} list
 */
export function toWireAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && a.path)
    .slice(0, MAX_ATTACHMENTS_PER_MSG)
    .map((a) => ({
      id: a.id != null ? String(a.id) : "",
      name: String(a.name || "file"),
      mimeType: String(a.mimeType || "application/octet-stream"),
      size: Number(a.size) || 0,
      path: String(a.path),
      ...(a.uri ? { uri: String(a.uri) } : {}),
    }));
}

/**
 * Upload files via POST /api/attachments (JSON + base64).
 *
 * @param {File[]} files
 * @param {{
 *   maxBytes?: number,
 *   maxCount?: number,
 *   alreadyCount?: number,
 * }} [opts]
 * @returns {Promise<{ attachments: Array<{ id: string, name: string, mimeType: string, size: number, path: string, uri?: string, previewUrl?: string }> }>}
 */
export async function uploadAttachmentFiles(files, opts = {}) {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES;
  const maxCount = opts.maxCount ?? MAX_ATTACHMENTS_PER_MSG;
  const already = opts.alreadyCount ?? 0;
  const room = Math.max(0, maxCount - already);
  if (!files?.length) {
    throw new Error("Keine Dateien");
  }
  if (room <= 0) {
    throw new Error(`Maximal ${maxCount} Anhänge pro Nachricht`);
  }

  const slice = files.slice(0, room);
  for (const f of slice) {
    if (f.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      throw new Error(
        `Zu groß: ${attachmentDisplayName(f)} (max ${mb} MB)`,
      );
    }
  }

  const payloadFiles = [];
  for (let i = 0; i < slice.length; i++) {
    const f = slice[i];
    const name = attachmentDisplayName(f, i);
    const mimeType = f.type || "application/octet-stream";
    const dataBase64 = await fileToBase64(f);
    payloadFiles.push({ name, mimeType, dataBase64 });
  }

  const res = await fetch("/api/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ files: payloadFiles }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Upload fehlgeschlagen (HTTP ${res.status})`);
  }
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (!attachments.length) {
    throw new Error("Upload: leere Antwort");
  }

  // Local image previews (server paths are not browser-readable)
  return {
    attachments: attachments.map((a, i) => {
      const f = slice[i];
      let previewUrl;
      if (f && isImageMime(f.type || a.mimeType)) {
        try {
          previewUrl = URL.createObjectURL(f);
        } catch {
          previewUrl = undefined;
        }
      }
      return {
        id: a.id,
        name: a.name || payloadFiles[i]?.name || "file",
        mimeType: a.mimeType || payloadFiles[i]?.mimeType || "application/octet-stream",
        size: a.size ?? f?.size ?? 0,
        path: a.path,
        uri: a.uri,
        ...(previewUrl ? { previewUrl } : {}),
      };
    }),
    truncated: files.length > room,
    room,
  };
}

/**
 * Revoke object URLs created for image previews.
 * @param {Array<{ previewUrl?: string }>} list
 */
export function revokeAttachmentPreviews(list) {
  if (!list?.length) return;
  for (const a of list) {
    if (a?.previewUrl) {
      try {
        URL.revokeObjectURL(a.previewUrl);
      } catch {
        /* ignore */
      }
    }
  }
}
