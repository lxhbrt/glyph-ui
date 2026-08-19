/**
 * Graph dock — toolbox: status, set/replace/clear, quiet rights.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useState } from "react";
import { buildModelsPatch, modelsForHead } from "../utils/bindingsModels.js";
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
  const [okMsg, setOkMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const shown = modelsForHead(bindings, absorb);
  const urlNow =
    bindings?.settings?.DIRECT_API_URL?.value || "https://api.deepseek.com";
  const [host, setHost] = useState(urlNow);
  const [primary, setPrimary] = useState(shown.primary);
  const [fallback, setFallback] = useState(shown.fallback);

  useEffect(() => {
    setHost(urlNow);
    setPrimary(shown.primary);
    setFallback(shown.fallback);
  }, [urlNow, shown.primary, shown.fallback, absorb]);

  const d = bindings?.keys?.DIRECT_API_KEY;
  const o = bindings?.keys?.OPENROUTER_API_KEY;
  const isCode = absorb === "code";

  async function put(body) {
    setBusy(true);
    setErr("");
    setOkMsg("");
    try {
      const res = await fetch("/api/bindings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onBindingsChange?.(data);
      const apply = data?.modelsApply;
      if (body.models && apply) {
        setOkMsg(
          apply.ok && apply.applied
            ? "Gespeichert · live am Agent."
            : `Gespeichert. Apply: ${apply.error || "Agent offline"}.`,
        );
      } else if (body.DIRECT_API_URL || body.DIRECT_API_KEY || body.OPENROUTER_API_KEY) {
        setOkMsg("Gespeichert.");
      }
      return data;
    } catch (e) {
      setErr(e.message || String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveModels(e) {
    e?.preventDefault?.();
    const patch = buildModelsPatch({ absorb, primary, fallback });
    if (!patch) {
      setErr("Modell-ID fehlt.");
      return;
    }
    const body = { ...patch };
    if (host.trim()) body.DIRECT_API_URL = host.trim();
    await put(body);
  }

  async function testModel() {
    const m = primary.trim();
    if (!m) {
      setErr("Zum Testen eine Modell-ID eintragen.");
      return;
    }
    setTesting(true);
    setErr("");
    setOkMsg("");
    try {
      const res = await fetch("/api/models/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Probe HTTP ${res.status}`);
      }
      setOkMsg(`Test ok: ${m}`);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="lage-bind">
      <p className="lage-lede">
        {isCode
          ? "Key + Host + Modell hier. Ohne Slash = Direct (deepseek-v4-flash). Mit Slash = OpenRouter (google/gemini-3.7-flash)."
          : "Key + Host + Modell hier. Ohne Slash = Direct. Mit Slash = OpenRouter-Slug."}
      </p>
      <form
        className="lage-keyline"
        onSubmit={(e) => {
          e.preventDefault();
          if (!host.trim()) {
            setErr("Host-URL fehlt.");
            return;
          }
          void put({ DIRECT_API_URL: host.trim() });
        }}
      >
        <div className="lage-keyline-head">
          <strong>Host</strong>
          <span className="lage-pill">{bindings?.settings?.DIRECT_API_URL?.source || "default"}</span>
        </div>
        <p className="lage-lede">Direct-Endpoint. DeepSeek, anderer OpenAI-kompatibler Host.</p>
        <div className="lage-key-reveal">
          <input
            type="url"
            autoComplete="off"
            spellCheck={false}
            aria-label="Direct Base-URL"
            placeholder="https://api.deepseek.com"
            value={host}
            disabled={busy}
            onChange={(e) => setHost(e.target.value)}
          />
          <button type="submit" className="lage-link" disabled={busy || !host.trim()}>
            Schreiben
          </button>
        </div>
      </form>
      <KeyLine
        name="Direct-Key"
        keyId="DIRECT_API_KEY"
        rec={d}
        hint="Zum Host. DeepSeek sk-… oder Key des anderen Endpoints."
        onPut={put}
        busy={busy}
      />
      <KeyLine
        name="OpenRouter-Key"
        keyId="OPENROUTER_API_KEY"
        rec={o}
        hint="Pflicht, wenn das Modell einen Slash hat (vendor/model) oder als Reserve."
        onPut={put}
        busy={busy}
      />
      <form className="lage-keyline" onSubmit={saveModels}>
        <div className="lage-keyline-head">
          <strong>{isCode ? "Modell ^_Code" : "Modell °_Agent"}</strong>
          <span className={`lage-pill${shown.source === "code" ? " is-on" : ""}`}>
            {isCode
              ? shown.source === "code"
                ? "eigen"
                : "wie Agent"
              : "shared"}
          </span>
        </div>
        <p className="lage-lede">
          {isCode
            ? "Leer + Schreiben = gleiches Paar wie °_Agent."
            : "z. B. deepseek-v4-pro oder google/gemini-3.7-flash."}
        </p>
        <label className="lage-field-label" htmlFor={`lage-model-${absorb}`}>
          Primary
        </label>
        <div className="lage-key-reveal">
          <input
            id={`lage-model-${absorb}`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            aria-label={isCode ? "Modell ^_Code" : "Modell °_Agent"}
            placeholder={isCode ? "google/gemini-3.7-flash" : "deepseek-v4-pro"}
            value={primary}
            disabled={busy}
            onChange={(e) => setPrimary(e.target.value)}
          />
        </div>
        <label className="lage-field-label" htmlFor={`lage-fb-${absorb}`}>
          Reserve-Modell
        </label>
        <div className="lage-key-reveal">
          <input
            id={`lage-fb-${absorb}`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            aria-label="Reserve-Modell"
            placeholder="deepseek/deepseek-v4-flash-0731"
            value={fallback}
            disabled={busy}
            onChange={(e) => setFallback(e.target.value)}
          />
        </div>
        <div className="lage-actions">
          <button type="submit" className="lage-link" disabled={busy}>
            {busy ? "…" : "Schreiben"}
          </button>
          <button
            type="button"
            className="lage-link"
            disabled={busy || testing || !primary.trim()}
            onClick={() => void testModel()}
          >
            {testing ? "Teste…" : "Testen"}
          </button>
          {isCode && shown.source === "code" ? (
            <button
              type="button"
              className="lage-link"
              disabled={busy}
              onClick={() => {
                setPrimary("");
                setFallback("");
                void put({ models: { code: null } });
              }}
            >
              Wie Agent
            </button>
          ) : null}
        </div>
      </form>
      {err ? <p className="lage-alert" role="alert">{err}</p> : null}
      {okMsg ? <p className="lage-fact" role="status">{okMsg}</p> : null}
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
