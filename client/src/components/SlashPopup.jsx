/**
 * Floating slash command picker above the composer.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useRef } from "react";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {Array<{ name: string, description?: string, inputHint?: string, kind: string, source?: string }>} props.items
 * @param {number} props.selectedIndex
 * @param {(index: number) => void} props.onSelectIndex
 * @param {(item: object) => void} props.onPick
 * @param {() => void} props.onClose
 * @param {string} [props.query]
 */
function SlashPopup({
  open,
  items,
  selectedIndex,
  onSelectIndex,
  onPick,
  onClose,
  query = "",
}) {
  const listRef = useRef(null);
  const rowRefs = useRef(new Map());

  useEffect(() => {
    if (!open) return;
    const id = items[selectedIndex]?.name;
    if (!id) return;
    const el = rowRefs.current.get(`${items[selectedIndex].kind}:${id}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex, items]);

  if (!open) return null;

  return (
    <div
      className="slash-popup"
      role="listbox"
      aria-label="Befehle und Skills"
      ref={listRef}
    >
      <div className="slash-popup-head">
        <span className="slash-popup-kicker">
          /{query || "…"} · ↑↓ Enter · Esc
        </span>
        <button type="button" className="ghost slash-popup-close" onClick={onClose}>
          ×
        </button>
      </div>
      {items.length === 0 ? (
        <p className="slash-popup-empty">Keine Treffer</p>
      ) : (
        <ul className="slash-popup-list">
          {items.map((item, i) => {
            const key = `${item.kind}:${item.name}`;
            const selected = i === selectedIndex;
            return (
              <li key={key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`slash-popup-row${selected ? " is-selected" : ""}`}
                  ref={(el) => {
                    if (el) rowRefs.current.set(key, el);
                    else rowRefs.current.delete(key);
                  }}
                  onMouseEnter={() => onSelectIndex(i)}
                  onClick={() => onPick(item)}
                >
                  <span className="slash-popup-name">
                    /{item.name}
                    <span className={`slash-badge slash-badge--${item.kind}`}>
                      {item.kind === "skill" ? "Skill" : "Agent"}
                    </span>
                  </span>
                  {item.description ? (
                    <span className="slash-popup-desc">{item.description}</span>
                  ) : null}
                  {item.inputHint ? (
                    <span className="slash-popup-hint">{item.inputHint}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { SlashPopup };
