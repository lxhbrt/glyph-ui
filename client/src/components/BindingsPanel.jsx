/**
 * Anbindung: Kabelplan (Profile + Voice) + Stecker (Keys/Models).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useId, useState } from "react";
import { cablePath } from "../utils/cables.js";
import { GlyphMark } from "./EgyptMarks.jsx";

/** Agent profiles on the map (full nodes). */
const PROFILE_ORDER = ["grok", "_code", "glyph-agent"];
/** Capability strands (thin nodes). */
const CAPABILITY_ORDER = ["voice"];
const MAP_NODE_ORDER = [...PROFILE_ORDER, ...CAPABILITY_ORDER];

/** Hub + node positions in viewBox 0–100 (for cable SVG). */
const MAP_POS = {
  hub: { x: 50, y: 48 },
  grok: { x: 50, y: 12 },
  _code: { x: 16, y: 82 },
  "glyph-agent": { x: 84, y: 82 },
  /** Thin capability strand — right mid */
  voice: { x: 90, y: 42 },
};

/**
 * Prefill model fields: bindings → agent health → placeholders (never wipe edits).
 * @param {object|null} data
 * @param {{ hasUserEdits: boolean, primary: string, fallback: string, codePrimary: string, codeFallback: string, codeOpen: boolean }} fields
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
    "deepseek-v4-pro";
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

function nodeSlot(id) {
  if (id === "grok") return "grok";
  if (id === "_code") return "code";
  if (id === "glyph-agent") return "agent";
  if (id === "voice") return "voice";
  return "agent";
}

/**
 * @param {{ profiles: Record<string, object>, expandedId: string|null, onToggle: (id: string) => void, loading: boolean }} props
 */
function BindingsMap({ profiles, expandedId, onToggle, loading }) {
  const titleId = useId();

  return (
    <section
      className="bindings-map"
      aria-labelledby={titleId}
      data-loading={loading || undefined}
    >
      <h4 id={titleId} className="bindings-section-title">
        Kabelplan
      </h4>

      <div className="bindings-map-stage">
        <svg
          className="bindings-map-cables"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {MAP_NODE_ORDER.map((id) => {
            const p = profiles[id];
            const to = MAP_POS[id];
            if (!to) return null;
            const ok = Boolean(p?.ok);
            const thin = p?.kind === "capability" || id === "voice";
            return (
              <path
                key={id}
                className={`bindings-cable${thin ? " is-thin" : ""}${ok ? " is-live" : " is-cut"}`}
                d={cablePath(MAP_POS.hub.x, MAP_POS.hub.y, to.x, to.y)}
              />
            );
          })}
        </svg>

        <div className="bindings-map-hub" aria-hidden="true">
          <GlyphMark size={40} className="bindings-map-mark" />
          <span className="bindings-map-hub-label">Glyph</span>
        </div>

        {MAP_NODE_ORDER.map((id) => {
          const p = profiles[id];
          if (!p) return null;
          const ok = Boolean(p.ok);
          const open = expandedId === id;
          const slot = nodeSlot(id);
          const thin = p.kind === "capability" || id === "voice";
          return (
            <button
              key={id}
              type="button"
              className={`bindings-node bindings-node--${slot}${thin ? " is-thin" : ""}${ok ? " is-ok" : " is-bad"}${open ? " is-open" : ""}`}
              aria-expanded={open}
              aria-controls={`bindings-node-detail-${id}`}
              onClick={() => onToggle(id)}
            >
              <span className="bindings-node-dot" aria-hidden="true" />
              <span className="bindings-node-body">
                <strong className="bindings-node-label">{p.label}</strong>
                <span className="bindings-node-auth">{p.auth}</span>
              </span>
              <span className="bindings-node-state" aria-hidden="true">
                {ok ? "live" : "cut"}
              </span>
            </button>
          );
        })}
      </div>

      {MAP_NODE_ORDER.map((id) => {
        const p = profiles[id];
        if (!p || expandedId !== id) return null;
        return (
          <div
            key={`detail-${id}`}
            id={`bindings-node-detail-${id}`}
            className={`bindings-node-detail${p.ok ? " is-ok" : " is-bad"}`}
            role="region"
            aria-label={`${p.label} — Checks`}
          >
            <ul className="bindings-checks">
              {(p.checks || []).map((c) => (
                <li key={c.id} className={c.ok ? "ok" : "bad"}>
                  <span className="bindings-check-mark" aria-hidden="true">
                    {c.ok ? "✓" : "·"}
                  </span>
                  <span>{c.detail}</span>
                </li>
              ))}
            </ul>
            {id === "grok" ? (
              <p className="bindings-oauth-inline">
                OAuth nur Terminal: <code>grok login</code> · Status aus{" "}
                <code>~/.grok/auth.json</code> — kein Token hier.
              </p>
            ) : null}
            {p.hint ? <p className="bindings-hint">{p.hint}</p> : null}
          </div>
        );
      })}
    </section>
  );
}

