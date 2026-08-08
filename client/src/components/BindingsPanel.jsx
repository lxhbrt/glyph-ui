/**
 * Anbindung: API-Keys + OpenRouter-Models + OAuth/Service-Status.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useState } from "react";

/**
 * Prefill model fields: bindings → agent health → placeholders (never wipe edits).
 * @param {object|null} data
 * @param {{ hasUserEdits: boolean, primary: string, fallback: string, codePrimary: string, codeFallback: string }} fields
 */
function prefillModels(data, fields) {
  if (fields.hasUserEdits) return fields;
  const shared = data?.models?.shared;
  const code = data?.models?.code;
  const active = data?.modelsActive?.shared || data?.modelsActive?.active;
  const healthPrimary =
    active?.primary ||
    data?.modelsActive?.active?.primary ||
    data?.modelsActive?.shared?.primary ||
    "";
  const healthFb =
    active?.fallback ??
    data?.modelsActive?.active?.fallback ??
    data?.modelsActive?.shared?.fallback ??
    "";
  const primary =
    shared?.primary ||
    healthPrimary ||
    fields.primary ||
    "deepseek/deepseek-v4-flash-0731";
  const fallback =
    shared?.fallback != null && shared?.primary
      ? shared.fallback
      : shared?.primary
        ? shared.fallback || ""
        : healthFb || fields.fallback || "";
  const codePrimary = code?.primary || fields.codePrimary || "";
  const codeFallback =
    code?.primary != null ? code.fallback || "" : fields.codeFallback || "";
  return {
    hasUserEdits: false,
    primary,
    fallback,
    codePrimary,
    codeFallback,
    codeOpen: Boolean(code?.primary) || fields.codeOpen,
  };
}

/**
 * @param {object} props
 * @param {boolean} props.active — when true, load/refresh status
 * @param {string} [props.agentProfileId] — grok | _code | glyph-agent
 */
