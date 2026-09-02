/**
 * Snapshot of the originating chat pair on an Aufgabe.
 * Not a session jump — °_Agent does not persist sessions.
 * Copyright (c) 2026 Alexander Hubert · MIT
 */
import { evidenceClip } from "../utils/tasks.js";

export function TaskEvidence({ prompt, answer }) {
  const promptText = String(prompt || "").trim();
  const answerText = String(answer || "").trim();
  if (!promptText && !answerText) return null;
  const preview = evidenceClip(answerText || promptText);

  return (
    <details className="task-evidence">
      <summary>
        <span className="task-evidence-kicker">Beleg</span>
        {preview ? <span className="task-evidence-preview">{preview}</span> : null}
      </summary>
      <div className="task-evidence-body">
        {promptText ? (
          <section>
            <h4>Meldung</h4>
            <pre>{promptText}</pre>
          </section>
        ) : null}
        {answerText ? (
          <section>
            <h4>Antwort</h4>
            <pre>{answerText}</pre>
          </section>
        ) : null}
      </div>
    </details>
  );
}
