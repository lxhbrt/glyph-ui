/**
 * Extensions-Modal: Skills + Agent-Commands (insert into composer only).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { rankCatalog } from "../utils/slash.js";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {Array<{ name: string, description?: string, inputHint?: string, kind?: string, source?: string }>} props.skills
 * @param {Array<{ name: string, description?: string, inputHint?: string }>} props.agentCommands
 * @param {string} [props.profileLabel]
 * @param {string | null} [props.skillsHint]
 * @param {boolean} [props.loading]
 * @param {string} [props.error]
 * @param {(item: { name: string, kind: string }) => void} props.onPick
 */
function ExtensionsModal({
  open,
  onClose,
  skills = [],
  agentCommands = [],
  profileLabel = "",
  skillsHint = null,
  loading = false,
  error = "",
  onPick,
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef(null);
  const panelRef = useRef(null);
  const rowRefs = useRef(new Map());

  const skillItems = useMemo(
    () =>
      (skills || []).map((s) => ({
        ...s,
        kind: "skill",
        name: String(s.name || "").replace(/^\//, ""),
      })),
    [skills],
  );

  const commandItems = useMemo(
    () =>
      (agentCommands || []).map((c) => ({
        ...c,
        kind: "command",
        name: String(c.name || "").replace(/^\//, ""),
      })),
    [agentCommands],
  );

  const items = useMemo(
    () => rankCatalog(skillItems, commandItems, query),
    [skillItems, commandItems, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((i) => Math.min(Math.max(0, i), items.length - 1));
  }, [items.length, query]);

  useEffect(() => {
    if (!open) return;
    const item = items[selectedIndex];
    if (!item) return;
    const el = rowRefs.current.get(`${item.kind}:${item.name}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex, items]);

  if (!open) return null;

  const pick = (item) => {
    if (!item) return;
    onPick?.(item);
    onClose();
  };

  return (
    <div className="overview-scrim" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="overview-panel extensions-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Erweiterungen und Befehle"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            pick(items[selectedIndex]);
          }
        }}
      >
        <header className="overview-head">
          <div>
            <p className="overview-kicker">Extensions</p>
            <h2>Befehle &amp; Skills</h2>
            <p className="overview-meta">
              {profileLabel ? `Profil: ${profileLabel} · ` : ""}
              Auswahl fügt den Befehl in den Composer ein — sendet nicht.
            </p>
          </div>
          <div className="overview-head-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Schließen
            </button>
          </div>
        </header>

        <input
          ref={searchRef}
          className="overview-search"
          type="search"
          placeholder="Filtern…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Befehle filtern"
        />

        {error ? <p className="overview-hint overview-hint--error">{error}</p> : null}
        {loading ? <p className="overview-hint">Skills werden geladen…</p> : null}
        {!loading && skillsHint && skillItems.length === 0 ? (
          <p className="overview-hint">{skillsHint}</p>
        ) : null}

        <div className="overview-list extensions-list" role="listbox">
          {items.length === 0 && !loading ? (
            <p className="slash-popup-empty" style={{ padding: 12 }}>
              Keine Einträge
              {commandItems.length === 0
                ? " — Agent-Commands erscheinen nach Verbindung."
                : ""}
            </p>
          ) : (
            items.map((item, i) => {
              const key = `${item.kind}:${item.name}`;
              const selected = i === selectedIndex;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`session-row extensions-row${selected ? " is-selected" : ""}`}
                  ref={(el) => {
                    if (el) rowRefs.current.set(key, el);
                    else rowRefs.current.delete(key);
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => pick(item)}
                >
                  <div className="session-main">
                    <div className="extensions-row-title">
                      <code>/{item.name}</code>
                      <span className={`slash-badge slash-badge--${item.kind}`}>
                        {item.kind === "skill" ? "Skill" : "Agent"}
                      </span>
                      {item.source ? (
                        <span className="extensions-source">{item.source}</span>
                      ) : null}
                    </div>
                    {item.description ? (
                      <p className="session-summary">{item.description}</p>
                    ) : null}
                    {item.inputHint ? (
                      <p className="extensions-hint-line">Args: {item.inputHint}</p>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

export { ExtensionsModal };
