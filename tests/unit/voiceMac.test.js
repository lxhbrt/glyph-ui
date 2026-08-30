/**
 * Unit tests: server voice.js — macOS-TTS-Integration (say + afconvert).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const voicePath = new URL("../../server/voice.js", import.meta.url).href;

// voice.js cached probe results — frischer Import pro Test-Datei ok.
const { voiceStatus, textToSpeech, listVoices } = await import(voicePath);

const hasSay = fs.existsSync("/usr/bin/say");
const hasAfconvert = fs.existsSync("/usr/bin/afconvert");
const isMac = process.platform === "darwin";

describe("macOS TTS (voice.js)", () => {
  it("voiceStatus meldet mac-Fallback auf macOS", async () => {
    const s = await voiceStatus();
    assert.ok(typeof s.available === "boolean");
    assert.ok(s.mac, "voiceStatus.mac fehlt");
    if (isMac && hasSay) {
      assert.equal(s.mac.available, true);
      assert.ok(s.mac.voice, "mac.voice leer");
    }
  });

  it(
    "textToSpeech liefert Audio (mac oder cloud), egal ob Keys da sind",
    { skip: !isMac || !hasSay },
    async () => {
      const t = await textToSpeech("Kurzer Testsatz für Glyph.", { language: "de" });
      assert.ok(t.buffer && t.buffer.length > 1000, "Audio-Puffer zu klein");
      assert.ok(t.provider === "mac" || t.provider === "xai" || t.provider === "openrouter");
      assert.match(t.contentType, /^audio\//);
      if (t.provider === "mac") {
        assert.match(t.contentType, /^audio\/(mp4|aiff)/);
      }
    },
  );

  it(
    "listVoices liefert Stimmen ohne Cloud-Key (mac-Fallback)",
    { skip: !isMac || !hasSay },
    async () => {
      const v = await listVoices();
      assert.ok(Array.isArray(v.voices) && v.voices.length >= 3);
    },
  );

  it("afconvert erzeugt m4a aus AIFF", { skip: !hasAfconvert || !hasSay }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glyph-tts-"));
    const aiff = path.join(dir, "t.aiff");
    const m4a = path.join(dir, "t.m4a");
    execFileSync("/usr/bin/say", ["-v", "Anna", "-o", aiff, "Guten Tag"]);
    execFileSync("/usr/bin/afconvert", ["-f", "m4af", "-d", "aac", aiff, m4a]);
    const buf = fs.readFileSync(path.join(dir, "t.m4a"));
    assert.ok(buf.length > 1000);
  });
});
