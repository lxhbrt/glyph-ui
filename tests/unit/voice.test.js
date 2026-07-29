/**
 * Unit tests: client voice helpers (Node built-in test runner).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { textForSpeech } from "../../client/src/utils/voice.js";

describe("textForSpeech", () => {
  it("returns empty for empty input", () => {
    assert.equal(textForSpeech(""), "");
    assert.equal(textForSpeech(null), "");
    assert.equal(textForSpeech(undefined), "");
  });

  it("strips fenced code blocks", () => {
    const out = textForSpeech("Vorher\n```js\nconst x = 1;\n```\nNachher");
    assert.match(out, /Vorher/);
    assert.match(out, /Nachher/);
    assert.doesNotMatch(out, /const x/);
  });

  it("unwraps inline code and links", () => {
    assert.equal(textForSpeech("Siehe `foo` und [docs](https://x.ai)"), "Siehe foo und docs");
  });

  it("strips markdown emphasis and headings", () => {
    const out = textForSpeech("## Titel\n**fett** und *kursiv*");
    assert.equal(out, "Titel\nfett und kursiv");
  });

  it("collapses excess blank lines", () => {
    const out = textForSpeech("a\n\n\n\nb");
    assert.equal(out, "a\n\nb");
  });
});
