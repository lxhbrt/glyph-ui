/**
 * Anbindung: API-Keys + OAuth/Service-Status (Inhalt, kein eigenes Overlay).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useState } from "react";

/**
 * @param {object} props
 * @param {boolean} props.active — when true, load/refresh status
 */
function BindingsPanel({ active }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [openrouter, setOpenrouter] = useState("");
  const [xai, setXai] = useState("");
  const [agentUrl, setAgentUrl] = useState("");
  const [clearOpenrouter, setClearOpenrouter] = useState(false);
  const [clearXai, setClearXai] = useState(false);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

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

      if (!Object.keys(body).length) {
        setOkMsg("Nichts zu speichern — Key eintippen oder Status neu laden.");
        setSaving(false);
        return;
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
      setOkMsg("Gespeichert unter ~/.glyph-ui/bindings.json (nur lokal).");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
            Token-Eingabe hier (gewollt).
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
