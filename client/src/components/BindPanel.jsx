/**
 * Shared Kabelsalat UI — Vaults and Workspaces are thin adapters.
 * CSS class names stay vaults-* (no restyle).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useId, useMemo, useState } from "react";
import { useBindResource } from "../hooks/useBindResource.js";

const MODE_CYCLE = ["r", "rw", "private"];

/** 👁 nur lesen · 👁✎ lesen+schreiben · 🔒 privat/gesperrt */
function ModeGlyph({ mode, size = 12 }) {
  const s = size;
  if (mode === "private") {
    return (
      <svg
        className="vaults-mode-glyph"
        width={s}
        height={s}
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <rect
          x="3"
          y="7"
          width="10"
          height="7"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5 7V5a3 3 0 0 1 6 0v2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (mode === "rw") {
    return (
      <svg
        className="vaults-mode-glyph"
        width={s + 4}
        height={s}
        viewBox="0 0 20 16"
        aria-hidden="true"
      >
        <ellipse
          cx="7"
          cy="8"
          rx="5.2"
          ry="3.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
        />
        <circle cx="7" cy="8" r="1.5" fill="currentColor" />
        <path
          d="M12.2 11.5l1.1-4.1 2.6 2.6-1.1 4.1-2.6-2.6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M13.5 7.2l1.1-1.1a.7.7 0 0 1 1 0l.7.7a.7.7 0 0 1 0 1l-1.1 1.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      className="vaults-mode-glyph"
      width={s}
      height={s}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <ellipse
        cx="8"
        cy="8"
        rx="6"
        ry="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <circle cx="8" cy="8" r="1.7" fill="currentColor" />
    </svg>
  );
}

function modeClass(m) {
  if (m === "rw") return "is-rw";
  if (m === "private") return "is-private";
  return "is-r";
}

function ModeBadge({ mode, label, title }) {
  return (
    <span className={`vaults-mode-badge ${modeClass(mode)}`} title={title}>
      <ModeGlyph mode={mode} />
      <span>{label}</span>
    </span>
  );
}

function renderExtra(extra, item) {
  if (!extra) return null;
  return typeof extra === "function" ? extra(item) : extra;
}

function nodePos(i, n) {
  if (n <= 0) return { x: 50, y: 20 };
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
  const r = 36;
  return {
    x: 50 + r * Math.cos(angle),
    y: 50 + r * Math.sin(angle),
  };
}

export function BindPanel({
  hub,
  resource,
  listKey,
  apiBase,
  title,
  hint,
  attachPlaceholder,
  defaultAttachMode,
  modeTitles,
  modeLabels,
  confirmDetach,
  extraDetail,
  extraNode,
  extraActions,
}) {
  const titleId = useId();
  const { items, refresh, attach, patch, detach, busy, error, loading } =
    useBindResource({ apiBase, listKey });
  const [input, setInput] = useState("");
  const [attachMode, setAttachMode] = useState(defaultAttachMode);
  const [selectedId, setSelectedId] = useState(null);

  const labelOf = (m) => {
    if (modeLabels?.[m]) return modeLabels[m];
    if (m === "rw") return "r+w";
    if (m === "private") return "privat";
    return "r";
  };
  const titleOf = (m) => modeTitles?.[m] || "";

  const positions = useMemo(() => {
    const map = {};
    items.forEach((item, i) => {
      map[item.id] = nodePos(i, items.length);
    });
    return map;
  }, [items]);

  const selected = items.find((item) => item.id === selectedId) || null;

  async function onAttach(e) {
    e?.preventDefault?.();
    const raw = input.trim();
    if (!raw || busy) return;
    setInput("");
    const ok = await attach(raw, attachMode);
    if (!ok) setInput(raw);
  }

  async function onDetach(id) {
    if (!id || busy) return;
    if (!window.confirm(confirmDetach)) return;
    const ok = await detach(id);
    if (ok && selectedId === id) setSelectedId(null);
  }

  function cycleMode(item) {
    const i = MODE_CYCLE.indexOf(item.mode || "r");
    const next = MODE_CYCLE[(i + 1) % MODE_CYCLE.length];
    void patch(item.id, { mode: next });
  }

  const privateWord = labelOf("private");
  const sectionClass =
    listKey === "workspaces" ? "vaults-panel workspaces-panel" : "vaults-panel";

  return (
    <section className={sectionClass} aria-labelledby={titleId}>
      <h4 id={titleId} className="bindings-section-title">
        {title}
      </h4>
      <p className="overview-hint vaults-hint">{hint}</p>
      <p className="vaults-legend" aria-label="Legende Rechte">
        <span className="vaults-legend-item is-r" title={titleOf("r")}>
          <span className="vaults-legend-line is-r" aria-hidden="true" />
          <ModeGlyph mode="r" />
          <span>nur lesen</span>
        </span>
        <span className="vaults-legend-item is-rw" title={titleOf("rw")}>
          <span className="vaults-legend-line is-rw" aria-hidden="true" />
          <ModeGlyph mode="rw" />
          <span>lesen+schreiben</span>
        </span>
        <span className="vaults-legend-item is-private" title={titleOf("private")}>
          <span className="vaults-legend-line is-private" aria-hidden="true" />
          <ModeGlyph mode="private" />
          <span>{privateWord}</span>
        </span>
      </p>

      {error ? (
        <p className="bindings-hint--warn" role="alert">
          {error}
          {/fetch|Failed|ECONNREFUSED|18899/i.test(error) ? (
            <>
              {" "}
              — läuft glyph-agent? <code>python3 ~/glyph-agent/server.py</code>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="vaults-map-stage" data-loading={loading || undefined}>
        <svg
          className="vaults-map-cables"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {items.map((item) => {
            const to = positions[item.id];
            if (!to) return null;
            return (
              <line
                key={item.id}
                className={`vaults-cable ${modeClass(item.mode)}${
                  item.enabled === false ? " is-cut" : ""
                }${selectedId === item.id ? " is-selected" : ""}`}
                x1={50}
                y1={50}
                x2={to.x}
                y2={to.y}
              />
            );
          })}
        </svg>

        <div className="vaults-map-hub" title={hub}>
          <span className="vaults-hub-label">{hub}</span>
        </div>

        {items.map((item) => {
          const pos = positions[item.id] || { x: 50, y: 20 };
          return (
            <button
              key={item.id}
              type="button"
              className={`vaults-node ${modeClass(item.mode)}${
                item.primary ? " is-primary" : ""
              }${selectedId === item.id ? " is-selected" : ""}${
                !item.exists ? " is-missing" : ""
              }`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              title={`${item.name}\n${item.path}\n${titleOf(item.mode)}`}
              onClick={() => setSelectedId(item.id)}
            >
              {item.primary ? <span className="vaults-star">★</span> : null}
              <span className="vaults-node-name">{item.name}</span>
              <span className="vaults-node-mode">
                <ModeBadge
                  mode={item.mode || "r"}
                  label={labelOf(item.mode || "r")}
                  title={titleOf(item.mode || "r")}
                />
              </span>
              {renderExtra(extraNode, item)}
            </button>
          );
        })}
      </div>

      <form className="vaults-attach" onSubmit={onAttach}>
        <input
          type="text"
          className="vaults-attach-input"
          placeholder={attachPlaceholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          aria-label={`${resource} anbinden`}
        />
        <select
          className="vaults-attach-mode"
          value={attachMode}
          onChange={(e) => setAttachMode(e.target.value)}
          disabled={busy}
          aria-label="Rechte beim Anbinden"
        >
          <option value="r">👁 r · nur lesen</option>
          <option value="rw">👁✎ r+w · lesen+schreiben</option>
          <option value="private">🔒 {privateWord}</option>
        </select>
        <button type="submit" className="ghost" disabled={busy || !input.trim()}>
          + Anbinden
        </button>
        <button type="button" className="ghost" onClick={() => void refresh()} disabled={busy}>
          ↻
        </button>
      </form>

      {selected ? (
        <div className="vaults-detail">
          <div className="vaults-detail-head">
            <strong>{selected.name}</strong>
            {selected.primary ? <span className="vaults-badge">Primär</span> : null}
            {!selected.exists ? (
              <span className="vaults-badge vaults-badge--warn">fehlt</span>
            ) : null}
          </div>
          <p className="vaults-path">
            <code>{selected.path}</code>
          </p>
          <div className="vaults-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => cycleMode(selected)}
              disabled={busy}
              title={`Rechte wechseln · ${titleOf(selected.mode)}`}
            >
              Rechte:{" "}
              <ModeBadge
                mode={selected.mode || "r"}
                label={labelOf(selected.mode || "r")}
                title={titleOf(selected.mode || "r")}
              />
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void patch(selected.id, { primary: true })}
              disabled={busy || selected.primary}
            >
              ★ Primär
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void patch(selected.id, { move: "up" })}
              disabled={busy}
            >
              ↑
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void patch(selected.id, { move: "down" })}
              disabled={busy}
            >
              ↓
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                void patch(selected.id, { enabled: selected.enabled === false })
              }
              disabled={busy}
              title="An/Ab — Kabel durchtrennen, Eintrag bleibt"
            >
              {selected.enabled === false ? "An" : "Ab"}
            </button>
            {renderExtra(extraActions, selected)}
            <button
              type="button"
              className="ghost vaults-detach"
              onClick={() => void onDetach(selected.id)}
              disabled={busy}
            >
              Lösen
            </button>
          </div>
          {renderExtra(extraDetail, selected)}
        </div>
      ) : (
        <p className="overview-hint">Knoten anklicken für Details · Reihenfolge · Lösen.</p>
      )}

      <ul className="vaults-list" aria-label={`${resource}-Liste`}>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`vaults-list-row${selectedId === item.id ? " is-selected" : ""}`}
              onClick={() => setSelectedId(item.id)}
            >
              <span>
                {item.primary ? "★ " : ""}
                {item.name}
              </span>
              <span className={`vaults-list-mode ${modeClass(item.mode)}`}>
                <ModeBadge
                  mode={item.mode || "r"}
                  label={labelOf(item.mode || "r")}
                  title={titleOf(item.mode || "r")}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
