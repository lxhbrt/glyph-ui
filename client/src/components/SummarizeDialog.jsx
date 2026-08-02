/**
 * SummarizeDialog — nicht-destruktiver Preview-Flow für Session-Zusammenfassungen.
 *
 * Ablauf: Draft anfragen (POST /summarize/draft) → Vorschau anzeigen →
 *   Bestätigen&Speichern (commit) · Bearbeiten (Textfeld) · Abbrechen · erneut generieren.
 * Sicherheit: openrouter (extern) verlangt explizite Zustimmung, bevor Session-Inhalte
 * die Cloud verlassen. Keine automatische Überschreibung (409 wird verständlich gezeigt).
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const PROFILES = [
  { id: "glyph-agent", label: "Glyph-Agent (lokal)" },
  { id: "openrouter", label: "OpenRouter (extern)" },
  { id: "grok", label: "Grok" },
  { id: "claude", label: "Claude" },
];

function SummarizeDialog({ sessionId, sessionTitle, onClose, onSaved }) {
  const [profile, setProfile] = useState("glyph-agent");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [target, setTarget] = useState(null);
  const [error, setError] = useState("");
  const [external, setExternal] = useState(false);
  const [externalConsent, setExternalConsent] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [saved, setSaved] = useState(false);

  /** Entwurf anfordern (nicht-destruktiv, schreibt nichts). */
  const generateDraft = useCallback(
    async (prof = profile) => {
      setLoading(true);
      setError("");
      setDraft(null);
      setSaved(false);
      setEditMode(false);
      setExternalConsent(false);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/summarize/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: prof }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Entwurf fehlgeschlagen");
        setDraft(json.draft);
        setTarget(json.target);
        setExternal(!!json.external_processing);
        setEditTitle(json.draft?.title || "");
        setEditSummary(json.draft?.summary || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [profile, sessionId],
  );

  // Automatisch Entwurf erzeugen, sobald das Dialog geöffnet wird (Profile-Wechsel erneuert).
  useEffect(() => {
    if (sessionId) void generateDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /** Speichern — nur nach Bestätigung; bei externem Profil mit Zustimmung. */
  const commit = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      if (external && !externalConsent) {
        setError(
          "Externes Profil (openrouter): Bestätigung erforderlich, bevor Session-Inhalte verarbeitet werden.",
        );
        return;
      }
      const payloadDraft = editMode
        ? { title: editTitle, summary: editSummary }
        : draft;
      const res = await fetch(`/api/sessions/${sessionId}/summarize/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          draft: payloadDraft,
          external_consent: external ? externalConsent : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Speichern fehlgeschlagen");
      }
      setSaved(true);
      if (typeof onSaved === "function") onSaved(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [profile, draft, editMode, editTitle, editSummary, external, externalConsent, sessionId, onSaved]);

  /** Erneutes Generieren: nur Entwurf ersetzen, kein Persistieren. */
  const regenerate = useCallback(() => {
    setDraft(null);
    void generateDraft(profile);
  }, [generateDraft, profile]);

  const close = useCallback(() => {
    if (saving) return;
    if (typeof onClose === "function") onClose();
  }, [saving, onClose]);

  const prettyPath = useMemo(() => {
    if (!target?.fileName) return "";
    return target.absolutePath || target.fileName || "";
  }, [target]);

  return (
    <div className="summarize-overlay" role="dialog" aria-modal="true" aria-label="Session zusammenfassen">
      <div className="summarize-dialog">
        <div className="summarize-header">
          <h3>Session zusammenfassen</h3>
          <button type="button" className="summary-ghost" onClick={close} disabled={saving} aria-label="Schließen">
            ✕
          </button>
        </div>

        <div className="summarize-body">
          <p className="summarize-session">
            <strong>{sessionTitle || "Session"}</strong>
            <code className="summarize-id">{sessionId?.slice(0, 8)}</code>
          </p>

          <label className="summarize-label" htmlFor="summarize-profile">
            Profil / Modell
          </label>
          <select
            id="summarize-profile"
            className="summarize-select"
            value={profile}
            disabled={loading || saving || !!draft}
            onChange={(e) => {
              const next = e.target.value;
              setProfile(next);
              setDraft(null);
              void generateDraft(next);
            }}
          >
            {PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          {loading && <p className="summarize-status">Erzeuge Entwurf…</p>}

          {error && <p className="summarize-error">{error}</p>}

          {saved && (
            <p className="summarize-success">
              ✅ Zusammenfassung gespeichert: <code>{target?.fileName || ""}</code>
            </p>
          )}

          {!loading && draft && !saved && (
            <div className="summarize-preview">
              {external && (
                <div className="summarize-external-warning">
                  ⚠️ Externes Profil (openrouter): Session-Inhalte verlassen den Rechner.
                  <label className="summarize-consent">
                    <input
                      type="checkbox"
                      checked={externalConsent}
                      onChange={(e) => setExternalConsent(e.target.checked)}
                      disabled={saving}
                    />
                    Ich bestätige die externe Verarbeitung
                  </label>
                </div>
              )}

              {editMode ? (
                <div className="summarize-edit">
                  <label className="summarize-label">Titel</label>
                  <input
                    className="summarize-input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                  <label className="summarize-label">Zusammenfassung</label>
                  <textarea
                    className="summarize-textarea"
                    rows={5}
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                  />
                </div>
              ) : (
                <div className="summarize-rendered">
                  <h4>{draft.title}</h4>
                  <p>{draft.summary}</p>
                  {Array.isArray(draft.decisions) && draft.decisions.length > 0 && (
                    <>
                      <strong>Entscheidungen</strong>
                      <ul>
                        {draft.decisions.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {Array.isArray(draft.next_steps) && draft.next_steps.length > 0 && (
                    <>
                      <strong>Nächste Schritte</strong>
                      <ul>
                        {draft.next_steps.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              <p className="summarize-target">
                Ziel: <code>{prettyPath}</code>
              </p>

              <div className="summarize-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={saving || (external && !externalConsent)}
                  onClick={() => void commit()}
                >
                  {saving ? "Speichere…" : editMode ? "Bestätigen & speichern" : "Bestätigen & speichern"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditMode((v) => !v)}
                >
                  {editMode ? "Vorschau" : "Bearbeiten"}
                </button>
                <button
                  type="button"
                  className="summary-ghost"
                  disabled={loading || saving}
                  onClick={regenerate}
                >
                  Erneut generieren
                </button>
                <button
                  type="button"
                  className="summary-ghost"
                  disabled={saving}
                  onClick={close}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { SummarizeDialog };
