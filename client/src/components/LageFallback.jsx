/**
 * Graph overlay while the lazy chunk loads. Must ship in the main bundle
 * so Schließen/Escape work even if CableLage.js 404s.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect } from "react";

export function LageFallback({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="lage-stage lage-stage--pending"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label="Graph"
    >
      <button type="button" className="lage-close" onClick={onClose}>
        Schließen
      </button>
      <p className="lage-pending">Graph lädt…</p>
    </div>
  );
}
