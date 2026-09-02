/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* skip */
    }
  }
  return "";
}

/** Strip markdown-ish noise so TTS reads more naturally. */
function textForSpeech(raw) {
  let t = String(raw || "");
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/!\[[^\]]*]\([^)]+\)/g, " ");
  t = t.replace(/\[([^\]]+)]\([^)]+\)/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");
  t = t.replace(/(\*|_)(.*?)\1/g, "$2");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+\.\s+/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/**
 * Browser-TTS (Web Speech API) — letzter Fallback, wenn der Server kein
 * Audio liefern kann. Gibt true zurück, wenn das Sprechen startete.
 * Kriterien: speechSynthesis vorhanden + mindestens eine Stimme.
 */
function speakWithBrowser(text, onEnd) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return false;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    u.rate = 1.0;
    const voices = synth.getVoices() || [];
    const de = voices.find((v) => (v.lang || "").toLowerCase().startsWith("de"));
    if (de) u.voice = de;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd();
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

export { pickRecorderMime, textForSpeech, speakWithBrowser };