/**
 * Key row: password input + optional immediate Entfernen when a key is set.
 */
function KeyField({
  id,
  label,
  meta,
  placeholder,
  value,
  onChange,
  keySet,
  masked,
  source,
  onRemove,
  removing,
  saving,
}) {
  return (
    <div className="bindings-key-row">
      <label className="bindings-label" htmlFor={id}>
        {label}
        <span className="bindings-label-meta">
          {meta}
          {keySet
            ? ` · gesetzt ${masked || "…"}${source ? ` (${source})` : ""}`
            : " · fehlt"}
        </span>
      </label>
      <div className="bindings-key-controls">
        <input
          id={id}
          className="bindings-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          disabled={saving || removing}
          onChange={onChange}
        />
        {keySet ? (
          <button
            type="button"
            className="bindings-remove-btn"
            disabled={saving || removing}
            onClick={() => void onRemove()}
            title="Gespeicherten Key sofort entfernen"
          >
            {removing ? "…" : "Entfernen"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.active — when true, load/refresh status
 * @param {string} [props.agentProfileId] — grok | _code | glyph-agent
 */
function BindingsPanel({ active }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingKey, setRemovingKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [openrouter, setOpenrouter] = useState("");
  const [xai, setXai] = useState("");
  const [directKey, setDirectKey] = useState("");
  const [directUrl, setDirectUrl] = useState("");
  const [agentUrl, setAgentUrl] = useState("");
  const [primary, setPrimary] = useState("");
  const [fallback, setFallback] = useState("");
  const [codePrimary, setCodePrimary] = useState("");
  const [codeFallback, setCodeFallback] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [modelsDirty, setModelsDirty] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

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
      setDirectUrl(
        data?.settings?.DIRECT_API_URL?.value || "https://api.deepseek.com",
      );
      setOpenrouter("");
      setXai("");
      setDirectKey("");
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

  function toggleNode(id) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  /**
   * Immediate key delete — no checkbox + Speichern riddle.
   * @param {"DIRECT_API_KEY" | "OPENROUTER_API_KEY" | "XAI_API_KEY"} keyId
   */
  async function removeKey(keyId) {
    setRemovingKey(keyId);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/bindings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [keyId]: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setStatus(data);
      if (keyId === "DIRECT_API_KEY") setDirectKey("");
      if (keyId === "OPENROUTER_API_KEY") setOpenrouter("");
      if (keyId === "XAI_API_KEY") setXai("");
      setOkMsg(`${keyId} entfernt.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingKey("");
    }
  }

  async function save(e) {
    e?.preventDefault?.();
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const body = {};
      if (directKey.trim()) body.DIRECT_API_KEY = directKey.trim();
      if (directUrl.trim()) body.DIRECT_API_URL = directUrl.trim();
      if (openrouter.trim()) body.OPENROUTER_API_KEY = openrouter.trim();
      if (xai.trim()) body.XAI_API_KEY = xai.trim();
      if (agentUrl.trim()) body.GLYPH_AGENT_URL = agentUrl.trim();

      const p = primary.trim();
      if (p) {
        body.models = {
          shared: {
            primary: p,
            fallback: fallback.trim(),
          },
          code:
            codeOpen && codePrimary.trim()
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
        throw new Error("Primary-Model ist Pflicht");
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
      setDirectKey("");
      setDirectUrl(
        data?.settings?.DIRECT_API_URL?.value || directUrl,
      );
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
  const orKey = status?.keys?.OPENROUTER_API_KEY;
  const xaiKey = status?.keys?.XAI_API_KEY;
  const directMeta = status?.keys?.DIRECT_API_KEY;

  return (
    <div className="bindings-panel" role="tabpanel" aria-label="Anbindung">
      <p className="bindings-lead">
        Glyph ist eine leere Hülle — hier knüpfst du Agenten an. Keys bleiben auf
        diesem Rechner (<code>~/.glyph-ui/bindings.json</code>).
      </p>

      {loading && !status ? (
        <p className="bindings-flash bindings-flash--muted">
          Status wird geladen…
        </p>
      ) : null}
      {error ? (
        <p className="bindings-flash bindings-flash--error" role="alert">
          {error}
        </p>
      ) : null}
      {okMsg ? (
        <p className="bindings-flash bindings-flash--ok" role="status">
          {okMsg}
        </p>
      ) : null}

      {status ? (
        <BindingsMap
          profiles={profiles}
          expandedId={expandedId}
          onToggle={toggleNode}
          loading={loading}
        />
      ) : null}

      <form className="bindings-form" onSubmit={(e) => void save(e)}>
        <h4 className="bindings-section-title">Stecker · Models</h4>
        <p className="bindings-hint">
          Ohne Slash = Direct-ID (<code>deepseek-v4-flash</code>). Mit Slash =
          OpenRouter-Slug (<code>google/gemini-3.7-flash</code>). Greift für{" "}
          <code>°_Agent</code> / <code>^_Code</code>, unabhängig vom aktiven Profil.
        </p>
        {status?.modelsMismatch ? (
          <p className="bindings-hint bindings-hint--warn">
            Gespeicherte Models ≠ laufender Agent — Speichern oder Connect synct.
          </p>
        ) : null}

        <div className="bindings-plug">
          <label className="bindings-label" htmlFor="bind-model-primary">
            Modell °_Agent
          </label>
          <input
            id="bind-model-primary"
            className="bindings-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="deepseek-v4-pro"
            value={primary}
            disabled={saving}
            onChange={(e) => {
              markModelsDirty();
              setPrimary(e.target.value);
            }}
          />
          <label className="bindings-label" htmlFor="bind-model-fallback">
            Reserve °_Agent
          </label>
          <input
            id="bind-model-fallback"
            className="bindings-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="deepseek/deepseek-v4-flash-0731"
            value={fallback}
            disabled={saving}
            onChange={(e) => {
              markModelsDirty();
              setFallback(e.target.value);
            }}
          />
          <label className="bindings-label" htmlFor="bind-code-primary">
            Modell ^_Code
            <span className="bindings-label-meta">leer = wie °_Agent</span>
          </label>
          <input
            id="bind-code-primary"
            className="bindings-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="google/gemini-3.7-flash"
            value={codePrimary}
            disabled={saving}
            onChange={(e) => {
              markModelsDirty();
              setCodePrimary(e.target.value);
              setCodeOpen(Boolean(e.target.value.trim()));
            }}
          />
          <label className="bindings-label" htmlFor="bind-code-fallback">
            Reserve ^_Code
          </label>
          <input
            id="bind-code-fallback"
            className="bindings-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={codeFallback}
            disabled={saving}
            onChange={(e) => {
              markModelsDirty();
              setCodeFallback(e.target.value);
            }}
          />
          <div className="bindings-actions bindings-actions--inline">
            <button
              type="button"
              className="pill pill-btn"
              disabled={saving || testing || loading}
              onClick={() => void testModel()}
            >
              {testing ? "Teste…" : "Testen"}
            </button>
          </div>
        </div>

        <h4 className="bindings-section-title">Stecker · Keys & URL</h4>

        <div className="bindings-plug">
          <KeyField
            id="bind-direct"
            label="API-Key (Direct)"
            meta="OpenAI-kompatibel · DeepSeek, Grok, jeder andere Endpoint"
            placeholder="sk-… oder xai-… (leer = unverändert)"
            value={directKey}
            onChange={(e) => setDirectKey(e.target.value)}
            keySet={Boolean(directMeta?.set)}
            masked={directMeta?.masked}
            source={directMeta?.source}
            onRemove={() => removeKey("DIRECT_API_KEY")}
            removing={removingKey === "DIRECT_API_KEY"}
            saving={saving}
          />

          <label className="bindings-label" htmlFor="bind-direct-url">
            Base-URL (Direct)
            <span className="bindings-label-meta">
              Anbieter sitzt in der URL, nicht im Key-Namen
            </span>
          </label>
          <input
            id="bind-direct-url"
            className="bindings-input"
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://api.deepseek.com"
            value={directUrl}
            disabled={saving}
            onChange={(e) => setDirectUrl(e.target.value)}
          />

          <KeyField
            id="bind-or"
            label="OPENROUTER_API_KEY"
            meta="Fallback-Hop · Voice-Fallback"
            placeholder="sk-or-… (leer = unverändert)"
            value={openrouter}
            onChange={(e) => setOpenrouter(e.target.value)}
            keySet={Boolean(orKey?.set)}
            masked={orKey?.masked}
            source={orKey?.source}
            onRemove={() => removeKey("OPENROUTER_API_KEY")}
            removing={removingKey === "OPENROUTER_API_KEY"}
            saving={saving}
          />

          <KeyField
            id="bind-xai"
            label="XAI_API_KEY"
            meta="Voice STT/TTS Primary (Grok-Stimmen)"
            placeholder="xai-… (console.x.ai)"
            value={xai}
            onChange={(e) => setXai(e.target.value)}
            keySet={Boolean(xaiKey?.set)}
            masked={xaiKey?.masked}
            source={xaiKey?.source}
            onRemove={() => removeKey("XAI_API_KEY")}
            removing={removingKey === "XAI_API_KEY"}
            saving={saving}
          />

          <label className="bindings-label" htmlFor="bind-agent-url">
            glyph-agent URL
          </label>
          <input
            id="bind-agent-url"
            className="bindings-input"
            type="url"
            autoComplete="off"
            spellCheck={false}
            value={agentUrl}
            disabled={saving}
            onChange={(e) => setAgentUrl(e.target.value)}
          />
        </div>

        <div className="bindings-actions">
          <button
            type="submit"
            className="pill pill-btn primary"
            disabled={saving || loading || Boolean(removingKey)}
          >
            {saving ? "Speichern…" : "Speichern"}
          </button>
          <button
            type="button"
            className="pill pill-btn ghost"
            disabled={loading || saving || Boolean(removingKey)}
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
