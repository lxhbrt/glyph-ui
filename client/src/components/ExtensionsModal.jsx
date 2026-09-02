/**
 * Extensions-Modal: Skills + Agent-Commands (insert into composer only).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { rankCatalog, slashItemLabel, withoutHiddenAgentCommands } from "../utils/slash.js";

/** Unified badge label: SKILL / UI / USER */
function badgeMeta(item) {
  const kind = item?.kind;
  if (kind === "ui") return { label: "UI", cls: "ui" };
  if (kind === "skill") {
    if (item?.source === "user") return { label: "USER", cls: "user" };
    return { label: "SKILL", cls: "skill" };
  }
  // Agent-/command entries → USER (nutzer-/agent-seitig ausführbar)
  return { label: "USER", cls: "user" };
}

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
      withoutHiddenAgentCommands(
        (agentCommands || []).map((c) => ({
          ...c,
          kind: c.kind === "ui" ? "ui" : "command",
          name: String(c.name || "").replace(/^\//, ""),
        })),
      ).filter((c) => c.kind !== "ui" && c.action !== "reload"),
    [agentCommands],
  );

  const items = useMemo(
    () => rankCatalog(skillItems, commandItems, query),
    [skillItems, commandItems, query],
  );

  const filterEmpty = Boolean(query.trim()) && items.length === 0 && !loading;

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
              Ausführbare Liste (Skills + Agent-Commands). Auswahl fügt{" "}
              <code>/name</code> in den Composer ein — sendet nicht.
            </p>
          </div>
          <div className="overview-head-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Schließen
            </button>
          </div>
        </header>

        <p className="overview-hint">
          Filtern und auswählen · <kbd>↑</kbd>/<kbd>↓</kbd> + <kbd>Enter</kbd> ·{" "}
          <kbd>Esc</kbd> schließt · <kbd>/</kbd> im Composer öffnet dasselbe
          (Popup). UI-Bedienung steht im <strong>Buch → Legende</strong>.
        </p>

        <div className="extensions-search-row">
          <input
            ref={searchRef}
            className="overview-search"
            type="search"
            placeholder="Skills und Agent-Commands filtern…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Befehle und Skills filtern"
          />
          <span className="extensions-filter-hint" title="Filterfeld (Fokus hier)">
            Filter
          </span>
        </div>

        {error ? <p className="overview-hint overview-hint--error">{error}</p> : null}
        {loading ? <p className="overview-hint">Skills werden geladen…</p> : null}
        {!loading && skillsHint && skillItems.length === 0 ? (
          <p className="overview-hint">{skillsHint}</p>
        ) : null}

        <div className="overview-list extensions-list" role="listbox">
          {filterEmpty ? (
            <div className="extensions-empty">
              <p className="slash-popup-empty">Keine Treffer</p>
              <button
                type="button"
                className="ghost extensions-reset-filter"
                onClick={() => {
                  setQuery("");
                  requestAnimationFrame(() => searchRef.current?.focus());
                }}
              >
                Filter zurücksetzen
              </button>
            </div>
          ) : items.length === 0 && !loading ? (
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
              const badge = badgeMeta(item);
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
                      <code>{slashItemLabel(item)}</code>
                      <span className={`slash-badge slash-badge--${badge.cls}`}>
                        {badge.label}
                      </span>
                      {item.source && item.source !== "user" ? (
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
