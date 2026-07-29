/**
 * Unit tests: attachment helpers (names, wire format, data-transfer).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ATTACHMENTS_PER_MSG,
  attachmentDisplayName,
  dataTransferHasFiles,
  formatAttachmentSummary,
  formatBytes,
  isImageMime,
  toWireAttachments,
} from "../../client/src/utils/attachments.js";

describe("isImageMime", () => {
  it("detects image/*", () => {
    assert.equal(isImageMime("image/png"), true);
    assert.equal(isImageMime("application/pdf"), false);
    assert.equal(isImageMime(null), false);
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    assert.equal(formatBytes(500), "500 B");
    assert.equal(formatBytes(2048), "2.0 KB");
    assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
  });
});

describe("attachmentDisplayName", () => {
  it("keeps real filenames", () => {
    const f = { name: "error.png", type: "image/png" };
    assert.equal(attachmentDisplayName(f), "error.png");
  });

  it("names paste blobs", () => {
    const f = { name: "", type: "image/png" };
    const n = attachmentDisplayName(f);
    assert.match(n, /^paste-.+\.png$/);
  });
});

describe("formatAttachmentSummary", () => {
  it("summarizes names", () => {
    assert.equal(formatAttachmentSummary([{ name: "a.png" }]), "📎 a.png");
    assert.equal(
      formatAttachmentSummary([
        { name: "a" },
        { name: "b" },
        { name: "c" },
        { name: "d" },
      ]),
      "📎 a, b +2",
    );
  });
});

describe("toWireAttachments", () => {
  it("drops entries without path and caps count", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      name: `f${i}`,
      mimeType: "text/plain",
      size: 1,
      path: `/tmp/u/${i}`,
    }));
    const wire = toWireAttachments([{ name: "x" }, ...many]);
    assert.equal(wire.length, MAX_ATTACHMENTS_PER_MSG);
    assert.equal(wire[0].path, "/tmp/u/0");
    assert.ok(wire.every((a) => a.path));
  });
});

describe("dataTransferHasFiles", () => {
  it("checks Files type", () => {
    assert.equal(dataTransferHasFiles({ types: ["Files"] }), true);
    assert.equal(dataTransferHasFiles({ types: ["text/plain"] }), false);
    assert.equal(dataTransferHasFiles(null), false);
  });
});
