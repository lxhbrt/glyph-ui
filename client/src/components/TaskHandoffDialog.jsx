import { useEffect, useRef, useState } from "react";
import { handleDialogTab } from "../utils/focusTrap.js";
import {
  TASK_HEADS,
  cleanArtifact,
  cleanPass,
  headLabel,
  sanitizeEvidence,
  tasksEndpointError,
} from "../utils/tasks.js";

/** Creates a durable, selected-context handoff; it never transfers a whole session. */
export function TaskHandoffDialog({ source, message, userMessage, onClose, onUsePrompt }) {
  const dialogRef = useRef(null);
  const [title, setTitle] = useState(() => (message?.text || userMessage?.text || "Aufgabe").slice(0, 120));
  const [summary, setSummary] = useState("");
  const [pass, setPass] = useState("");
  const [artifact, setArtifact] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  useEffect(() => {
    const root = dialogRef.current;
    const first = root?.querySelector("input, select, textarea");
    first?.focus?.();
    function onKey(e) {
      if (handleDialogTab(root, e)) return;
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setSaving(true); setError("");
    try {
      const r = await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, target, source,
          summary,
          pass: cleanPass(pass),
          artifact: cleanArtifact(artifact),
          evidence: sanitizeEvidence({
            prompt: userMessage?.text || "",
            answer: message?.text || "",
            trace: message?.trace,
            attachments: userMessage?.attachments,
          }),
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(tasksEndpointError(json, r.status));
      const promptResponse = await fetch(`/api/tasks/${encodeURIComponent(json.item.id)}/prompt`);
      const promptJson = await promptResponse.json().catch(() => ({}));
      if (!promptResponse.ok) {
        throw new Error(tasksEndpointError(promptJson, promptResponse.status, "Übergabe-Prompt fehlt"));
      }
      setCreated({ item: json.item, prompt: promptJson.prompt || "" });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  const savedTarget = created?.item?.target;

  return (
    <div className="task-handoff-backdrop" role="dialog" aria-modal="true" aria-label="Als Aufgabe übergeben">
      <div className="task-handoff-dialog" ref={dialogRef}>
        <button className="task-handoff-close" type="button" onClick={onClose} aria-label="Schließen">×</button>
        <h2>Als Aufgabe übergeben</h2>
        {created ? <>
          <p>
            Aufgabe <strong>{created.item.title}</strong> ist{" "}
            {savedTarget ? `für ${headLabel(savedTarget)}` : "ohne Zielkopf"} gespeichert.
            Sie steht unter Plan &amp; Aktivität.
          </p>
          <button type="button" className="composer-sheet-go" onClick={() => onUsePrompt?.(created.prompt)}>Übergabe in Composer übernehmen</button>
        </> : <>
          <label>Titel<input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>Zielkopf<select value={target} onChange={(e) => setTarget(e.target.value)}>{TASK_HEADS.map(([id, label]) => <option key={id || "none"} value={id}>{label}</option>)}</select></label>
          <label>Fertig wenn<input value={pass} maxLength={400} placeholder="Woran der nächste Kopf das Ergebnis prüft" onChange={(e) => setPass(e.target.value)} /></label>
          <label>Artefakt<input value={artifact} maxLength={1000} placeholder="Pfad oder Ort — sonst beim Schließen" onChange={(e) => setArtifact(e.target.value)} /></label>
          <label>Übergabe-Notiz<textarea value={summary} placeholder="Was soll der nächste Kopf klären oder umsetzen?" onChange={(e) => setSummary(e.target.value)} /></label>
          <p className="composer-sheet-note">Nur diese Nachricht, die Meldung, Trace und Anhang-Pfade — nie die ganze Session. Fertig nur mit Artefakt. Zielkopf kann später im Plan gesetzt werden.</p>
          {error ? <p className="composer-sheet-note composer-sheet-note--err">{error}</p> : null}
          <button type="button" className="composer-sheet-go" disabled={saving || !title.trim() || !pass.trim()} onClick={save}>{saving ? "Speichere…" : "Aufgabe speichern"}</button>
        </>}
      </div>
    </div>
  );
}
