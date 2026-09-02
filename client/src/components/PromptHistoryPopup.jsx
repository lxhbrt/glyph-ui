/**
 * Composer ↑ history list (TUI prompt history).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useRef } from "react";

/**
 * @param {{
 *   open: boolean,
 *   items: string[],
 *   selectedIndex: number,
 *   onSelectIndex: (i: number) => void,
 *   onPick: (text: string) => void,
 *   onClose: () => void,
 * }} props
 */
export function PromptHistoryPopup({
  open,
  items,
  selectedIndex,
  onSelectIndex,
  onPick,
  onClose,
}) {
  const rowRefs = useRef(new Map());
  const list = Array.isArray(items) ? items : [];

  useEffect(() => {
    if (!open) return;
    const el = rowRefs.current.get(selectedIndex);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex]);

  if (!open) return null;

  return (
    <div className="slash-popup" role="listbox" aria-label="Prompt-History">
      <div className="slash-popup-head">
        <span className="slash-popup-kicker">↑↓ · Enter einsetzen · Esc</span>
        <button type="button" className="ghost slash-popup-close" onClick={onClose}>
          ×
        </button>
      </div>
      {list.length === 0 ? (
        <p className="slash-popup-empty">Keine History</p>
      ) : (
        <ul className="slash-popup-list">
          {list.map((text, i) => {
            const selected = i === selectedIndex;
            return (
              <li key={`${i}-${text.slice(0, 24)}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`slash-popup-row${selected ? " is-selected" : ""}`}
                  ref={(el) => {
                    if (el) rowRefs.current.set(i, el);
                    else rowRefs.current.delete(i);
                  }}
                  onMouseEnter={() => onSelectIndex(i)}
                  onClick={() => onPick(text)}
                >
                  <span className="slash-popup-desc">{text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
