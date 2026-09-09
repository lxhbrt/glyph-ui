/**
 * Pick a user turn to rewind to (TUI /rewind).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useRef, useState } from "react";

/**
 * @param {{
 *   open: boolean,
 *   points: Array<{ index: number, id?: string, preview: string, text: string }>,
 *   busy?: boolean,
 *   onClose: () => void,
 *   onPick: (point: { index: number, text: string }) => void,
 * }} props
 */
export function RewindPicker({ open, points, busy = false, onClose, onPick }) {
  const [index, setIndex] = useState(0);
  const panelRef = useRef(null);
  const list = Array.isArray(points) ? points : [];

  useEffect(() => {
    if (!open) return;
    setIndex(Math.max(0, list.length - 1));
    requestAnimationFrame(() => panelRef.current?.focus());
  }, [open, list.length]);

  if (!open) return null;

  const pick = (p) => {
    if (!p || busy) return;
    onPick(p);
  };

  return (
    <div className="overview-scrim" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="rewind-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Rewind"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(list.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            pick(list[index]);
          }
        }}
      >
        <header className="rewind-picker-head">
          <div>
            <p className="overview-kicker">Rewind</p>
            <h2>Zurück zu einem Turn</h2>
          </div>
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Schließen
          </button>
        </header>
        <p className="rewind-picker-hint">
          Gewählter Nutzer-Turn und alles danach fallen aus dem Verlauf.
          Dateien auf Disk bleiben.
        </p>
        {list.length === 0 ? (
          <p className="empty-inline">Kein Nutzer-Turn.</p>
        ) : (
          <ul className="rewind-picker-list" role="listbox" aria-label="Turns">
            {list.map((p, i) => (
              <li key={p.id || p.index}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  className={`rewind-picker-row${i === index ? " is-selected" : ""}`}
                  disabled={busy}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => pick(p)}
                >
                  <span className="rewind-picker-idx">{p.index + 1}</span>
                  <span className="rewind-picker-text">{p.preview}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
