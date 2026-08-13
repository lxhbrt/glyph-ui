/**
 * Kabelsalat — Obsidian-Vaults an °_Agent anbinden/lösen.
 * SoT: ~/.glyph/vaults.json via glyph-agent /vaults
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";

const MODE_CYCLE = ["r", "rw", "private"];

/** 👁 nur lesen · 👁✎ lesen+schreiben · 🔒 privat */
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
        {/* Auge */}
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
        {/* Stift */}
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
  // r — nur Auge
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

function modeLabel(m) {
  if (m === "rw") return "r+w";
  if (m === "private") return "privat";
  return "r";
}

function modeTitle(m) {
  if (m === "rw") return "Lesen + Schreiben (Auge + Stift)";
  if (m === "private") return "Privat (Schloss) — kein Index, kein Schreiben";
  return "Nur Lesen (Auge) — angebunden, gold-gestrichelt";
}

function modeClass(m) {
  if (m === "rw") return "is-rw";
  if (m === "private") return "is-private";
  return "is-r";
}

function ModeBadge({ mode }) {
  return (
    <span className={`vaults-mode-badge ${modeClass(mode)}`} title={modeTitle(mode)}>
      <ModeGlyph mode={mode} />
      <span>{modeLabel(mode)}</span>
    </span>
  );
}

/**
 * Layout: hub center, vaults on circle.
 */
