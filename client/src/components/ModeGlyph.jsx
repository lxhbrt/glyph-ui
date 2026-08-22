/**
 * Bind-Rechte: Auge · Auge+Schriftrolle · Schloss.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { SchlossMark, SeshMark, WedjatMark } from "./EgyptMarks.jsx";

const TITLES = {
  r: "nur lesen",
  rw: "lesen und schreiben",
  private: "zu",
};

export function modeTitle(mode, _kind) {
  if (mode === "rw") return TITLES.rw;
  if (mode === "private") return "zu";
  return TITLES.r;
}

export function ModeGlyph({ mode, size = 12, kind: _kind }) {
  const title = modeTitle(mode);
  if (mode === "private") {
    return (
      <span className="vaults-mode-glyph-wrap" title={title}>
        <SchlossMark size={size} />
      </span>
    );
  }
  if (mode === "rw") {
    return (
      <span className="vaults-mode-glyph-wrap is-rw" title={title}>
        <WedjatMark size={size} />
        <SeshMark size={size} />
      </span>
    );
  }
  return (
    <span className="vaults-mode-glyph-wrap" title={title}>
      <WedjatMark size={size} />
    </span>
  );
}