function BindingsPanel({ active, agentProfileId = "" }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [openrouter, setOpenrouter] = useState("");
  const [xai, setXai] = useState("");
  const [agentUrl, setAgentUrl] = useState("");
  const [clearOpenrouter, setClearOpenrouter] = useState(false);
  const [clearXai, setClearXai] = useState(false);
  const [primary, setPrimary] = useState("");
  const [fallback, setFallback] = useState("");
  const [codePrimary, setCodePrimary] = useState("");
  const [codeFallback, setCodeFallback] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [modelsDirty, setModelsDirty] = useState(false);

  const openRouterProfiles =
    agentProfileId === "_code" ||
    agentProfileId === "code" ||
    agentProfileId === "glyph-agent" ||
    agentProfileId === "agent" ||
    !agentProfileId;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/bindings", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setStatus(data);
      setAgentUrl(
        data?.settings?.GLYPH_AGENT_URL?.value || "http://127.0.0.1:18899",
      );
      setOpenrouter("");
      setXai("");
      setClearOpenrouter(false);
      setClearXai(false);
      const filled = prefillModels(data, {
        hasUserEdits: modelsDirty,
        primary,
        fallback,
        codePrimary,
        codeFallback,
        codeOpen,
      });
      if (!modelsDirty) {
        setPrimary(filled.primary);
        setFallback(filled.fallback);
        setCodePrimary(filled.codePrimary);
        setCodeFallback(filled.codeFallback);
        if (filled.codeOpen) setCodeOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-prefill when not dirty
  }, [modelsDirty]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  function markModelsDirty() {
    setModelsDirty(true);
  }

  async function save(e) {
    e?.preventDefault?.();
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const body = {};
      if (clearOpenrouter) body.OPENROUTER_API_KEY = "";
      else if (openrouter.trim()) body.OPENROUTER_API_KEY = openrouter.trim();
      if (clearXai) body.XAI_API_KEY = "";
      else if (xai.trim()) body.XAI_API_KEY = xai.trim();
      if (agentUrl.trim()) body.GLYPH_AGENT_URL = agentUrl.trim();

      const p = primary.trim();
      if (p) {
        body.models = {
          shared: {
            primary: p,
            fallback: fallback.trim(),
          },
          code: codeOpen && codePrimary.trim()
            ? {
                primary: codePrimary.trim(),
                fallback: codeFallback.trim(),
              }
            : null,
        };
      }

      if (!Object.keys(body).length) {
        setOkMsg("Nichts zu speichern — Key oder Model eintippen.");
        setSaving(false);
        return;
      }

      if (body.models && !body.models.shared?.primary) {
        throw new Error("OpenRouter Primary-Model ist Pflicht");
      }

      const res = await fetch("/api/bindings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setStatus(data);
      setOpenrouter("");
      setXai("");
      setClearOpenrouter(false);
      setClearXai(false);
      setAgentUrl(data?.settings?.GLYPH_AGENT_URL?.value || agentUrl);
      setModelsDirty(false);
      if (data?.models?.shared?.primary) {
        setPrimary(data.models.shared.primary);
        setFallback(data.models.shared.fallback || "");
      }
      if (data?.models?.code?.primary) {
        setCodePrimary(data.models.code.primary);
        setCodeFallback(data.models.code.fallback || "");
        setCodeOpen(true);
      } else if (body.models && body.models.code === null) {
        setCodePrimary("");
        setCodeFallback("");
      }

      const apply = data?.modelsApply;
      if (body.models && apply) {
        if (apply.ok && apply.applied) {
          setOkMsg(
            "Gespeichert + live am glyph-agent übernommen (nächster Chat).",
          );
        } else {
          setOkMsg(
            `Gespeichert in bindings.json. Apply ausstehend: ${apply.error || "Agent offline"} — greift beim Connect.`,
          );
        }
      } else {
        setOkMsg("Gespeichert unter ~/.glyph-ui/bindings.json (nur lokal).");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function testModel() {
    const m = primary.trim();
    if (!m) {
      setError("Zum Testen Primary-Model eintragen");
      return;
    }
    setTesting(true);
    setError("");
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
      const win = data.context_length
        ? ` · context ${Number(data.context_length).toLocaleString("de-DE")}`
        : "";
      setOkMsg(`Test ok: ${m}${win}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  if (!active) return null;

  const profiles = status?.profiles || {};
  const profileOrder = ["grok", "_code", "glyph-agent"];

  return (
    <div className="bindings-panel" role="tabpanel" aria-label="Anbindung">
      <p className="bindings-lead">
        Glyph ist eine leere Hülle — hier knüpfst du Agenten an. Keys bleiben auf
        diesem Rechner (<code>~/.glyph-ui/bindings.json</code>). OAuth (Grok)
        läuft im Terminal, nicht in dieser Maske.
      </p>

      {loading && !status ? (
        <p className="summarize-status">Status wird geladen…</p>
      ) : null}
      {error ? <p className="summarize-error">{error}</p> : null}
      {okMsg ? <p className="summarize-success">{okMsg}</p> : null}

      <section className="bindings-section">
        <h4 className="bindings-section-title">Profile</h4>
        <ul className="bindings-profile-list">
          {profileOrder.map((id) => {
            const p = profiles[id];
            if (!p) return null;
            return (
              <li
                key={id}
                className={`bindings-profile ${p.ok ? "is-ok" : "is-bad"}`}
              >
                <div className="bindings-profile-head">
                  <span className="bindings-dot" aria-hidden="true" />
                  <strong>{p.label}</strong>
                  <span className="bindings-auth">{p.auth}</span>
                </div>
                <ul className="bindings-checks">
                  {(p.checks || []).map((c) => (
                    <li key={c.id} className={c.ok ? "ok" : "bad"}>
                      <span className="bindings-check-mark">
                        {c.ok ? "✓" : "·"}
                      </span>
                      <span>{c.detail}</span>
                    </li>
                  ))}
                </ul>
                {p.hint ? <p className="bindings-hint">{p.hint}</p> : null}
              </li>
            );
          })}
        </ul>
        {status?.voice ? (
          <p className={`bindings-voice ${status.voice.ok ? "ok" : "bad"}`}>
            Voice (Grok): {status.voice.detail}
          </p>
        ) : null}
      </section>

      <form className="bindings-form" onSubmit={(e) => void save(e)}>
        <h4 className="bindings-section-title">OpenRouter Models (^_Code / °_Agent)</h4>
        {!openRouterProfiles ? (
          <p className="bindings-hint">
            Profil <strong>Grok</strong> nutzt die CLI/OAuth — Model-IDs hier greifen
            erst nach Wechsel auf <code>^_Code</code> oder <code>°_Agent</code>.
            OAuth-Provider-Tausch (z. B. Claude) ist v1 nicht Teil dieses Menüs.
          </p>
        ) : null}
        {status?.modelsMismatch ? (
          <p className="bindings-hint bindings-hint--warn">
            Gespeicherte Models weichen vom laufenden Agent ab — Speichern oder
            Connect synct (Mismatch).
          </p>
        ) : null}
        <label className="summarize-label" htmlFor="bind-model-primary">
          Primary (OpenRouter Model-ID)
        </label>
        <input
          id="bind-model-primary"
          className="summarize-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="deepseek/deepseek-v4-flash-0731"
          value={primary}
          disabled={saving || !openRouterProfiles}
          onChange={(e) => {
            markModelsDirty();
            setPrimary(e.target.value);
          }}
        />
        <label className="summarize-label" htmlFor="bind-model-fallback">
          Fallback (optional — leer = kein Fallback)
        </label>
        <input
          id="bind-model-fallback"
          className="summarize-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="inclusionai/ling-3.0-tiny:free"
          value={fallback}
          disabled={saving || !openRouterProfiles}
          onChange={(e) => {
            markModelsDirty();
            setFallback(e.target.value);
          }}
        />
        <details
          className="bindings-advanced"
          open={codeOpen}
          onToggle={(e) => setCodeOpen(e.currentTarget.open)}
        >
          <summary>Erweitert: Code abweichend</summary>
          <p className="bindings-hint">
            Leer lassen = gleiches Paar wie Primary/Fallback (shared).
          </p>
          <label className="summarize-label" htmlFor="bind-code-primary">
            Code Primary
          </label>
          <input
            id="bind-code-primary"
            className="summarize-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={codePrimary}
            disabled={saving || !openRouterProfiles}
            onChange={(e) => {
              markModelsDirty();
              setCodePrimary(e.target.value);
            }}
          />
          <label className="summarize-label" htmlFor="bind-code-fallback">
            Code Fallback
          </label>
          <input
            id="bind-code-fallback"
            className="summarize-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={codeFallback}
            disabled={saving || !openRouterProfiles}
            onChange={(e) => {
              markModelsDirty();
              setCodeFallback(e.target.value);
            }}
          />
        </details>
        <div className="summarize-actions" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className="pill pill-btn"
            disabled={saving || testing || loading || !openRouterProfiles}
            onClick={() => void testModel()}
          >
            {testing ? "Teste…" : "Testen"}
          </button>
        </div>

        <h4 className="bindings-section-title">Keys & URL</h4>

        <label className="summarize-label" htmlFor="bind-or">
          OPENROUTER_API_KEY (^_Code / °_Agent Cloud)
          {status?.keys?.OPENROUTER_API_KEY?.set ? (
            <span className="bindings-masked">
              {" "}
              · gesetzt {status.keys.OPENROUTER_API_KEY.masked} (
              {status.keys.OPENROUTER_API_KEY.source})
            </span>
          ) : (
            <span className="bindings-masked"> · fehlt</span>
          )}
        </label>
        <input
          id="bind-or"
          className="summarize-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-or-… (leer lassen = unverändert)"
          value={openrouter}
          disabled={clearOpenrouter || saving}
          onChange={(e) => setOpenrouter(e.target.value)}
        />
        <label className="bindings-clear">
          <input
            type="checkbox"
            checked={clearOpenrouter}
            onChange={(e) => {
              setClearOpenrouter(e.target.checked);
              if (e.target.checked) setOpenrouter("");
            }}
          />
          Key löschen
        </label>

        <label className="summarize-label" htmlFor="bind-xai">
          XAI_API_KEY (Voice STT/TTS)
          {status?.keys?.XAI_API_KEY?.set ? (
            <span className="bindings-masked">
              {" "}
              · gesetzt {status.keys.XAI_API_KEY.masked} (
              {status.keys.XAI_API_KEY.source})
            </span>
          ) : (
            <span className="bindings-masked"> · fehlt</span>
          )}
        </label>
        <input
          id="bind-xai"
          className="summarize-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="xai-… (console.x.ai)"
          value={xai}
          disabled={clearXai || saving}
          onChange={(e) => setXai(e.target.value)}
        />
        <label className="bindings-clear">
          <input
            type="checkbox"
            checked={clearXai}
            onChange={(e) => {
              setClearXai(e.target.checked);
              if (e.target.checked) setXai("");
            }}
          />
          Key löschen
        </label>

        <label className="summarize-label" htmlFor="bind-agent-url">
          glyph-agent URL
        </label>
        <input
          id="bind-agent-url"
          className="summarize-input"
          type="url"
          autoComplete="off"
          spellCheck={false}
          value={agentUrl}
          disabled={saving}
          onChange={(e) => setAgentUrl(e.target.value)}
        />

        <div className="bindings-oauth-box">
          <strong>Grok OAuth</strong>
          <p>
            Im Terminal auf diesem Mac/PC: <code>grok login</code>
            <br />
            Glyph liest nur den Status aus <code>~/.grok/auth.json</code> — kein
            Token-Eingabe hier (gewollt). Provider-Wechsel (z. B. Claude) ist
            kein OpenRouter-Model-String — eigenes Epic, nicht dieses Menü.
          </p>
        </div>

        <div className="summarize-actions">
          <button
            type="submit"
            className="pill pill-btn"
            disabled={saving || loading}
          >
            {saving ? "Speichern…" : "Speichern"}
          </button>
          <button
            type="button"
            className="pill pill-btn"
            disabled={loading || saving}
            onClick={() => void load()}
          >
            Status neu laden
          </button>
        </div>
      </form>

      <p className="bindings-footer">
        Datei:{" "}
        <code>{status?.bindingsPath || "~/.glyph-ui/bindings.json"}</code>
      </p>
    </div>
  );
}

export { BindingsPanel };
export default BindingsPanel;
