/**
 * Unit tests: shared ACP attachment helpers (text + images).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPromptWithAttachments,
  extractImages,
  isImageMime,
  toOpenAIImage,
} from "../../shared/attachments.mjs";

// Minimal valid 1×1 PNG (base64)
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("isImageMime", () => {
  it("allows png/jpeg/webp/gif", () => {
    assert.equal(isImageMime("image/png"), true);
    assert.equal(isImageMime("image/jpeg"), true);
    assert.equal(isImageMime("text/plain"), false);
  });
});

describe("toOpenAIImage", () => {
  it("builds data URI image_url", () => {
    const part = toOpenAIImage({ mimeType: "image/png", data: TINY_PNG_B64 });
    assert.equal(part.type, "image_url");
    assert.match(part.image_url.url, /^data:image\/png;base64,/);
  });

  it("rejects non-image mime", () => {
    assert.throws(() => toOpenAIImage({ mimeType: "application/pdf", data: TINY_PNG_B64 }));
  });
});

describe("extractImages", () => {
  it("reads ACP image blocks", () => {
    const { images, skips } = extractImages([
      { type: "image", mimeType: "image/png", data: TINY_PNG_B64 },
    ]);
    assert.equal(images.length, 1);
    assert.equal(skips.length, 0);
  });

  it("reads resource+blob image", () => {
    const { images } = extractImages([
      {
        type: "resource",
        resource: { mimeType: "image/png", blob: TINY_PNG_B64, name: "shot.png" },
      },
    ]);
    assert.equal(images.length, 1);
  });
});

describe("buildPromptWithAttachments", () => {
  it("does not mark images as unsupported skip", async () => {
    const built = await buildPromptWithAttachments([
      { type: "text", text: "Was siehst du?" },
      { type: "image", mimeType: "image/png", data: TINY_PNG_B64 },
    ]);
    assert.match(built.message, /Was siehst du/);
    assert.equal(built.images.length, 1);
    assert.doesNotMatch(built.message, /Stufe 2 noch nicht unterstützt/);
  });

  it("accepts ACP type resource for text", async () => {
    const built = await buildPromptWithAttachments([
      {
        type: "resource",
        resource: {
          uri: "file:///tmp/a.txt",
          mimeType: "text/plain",
          text: "hello from resource",
        },
      },
    ]);
    assert.match(built.message, /hello from resource/);
    assert.equal(built.attachments.length, 1);
  });
});
