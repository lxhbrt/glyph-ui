/**
 * Shared Kabelsalat UI — Vaults and Workspaces are thin adapters.
 * CSS class names stay vaults-* (no restyle).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useId, useMemo, useState } from "react";
import { useBindResource } from "../hooks/useBindResource.js";
import { cablePath } from "../utils/cables.js";
import { ModeGlyph } from "./ModeGlyph.jsx";

const MODE_CYCLE = ["r", "rw", "private"];

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
  if (n <= 0) return { x: 50, y: 22 };
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
  const r = 34;
  return {
    x: 50 + r * Math.cos(angle),
    y: 50 + r * Math.sin(angle),
  };
}

function shortPath(p) {
  const s = String(p || "");
  if (s.startsWith("/Users/")) {
    const slash = s.indexOf("/", 7);
    if (slash > 0) return `~${s.slice(slash)}`;
  }
  return s;
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
  extraActions,
}) {
  const titleId = useId();
  const { items, refresh, attach, patch, detach, busy, error, loading } =
    useBindResource({ apiBase, listKey });
  const [input, setInput] = useState("");
  const [attachMode, setAttachMode] = useState(defaultAttachMode);
  const [selectedId, setSelectedId] = useState(null);
  const [pendingDetach, setPendingDetach] = useState(null);

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

  useEffect(() => {
    if (selectedId && items.some((item) => item.id === selectedId)) return;
    const primary = items.find((item) => item.primary);
    setSelectedId(primary?.id || items[0]?.id || null);
    setPendingDetach(null);
  }, [items, selectedId]);

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
    const ok = await detach(id);
    if (ok && selectedId === id) setSelectedId(null);
    setPendingDetach(null);
  }

  function nextMode(item) {
    const i = MODE_CYCLE.indexOf(item.mode || "r");
    return MODE_CYCLE[(i + 1) % MODE_CYCLE.length];
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
      <h4 id={titleId} className="sr-only">
        {title}
      </h4>
      {hint ? <p className="vaults-lede">{hint}</p> : null}

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

      <div
        className={`vaults-map-stage${items.length === 0 && !loading ? " is-empty" : ""}`}
        data-loading={loading || undefined}
        aria-hidden={items.length === 0}
      >
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
              <path
                key={item.id}
                className={`vaults-cable ${modeClass(item.mode)}${
                  item.enabled === false ? " is-cut" : ""
                }${selectedId === item.id ? " is-selected" : ""}`}
                d={cablePath(50, 50, to.x, to.y)}
              />
            );
          })}
        </svg>

        <div className="vaults-map-hub" title={hub}>
          <span className="vaults-hub-label">{hub}</span>
        </div>

        {items.length === 0 && !loading ? (
          <p className="vaults-map-empty">Kein Kabel. Unten anbinden.</p>
        ) : null}

        {items.map((item) => {
          const pos = positions[item.id] || { x: 50, y: 22 };
          const cut = item.enabled === false;
          return (
            <button
              key={item.id}
              type="button"
              className={`vaults-dot ${modeClass(item.mode)}${
                item.primary ? " is-primary" : ""
              }${selectedId === item.id ? " is-selected" : ""}${
                !item.exists ? " is-missing" : ""
              }${cut ? " is-cut" : ""}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              title={`${item.name} · ${titleOf(item.mode) || labelOf(item.mode)}${
                cut ? " · Kabel ab" : ""
              }`}
              aria-label={`${item.name}, ${labelOf(item.mode || "r")}${
                cut ? ", Kabel ab" : ""
              }`}
              aria-pressed={selectedId === item.id}
              onClick={() => {
                setSelectedId(item.id);
                setPendingDetach(null);
              }}
            >
              <span className="vaults-dot-mark" />
            </button>
          );
        })}
      </div>

      <p className="vaults-legend" aria-label="Legende Rechte">
        <span className="vaults-legend-item is-r" title={titleOf("r")}>
          <span className="vaults-legend-line is-r" aria-hidden="true" />
          lesen
        </span>
        <span className="vaults-legend-item is-rw" title={titleOf("rw")}>
          <span className="vaults-legend-line is-rw" aria-hidden="true" />
          r+w
        </span>
        <span className="vaults-legend-item is-private" title={titleOf("private")}>
          <span className="vaults-legend-line is-private" aria-hidden="true" />
          {privateWord}
        </span>
      </p>

      <ul className="vaults-list" aria-label={`${resource}-Liste`}>
        {items.map((item) => {
          const open = item.id === selectedId;
          return (
            <li
              key={item.id}
              className={`vaults-list-item${open ? " is-open" : ""}${
                item.enabled === false ? " is-cut" : ""
              }`}
            >
              <button
                type="button"
                className={`vaults-list-row${open ? " is-selected" : ""}`}
                onClick={() => {
                  setSelectedId(item.id);
                  setPendingDetach(null);
                }}
                aria-expanded={open}
              >
                <span className="vaults-list-name">
                  {item.primary ? (
                    <span className="vaults-star" aria-label="Primär">
                      ★
                    </span>
                  ) : null}
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
              {open ? (
                <div className="vaults-inspect">
                  <p className="vaults-path" title={item.path}>
                    <code>{shortPath(item.path)}</code>
                    {!item.exists ? (
                      <span className="vaults-badge vaults-badge--warn">fehlt</span>
                    ) : null}
                  </p>
                  <div className="vaults-toolbar">
                    <div className="vaults-toolbar-main">
                      <button
                        type="button"
                        className="vaults-tool"
                        onClick={() => cycleMode(item)}
                        disabled={busy}
                        title={`Rechte wechseln · ${titleOf(item.mode)}`}
                        aria-label={`Rechte ${labelOf(item.mode)} — weiter zu ${labelOf(nextMode(item))}`}
                      >
                        <ModeBadge
                          mode={item.mode || "r"}
                          label={labelOf(item.mode || "r")}
                          title={titleOf(item.mode || "r")}
                        />
                        <span className="vaults-tool-next" aria-hidden="true">
                          → {labelOf(nextMode(item))}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="vaults-tool"
                        onClick={() => void patch(item.id, { primary: true })}
                        disabled={busy || item.primary}
                      >
                        Primär
                      </button>
                      <span className="vaults-tool-pair">
                        <button
                          type="button"
                          className="vaults-tool"
                          onClick={() => void patch(item.id, { move: "up" })}
                          disabled={busy}
                          aria-label="Reihenfolge nach oben"
                          title="Nach oben"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="vaults-tool"
                          onClick={() => void patch(item.id, { move: "down" })}
                          disabled={busy}
                          aria-label="Reihenfolge nach unten"
                          title="Nach unten"
                        >
                          ↓
                        </button>
                      </span>
                      <button
                        type="button"
                        className="vaults-tool"
                        onClick={() =>
                          void patch(item.id, { enabled: item.enabled === false })
                        }
                        disabled={busy}
                        title="Kabel durchtrennen — Eintrag bleibt"
                      >
                        {item.enabled === false ? "An" : "Ab"}
                      </button>
                      {renderExtra(extraActions, item)}
                    </div>
                    <button
                      type="button"
                      className="vaults-tool vaults-tool--danger"
                      onClick={() => setPendingDetach(item.id)}
                      disabled={busy}
                    >
                      Lösen
                    </button>
                  </div>
                  {pendingDetach === item.id ? (
                    <p className="vaults-confirm" role="group" aria-label="Lösen bestätigen">
                      <span>{confirmDetach}</span>
                      <button
                        type="button"
                        className="vaults-tool vaults-tool--danger"
                        disabled={busy}
                        onClick={() => void onDetach(item.id)}
                      >
                        Lösen
                      </button>
                      <button
                        type="button"
                        className="vaults-tool"
                        disabled={busy}
                        onClick={() => setPendingDetach(null)}
                      >
                        Behalten
                      </button>
                    </p>
                  ) : null}
                  {renderExtra(extraDetail, item)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

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
          <option value="r">lesen</option>
          <option value="rw">r+w</option>
          <option value="private">{privateWord}</option>
        </select>
        <button
          type="submit"
          className="vaults-tool"
          disabled={busy || !input.trim()}
        >
          Anbinden
        </button>
        <button
          type="button"
          className="vaults-tool"
          onClick={() => void refresh()}
          disabled={busy}
          aria-label="Aktualisieren"
          title="Aktualisieren"
        >
          ↻
        </button>
      </form>
    </section>
  );
}