function vaultPos(i, n) {
  if (n <= 0) return { x: 50, y: 20 };
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
  const r = 36;
  return {
    x: 50 + r * Math.cos(angle),
    y: 50 + r * Math.sin(angle),
  };
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: { Accept: "application/json" },
  };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export function VaultsPanel() {
  const titleId = useId();
  const [vaults, setVaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [attachMode, setAttachMode] = useState("r");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("GET", "/api/vaults");
      setVaults(Array.isArray(data.vaults) ? data.vaults : []);
    } catch (e) {
      setError(e.message || String(e));
      setVaults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const positions = useMemo(() => {
    const map = {};
    vaults.forEach((v, i) => {
      map[v.id] = vaultPos(i, vaults.length);
    });
    return map;
  }, [vaults]);

  const selected = vaults.find((v) => v.id === selectedId) || null;

  async function onAttach(e) {
    e?.preventDefault?.();
    const raw = input.trim();
    if (!raw || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("POST", "/api/vaults", { input: raw, mode: attachMode });
      setInput("");
      await refresh();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDetach(id) {
    if (!id || busy) return;
    if (!window.confirm("Vault vom Kabelsalat lösen?")) return;
    setBusy(true);
    setError("");
    try {
      await api("DELETE", `/api/vaults/${encodeURIComponent(id)}`);
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function patchVault(id, patch) {
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("PATCH", `/api/vaults/${encodeURIComponent(id)}`, patch);
      await refresh();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  function cycleMode(v) {
    const i = MODE_CYCLE.indexOf(v.mode || "r");
    const next = MODE_CYCLE[(i + 1) % MODE_CYCLE.length];
    void patchVault(v.id, { mode: next });
  }

  return (
    <section className="vaults-panel" aria-labelledby={titleId}>
      <h4 id={titleId} className="bindings-section-title">
        Kabelsalat · Vaults
      </h4>
      <p className="overview-hint vaults-hint">
        °_Agent ↔ Obsidian-Vaults. SoT: <code>~/.glyph/vaults.json</code>.{" "}
        <strong>+</strong> Pfad, Vault-Name oder{" "}
        <code>obsidian://open?vault=…</code>. Rechte: r → r+w → privat.
      </p>
      <p className="vaults-legend" aria-label="Legende Rechte">
        <span className="vaults-legend-item is-r" title={modeTitle("r")}>
          <span className="vaults-legend-line is-r" aria-hidden="true" />
          <ModeGlyph mode="r" />
          <span>nur lesen</span>
        </span>
        <span className="vaults-legend-item is-rw" title={modeTitle("rw")}>
          <span className="vaults-legend-line is-rw" aria-hidden="true" />
          <ModeGlyph mode="rw" />
          <span>lesen+schreiben</span>
        </span>
        <span className="vaults-legend-item is-private" title={modeTitle("private")}>
          <span className="vaults-legend-line is-private" aria-hidden="true" />
          <ModeGlyph mode="private" />
          <span>privat</span>
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
          {vaults.map((v) => {
            const to = positions[v.id];
            if (!to) return null;
            return (
              <line
                key={v.id}
                className={`vaults-cable ${modeClass(v.mode)}${
                  v.enabled === false ? " is-cut" : ""
                }${selectedId === v.id ? " is-selected" : ""}`}
                x1={50}
                y1={50}
                x2={to.x}
                y2={to.y}
              />
            );
          })}
        </svg>

        <div className="vaults-map-hub" title="°_Agent">
          <span className="vaults-hub-label">°_Agent</span>
        </div>

        {vaults.map((v) => {
          const pos = positions[v.id] || { x: 50, y: 20 };
          return (
            <button
              key={v.id}
              type="button"
              className={`vaults-node ${modeClass(v.mode)}${
                v.primary ? " is-primary" : ""
              }${selectedId === v.id ? " is-selected" : ""}${
                !v.exists ? " is-missing" : ""
              }`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              title={`${v.name}\n${v.path}\n${modeTitle(v.mode)}`}
              onClick={() => setSelectedId(v.id)}
            >
              {v.primary ? <span className="vaults-star">★</span> : null}
              <span className="vaults-node-name">{v.name}</span>
              <span className="vaults-node-mode">
                <ModeBadge mode={v.mode || "r"} />
              </span>
              {v.pins?.length ? (
                <span className="vaults-node-pins">
                  {v.pins
                    .slice(0, 3)
                    .map((p) => p.label || p.path)
                    .join(" · ")}
                  {v.pins.length > 3 ? "…" : ""}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <form className="vaults-attach" onSubmit={onAttach}>
        <input
          type="text"
          className="vaults-attach-input"
          placeholder="Pfad · Vault-Name · obsidian://open?vault=…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          aria-label="Vault anbinden"
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
          <option value="private">🔒 privat</option>
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
              title={`Rechte wechseln · ${modeTitle(selected.mode)}`}
            >
              Rechte: <ModeBadge mode={selected.mode || "r"} />
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void patchVault(selected.id, { primary: true })}
              disabled={busy || selected.primary}
            >
              ★ Primär
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void patchVault(selected.id, { move: "up" })}
              disabled={busy}
            >
              ↑
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void patchVault(selected.id, { move: "down" })}
              disabled={busy}
            >
              ↓
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                void patchVault(selected.id, { enabled: selected.enabled === false })
              }
              disabled={busy}
              title="An/Ab — Kabel durchtrennen, Eintrag bleibt"
            >
              {selected.enabled === false ? "An" : "Ab"}
            </button>
            {selected.obsidian_uri ? (
              <a className="ghost vaults-open" href={selected.obsidian_uri}>
                Obsidian
              </a>
            ) : null}
            <button
              type="button"
              className="ghost vaults-detach"
              onClick={() => void onDetach(selected.id)}
              disabled={busy}
            >
              Lösen
            </button>
          </div>
          {selected.pins?.length ? (
            <ul className="vaults-pin-list">
              {selected.pins.map((p) => (
                <li key={p.path}>
                  <span className="vaults-pin-src">{p.source}</span>{" "}
                  {p.label || p.path}
                  <code className="vaults-pin-path">{p.path}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="overview-hint">Keine Pins (Haupt-MDs).</p>
          )}
        </div>
      ) : (
        <p className="overview-hint">Knoten anklicken für Details · Reihenfolge · Lösen.</p>
      )}

      <ul className="vaults-list" aria-label="Vault-Liste">
        {vaults.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              className={`vaults-list-row${selectedId === v.id ? " is-selected" : ""}`}
              onClick={() => setSelectedId(v.id)}
            >
              <span>{v.primary ? "★ " : ""}{v.name}</span>
              <span className={`vaults-list-mode ${modeClass(v.mode)}`}>
                <ModeBadge mode={v.mode || "r"} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
