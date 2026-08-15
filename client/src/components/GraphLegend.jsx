/**
 * Graph dock — toolbox: status, set/replace/clear, quiet rights.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useState } from "react";
import { bindsOf } from "../utils/lageLayout.js";
import { ModeGlyph } from "./ModeGlyph.jsx";

const HEAD_ROWS = [
  { id: "grok", label: "Grok", write: true },
  { id: "agent", label: "°_Agent", write: true },
  { id: "code", label: "^_Code", write: true },
];

function modeWordOf(binds) {
  const parts = [];
  for (const h of HEAD_ROWS) {
    const m = binds?.[h.id];
    if (!m || m === "unbound") continue;
    const right =
      m === "private" ? "privat" : m === "rw" ? "schreiben" : "lesen";
    parts.push(`${h.label} ${right}`);
  }
  return parts.join(" · ");
}

function shortPath(p) {
  const s = String(p || "");
  if (s.startsWith("/Users/")) {
    const slash = s.indexOf("/", 7);
    if (slash > 0) return `~${s.slice(slash)}`;
  }
  return s;
}

export function GraphLegend({
  absorb,
  selected,
  state,
  neighbors = [],
  onPick,
  grok,
  bindings,
  onBindingsChange,
  vaults,
  workspaces,
  busy,
  pendingDetach,
  setPendingDetach,
}) {
  const item = state?.item;
  const hook = selected?.kind === "workspace" ? workspaces : vaults;
  const title = item
    ? state?.label || selected?.label
    : absorb === "grok"
      ? "Grok"
      : absorb === "agent"
        ? "°_Agent"
        : absorb === "code"
          ? "^_Code"
          : "Glyph";
  const kindWord = state?.kindWord || "";
  const binds = item ? bindsOf(item, selected?.kind) : state?.binds;
  const modeWord = item
    ? modeWordOf(binds) || "ungebunden"
    : state?.live
      ? "verbunden"
      : "";

  return (
    <div className="lage-dock-card">
      <p className="lage-kicker">{kindWord || "Legende"}</p>
      <h3>
        {state?.primary ? "★ " : ""}
        {title}
      </h3>
      {modeWord ? <p className="lage-fact">{modeWord}</p> : null}

      {neighbors.length ? (
        <ul className="lage-deps">
          {neighbors.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="lage-link"
                onClick={() => onPick?.(n.id)}
              >
                {n.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!absorb && !item ? (
        <p className="lage-lede">Kopf in die Mitte. Stern: Favorit. Punkt: Rechte.</p>
      ) : null}

      {absorb === "grok" && !item ? <GrokBind grok={grok} /> : null}
      {(absorb === "agent" || absorb === "code") && !item ? (
        <CloudBind
          absorb={absorb}
          bindings={bindings}
          onBindingsChange={onBindingsChange}
        />
      ) : null}

      {item ? (
        <ResourceTools
          item={item}
          kind={selected?.kind || "vault"}
          hook={hook}
          busy={busy}
          pendingDetach={pendingDetach}
          setPendingDetach={setPendingDetach}
        />
      ) : null}
    </div>
  );
}

function GrokBind({ grok }) {
  const oauth = grok?.checks?.find((c) => c.id === "oauth");
  const bin = grok?.checks?.find((c) => c.id === "bin");
  const ok = Boolean(oauth?.ok);
  return (
    <div className="lage-bind">
      <p className={`lage-fact${ok ? "" : " is-off"}`}>
        {ok ? "OAuth steht." : "OAuth fehlt."}
      </p>
      <p className="lage-lede">
        Fest. Nur Terminal: <code>grok login</code>
        {bin?.ok ? "." : " — CLI nicht im PATH."}
      </p>
    </div>
  );
}

function KeyLine({ name, keyId, rec, hint, onPut, busy }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [ask, setAsk] = useState(false);
  const set = Boolean(rec?.set);

  return (
    <div className="lage-keyline">
      <div className="lage-keyline-head">
        <strong>{name}</strong>
        <span className={set ? "lage-pill is-on" : "lage-pill"}>{set ? rec.masked : "offen"}</span>
      </div>
      <p className="lage-lede">{hint}</p>
      <div className="lage-actions">
        <button
          type="button"
          className="lage-link"
          disabled={busy}
          onClick={() => {
            setOpen((v) => !v);
            setAsk(false);
          }}
        >
          {set ? "Ersetzen" : "Setzen"}
        </button>
        {set ? (
          <button
            type="button"
            className="lage-link is-danger"
            disabled={busy}
            onClick={() => {
              setAsk(true);
              setOpen(false);
            }}
          >
            Entfernen
          </button>
        ) : null}
      </div>
      {open ? (
        <form
          className="lage-key-reveal"
          onSubmit={(e) => {
            e.preventDefault();
            if (!val.trim()) return;
            void onPut({ [keyId]: val.trim() }).then(() => {
              setVal("");
              setOpen(false);
            });
          }}
        >
          <input
            type="password"
            autoComplete="off"
            autoFocus
            value={val}
            disabled={busy}
            placeholder="Neuer Key — ersetzt den alten"
            onChange={(e) => setVal(e.target.value)}
          />
          <button type="submit" className="lage-link" disabled={busy || !val.trim()}>
            Schreiben
          </button>
          <button
            type="button"
            className="lage-link"
            onClick={() => {
              setOpen(false);
              setVal("");
            }}
          >
            Abbrechen
          </button>
        </form>
      ) : null}
      {ask ? (
        <p className="lage-confirm">
          <span>Key löschen?</span>
          <button
            type="button"
            className="lage-link is-danger"
            disabled={busy}
            onClick={() => {
              void onPut({ [keyId]: "" }).then(() => setAsk(false));
            }}
          >
            Löschen
          </button>
          <button type="button" className="lage-link" onClick={() => setAsk(false)}>
            Behalten
          </button>
        </p>
      ) : null}
    </div>
  );
}

function CloudBind({ absorb, bindings, onBindingsChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const d = bindings?.keys?.DIRECT_API_KEY;
  const o = bindings?.keys?.OPENROUTER_API_KEY;

  async function put(body) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/bindings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onBindingsChange?.(data);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lage-bind">
      <p className="lage-lede">
        {absorb === "code"
          ? "Code denkt über Direct. Ohne Key kein Schreiben."
          : "Agent antwortet über Direct. Ohne Key nur Vault, keine Cloud."}
      </p>
      <KeyLine
        name="Direct"
        keyId="DIRECT_API_KEY"
        rec={d}
        hint="Neu setzen ersetzt. Entfernen löscht. DeepSeek oder jeder OpenAI-kompatible Host."
        onPut={put}
        busy={busy}
      />
      <KeyLine
        name="Reserve"
        keyId="OPENROUTER_API_KEY"
        rec={o}
        hint="Nur wenn Direct schweigt. Optional."
        onPut={put}
        busy={busy}
      />
      {err ? <p className="lage-alert">{err}</p> : null}
    </div>
  );
}

function ResourceTools({
  item,
  kind,
  hook,
  busy,
  pendingDetach,
  setPendingDetach,
}) {
  const on = item.enabled !== false;
  const binds = bindsOf(item, kind);
  return (
    <>
      <p className="lage-path" title={item.path}>
        {shortPath(item.path)}
      </p>
      <div className="lage-heads" aria-label="Anbindung">
        {HEAD_ROWS.map((head) => {
          const cur = binds[head.id] || "unbound";
          const modes = [
            { mode: "r", word: "Lesen" },
            ...(head.write ? [{ mode: "rw", word: "Schreiben" }] : []),
            { mode: "private", word: "Privat" },
            { mode: "unbound", word: "Weg" },
          ];
          return (
            <div key={head.id} className="lage-head-row">
              <span className="lage-head-name">{head.label}</span>
              <div
                className={`lage-head-modes${head.write ? "" : " is-three"}`}
                role="radiogroup"
                aria-label={`${head.label} Rechte`}
              >
                {modes.map((row) => {
                  const active = cur === row.mode;
                  return (
                    <button
                      key={row.mode}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`lage-right${active ? " is-on" : ""}`}
                      disabled={busy || active}
                      title={row.word}
                      onClick={() =>
                        void hook.patch(item.id, {
                          heads: { [head.id]: row.mode },
                        })
                      }
                    >
                      {row.mode === "unbound" ? (
                        <span className="lage-right-mark">–</span>
                      ) : (
                        <ModeGlyph mode={row.mode} kind={kind} size={16} />
                      )}
                      <span>{row.word}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="lage-rights lage-rights--tools" role="group" aria-label="Ordner">
        <button
          type="button"
          className={`lage-right${item.primary ? " is-on" : ""}`}
          disabled={busy || item.primary}
          title="Zuerst nehmen"
          onClick={() => void hook.patch(item.id, { primary: true })}
        >
          <span className="lage-right-mark">★</span>
          <span>Zuerst</span>
        </button>
        <button
          type="button"
          className={`lage-right${!on ? " is-on" : ""}`}
          disabled={busy}
          title={on ? "Am Graph, aber stumm" : "Wieder verbinden"}
          onClick={() => void hook.patch(item.id, { enabled: !on })}
        >
          <span>{on ? "Aus" : "An"}</span>
        </button>
        {item.obsidian_uri ? (
          <a
            className="lage-right"
            href={item.obsidian_uri}
            title="Im Vault öffnen"
          >
            <span>Öffnen</span>
          </a>
        ) : (
          <span className="lage-right is-empty" aria-hidden="true" />
        )}
        <button
          type="button"
          className="lage-right is-danger"
          disabled={busy}
          title="Vom Graph nehmen"
          onClick={() => setPendingDetach(item.id)}
        >
          <span>Entfernen</span>
        </button>
      </div>
      {pendingDetach === item.id ? (
        <p className="lage-confirm">
          <span>Diesen Ordner vom Graph nehmen?</span>
          <button
            type="button"
            className="lage-link is-danger"
            disabled={busy}
            onClick={() => {
              void hook.detach(item.id);
              setPendingDetach(null);
            }}
          >
            Entfernen
          </button>
          <button
            type="button"
            className="lage-link"
            onClick={() => setPendingDetach(null)}
          >
            Bleibt
          </button>
        </p>
      ) : null}
      {item.pins?.length ? (
        <ul className="lage-pins">
          {item.pins.map((p) => (
            <li key={p.path}>{p.label || p.path}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
