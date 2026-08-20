/**
 * SummarizeDialog — Vorschau-Flow für Session-Zusammenfassungen.
 * Sitzt in der Arbeitsleiste über der LVL-Leiste (kein Mitte-Modal).
 *
 * Ablauf: Draft anfragen (POST /summarize/draft) → Vorschau anzeigen →
 *   Speichern (commit) · Bearbeiten · ×.
 * Jeder Commit = neuer Snapshot (Zeitstempel im Dateinamen).
 *
 * Skill-Lernen: bei mehrstufigem Verlauf beim Speichern ein Skill unter
 * ~/.glyph/skills/ (Opt-out in der Leiste).
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { seatFetch } from "../utils/seat.js";
import { ComposerSheet } from "./ComposerSheet.jsx";

function SummarizeDialog({ sessionId, sessionTitle, profile = "glyph-agent", onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
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
  const [skillInfo, setSkillInfo] = useState(null);
  const [saveSkill, setSaveSkill] = useState(true);
  const [savedSkill, setSavedSkill] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const generateDraft = useCallback(
    async (prof = profile) => {
      setLoading(true);
      setError("");
      setErrorPhase("");
      setDraft(null);
      setSaved(false);
      setSavedFile("");
      setSavedSkill(null);
      setEditMode(false);
      setExternalConsent(false);
      setCollapsed(false);
      try {
        const res = await seatFetch(`/api/sessions/${sessionId}/summarize/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: prof }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Entwurf fehlgeschlagen");
        if (!json || typeof json !== "object" || !json.draft || typeof json.draft !== "object") {
          throw new Error("Server antwortete ohne gültigen Entwurf (draft).");
        }
        setDraft(json.draft);
        setTarget(json.target || null);
        setExternal(!!json.external_processing);
        setEditTitle(json.draft?.title ?? "");
        setEditSummary(json.draft?.summary ?? "");
        const sk = json.skill || json.draft?.skill || null;
        setSkillInfo(sk);
        setSaveSkill(sk?.save_default !== false && !!sk?.eligible);
      } catch (err) {
        setErrorPhase("draft");
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [profile, sessionId],
  );

  useEffect(() => {
    if (sessionId) void generateDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
      const res = await seatFetch(`/api/sessions/${sessionId}/summarize/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          draft: payloadDraft,
          use_client_draft: editMode,
          external_consent: external ? externalConsent : undefined,
          save_skill: saveSkill,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Speichern fehlgeschlagen");
      }
      setSaved(true);
      setSavedFile(json.fileName || json.path || target?.fileName || "");
      setSavedSkill(json.skill || null);
      setCollapsed(false);
      if (typeof onSaved === "function") onSaved(json);
    } catch (err) {
      setErrorPhase("commit");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    profile,
    draft,
    editMode,
    editTitle,
    editSummary,
    external,
    externalConsent,
    sessionId,
    onSaved,
    target,
    saveSkill,
  ]);

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
    return `${c.user ?? "?"}N · ${c.assistant ?? "?"}A`;
  }, [draft]);

  const current = saved
    ? "gespeichert"
    : loading
      ? "Entwurf…"
      : error && !draft
        ? "Fehler"
        : draft?.title || sessionTitle || "Session";

  let body = null;
  if (loading) {
    body = <p className="composer-sheet-note">Entwurf aus aktuellem Verlauf…</p>;
  } else {
    body = (
      <>
        {error ? (
          <p className="composer-sheet-note composer-sheet-note--err">
            {errorPhase === "commit" ? "Speichern: " : "Entwurf: "}
            {error}
          </p>
        ) : null}

        {saved ? (
          <div className="summarize-success">
            <p>
              Snapshot: <code>{prettyPath}</code>
            </p>
            {savedSkill?.written ? (
              <p className="composer-sheet-note">
                Skill ({savedSkill.action || "write"}):{" "}
                <code>
                  {savedSkill.name
                    ? `~/.glyph/skills/${savedSkill.name}/`
                    : savedSkill.path || "—"}
                </code>
                {savedSkill.action === "create"
                  ? ` — neu; Slash /${savedSkill.name || "…"}`
                  : savedSkill.action === "extend"
                    ? " — erweitert"
                    : savedSkill.action === "reference"
                      ? " — Nachtrag unter references/"
                      : null}
              </p>
            ) : savedSkill?.reason ? (
              <p className="composer-sheet-note">Skill: {savedSkill.reason}</p>
            ) : null}
            <p className="composer-sheet-note">
              Später erneut zusammenfassen erzeugt einen neuen Snapshot. Alte Dateien bleiben.
            </p>
          </div>
        ) : null}

        {!saved && draft ? (
          <div className="summarize-preview">
            {external ? (
              <div className="summarize-external-warning">
                Cloud-Profil: Session-Inhalte verlassen den Rechner.
                <label className="summarize-consent">
                  <input
                    type="checkbox"
                    checked={externalConsent}
                    onChange={(e) => setExternalConsent(e.target.checked)}
                    disabled={saving}
                  />
                  Externe Verarbeitung bestätigen
                </label>
              </div>
            ) : null}

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
                  rows={4}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                />
              </div>
            ) : (
              <div className="summarize-rendered">
                <h4>{draft?.title}</h4>
                <p>{draft?.summary}</p>
                {Array.isArray(draft?.decisions) && draft.decisions.length > 0 ? (
                  <>
                    <strong>Entscheidungen</strong>
                    <ul>
                      {draft.decisions.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {Array.isArray(draft?.next_steps) && draft.next_steps.length > 0 ? (
                  <>
                    <strong>Nächste Schritte</strong>
                    <ul>
                      {draft.next_steps.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            )}

            {prettyPath ? (
              <p className="summarize-target">
                Snapshot: <code>{prettyPath}</code>
              </p>
            ) : null}

            {skillInfo?.eligible ? (
              <label className="summarize-consent summarize-skill">
                <input
                  type="checkbox"
                  checked={saveSkill}
                  onChange={(e) => setSaveSkill(e.target.checked)}
                  disabled={saving}
                />
                Skill lernen: <code>/{skillInfo.name}</code>
              </label>
            ) : skillInfo?.reason ? (
              <p className="composer-sheet-note">Skill: {skillInfo.reason}</p>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  let footer = null;
  if (saved) {
    footer = (
      <>
        <button type="button" className="ghost composer-sheet-quiet" onClick={() => void generateDraft()}>
          Nochmal
        </button>
        <button type="button" className="composer-sheet-go" onClick={close}>
          Schließen
        </button>
      </>
    );
  } else if (!loading && draft) {
    footer = (
      <>
        <button
          type="button"
          className="composer-sheet-go"
          disabled={saving || (external && !externalConsent)}
          onClick={() => void commit()}
        >
          {saving ? "Speichere…" : "Speichern"}
        </button>
        <button
          type="button"
          className="ghost composer-sheet-quiet"
          disabled={saving}
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? "Vorschau" : "Bearbeiten"}
        </button>
        <button
          type="button"
          className="ghost composer-sheet-quiet"
          disabled={saving || loading}
          onClick={() => void generateDraft()}
          title="Entwurf aus dem aktuellen Chat neu erzeugen"
        >
          Neu laden
        </button>
      </>
    );
  } else if (error && !draft) {
    footer = (
      <button
        type="button"
        className="ghost composer-sheet-quiet"
        onClick={() => void generateDraft()}
      >
        Neu laden
      </button>
    );
  }

  return (
    <ComposerSheet
      label="SESSION"
      count={turnHint || null}
      current={collapsed || loading || saved || (error && !draft) ? current : null}
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
      onDismiss={saving ? undefined : close}
      dismissLabel="Zusammenfassen schließen"
      role="dialog"
      ariaModal={false}
      autoFocus
      ariaLabel="Session zusammenfassen"
      footer={footer}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      {body}
    </ComposerSheet>
  );
}

export { SummarizeDialog };
