/**
 * SummarizeDialog — nicht-destruktiver Preview-Flow für Session-Zusammenfassungen.
 *
 * Ablauf: Draft anfragen (POST /summarize/draft) → Vorschau anzeigen →
 *   Bestätigen&Speichern (commit) · Bearbeiten (Textfeld) · Abbrechen.
 * Jeder Commit = neuer Snapshot (Zeitstempel im Dateinamen). Erneutes
 * Zusammenfassen nach weiteren Turns ist erlaubt und erwünscht (Checkpoints
 * für °_Agent / ^_Code ohne Grok-Disk-Verlauf). Alte Dateien bleiben.
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useMemo, useState } from "react";

function SummarizeDialog({ sessionId, sessionTitle, profile = "glyph-agent", onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [target, setTarget] = useState(null);
  const [error, setError] = useState("");
  const [errorPhase, setErrorPhase] = useState(""); // "draft" | "commit" | ""
  const [external, setExternal] = useState(false);
  const [externalConsent, setExternalConsent] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [saved, setSaved] = useState(false);
  const [savedFile, setSavedFile] = useState("");

  /** Entwurf anfordern (nicht-destruktiv, schreibt nichts). Aktueller Verlauf. */
  const generateDraft = useCallback(
    async (prof = profile) => {
      setLoading(true);
      setError("");
      setErrorPhase("");
      setDraft(null);
      setSaved(false);
      setSavedFile("");
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
        // Defensive: Draft muss ein Objekt mit .title sein, sonst klarer Fehler statt Crash.
        if (!json || typeof json !== "object" || !json.draft || typeof json.draft !== "object") {
          throw new Error("Server antwortete ohne gültigen Entwurf (draft).");
        }
        setDraft(json.draft);
        setTarget(json.target || null);
        setExternal(!!json.external_processing);
        setEditTitle(json.draft?.title ?? "");
        setEditSummary(json.draft?.summary ?? "");
      } catch (err) {
        setErrorPhase("draft");
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

  /** Speichern — nur nach Bestätigung; bei externem Profil mit Zustimmung.
   *  Immer neuer Snapshot — alte Zusammenfassungen dieser Session bleiben. */
  const commit = useCallback(async () => {
    setSaving(true);
    setError("");
    setErrorPhase("");
    try {
      if (external && !externalConsent) {
        setErrorPhase("commit");
        setError(
          "Externes Profil (Cloud): Bestätigung erforderlich, bevor Session-Inhalte verarbeitet werden.",
        );
        return;
      }
      // Ohne Bearbeiten: Server baut aus aktuellem Verlauf (inkl. neuer Turns).
      // Mit Bearbeiten: Client-Text speichern.
      const payloadDraft = editMode
        ? {
            title: editTitle,
            summary: editSummary,
            decisions: draft?.decisions,
            next_steps: draft?.next_steps,
            open_items: draft?.open_items,
            references: draft?.references,
          }
        : undefined;
      const res = await fetch(`/api/sessions/${sessionId}/summarize/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          draft: payloadDraft,
          use_client_draft: editMode,
          external_consent: external ? externalConsent : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Speichern fehlgeschlagen");
      }
      setSaved(true);
      setSavedFile(json.fileName || json.path || target?.fileName || "");
      if (typeof onSaved === "function") onSaved(json);
    } catch (err) {
      setErrorPhase("commit");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [profile, draft, editMode, editTitle, editSummary, external, externalConsent, sessionId, onSaved, target]);

  const close = useCallback(() => {
    if (saving) return;
    if (typeof onClose === "function") onClose();
  }, [saving, onClose]);

  const prettyPath = useMemo(() => {
    if (savedFile) return savedFile;
    if (!target?.fileName) return "";
    return target.absolutePath || target.fileName || "";
  }, [target, savedFile]);

  const turnHint = useMemo(() => {
    const c = draft?.turn_counts;
    if (!c) return "";
    return `${c.user ?? "?"} Nutzer- · ${c.assistant ?? "?"} Antwort-Turns`;
  }, [draft]);

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

          <p className="summarize-profile-line">
            Profil: <strong>{profile}</strong>
            {turnHint ? <> · {turnHint}</> : null}
            {" · "}
            Snapshot: <code>{target?.fileName || sessionId}</code>
          </p>

          {loading && <p className="summarize-status">Erzeuge Entwurf aus aktuellem Verlauf…</p>}

          {error ? (
            <p className="summarize-error">
              <b>{errorPhase === "commit" ? "Speichern:" : "Entwurf:"}</b> {error}
            </p>
          ) : null}

          {saved && (
            <div className="summarize-success">
              <p>
                Snapshot gespeichert: <code>{prettyPath}</code>
              </p>
              <p className="summarize-hint">
                Weitere Nachrichten möglich — später erneut zusammenfassen erzeugt einen{" "}
                <strong>neuen</strong> Snapshot (alte Dateien bleiben).
              </p>
              <div className="summarize-actions">
                <button type="button" onClick={() => void generateDraft()}>
                  Nochmal (aktueller Stand)
                </button>
                <button type="button" className="primary" onClick={close}>
                  Schließen
                </button>
              </div>
            </div>
          )}

          {!loading && draft && !saved && (
            <div className="summarize-preview">
              {external && (
                <div className="summarize-external-warning">
                  ⚠️ Externes Profil (Cloud): Session-Inhalte verlassen den Rechner.
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
                  <h4>{draft?.title}</h4>
                  <p>{draft?.summary}</p>
                  {Array.isArray(draft?.decisions) && draft.decisions.length > 0 && (
                    <>
                      <strong>Entscheidungen / Nutzer-Turns (letzte)</strong>
                      <ul>
                        {draft.decisions.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {Array.isArray(draft?.next_steps) && draft.next_steps.length > 0 && (
                    <>
                      <strong>Nächste Schritte / letzte Antworten</strong>
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
                Neuer Snapshot: <code>{prettyPath}</code>
              </p>

              <div className="summarize-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={saving || (external && !externalConsent)}
                  onClick={() => void commit()}
                >
                  {saving ? "Speichere…" : "Bestätigen & speichern"}
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
                  disabled={saving || loading}
                  onClick={() => void generateDraft()}
                  title="Entwurf aus dem aktuellen Chat neu erzeugen"
                >
                  Neu laden
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
