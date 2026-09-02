/**
 * Aufgabe-Übergabe in der Arbeitsleiste (nicht Mitte-Modal).
 * Copyright (c) 2026 Alexander Hubert · MIT
 */
import { useState } from "react";
import { ComposerSheet } from "./ComposerSheet.jsx";
import { TaskEvidence } from "./TaskEvidence.jsx";
import {
  canCreateHandoff,
  cleanPass,
  handoffTitleFrom,
  hasHandoffPair,
  sanitizeEvidence,
  tasksEndpointError,
} from "../utils/tasks.js";

/** Creates a durable, selected-context handoff; it never transfers a whole session. */
export function TaskHandoffDialog({ source, message, userMessage, onClose, onUsePrompt }) {
  const [title, setTitle] = useState(() => handoffTitleFrom(userMessage, message));
  const [pass, setPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const promptText = userMessage?.text || "";
  const answerText = message?.text || "";
  const pairOk = hasHandoffPair({ prompt: promptText, answer: answerText });
  const canSave =
    canCreateHandoff({
      title,
      pass,
      prompt: promptText,
      answer: answerText,
    }) && !saving;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          target: "",
          source,
          summary: "",
          pass: cleanPass(pass),
          artifact: "",
          evidence: sanitizeEvidence({
            prompt: promptText,
            answer: answerText,
            trace: message?.trace,
            attachments: userMessage?.attachments,
          }),
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(tasksEndpointError(json, r.status));
      const promptResponse = await fetch(
        `/api/tasks/${encodeURIComponent(json.item.id)}/prompt`,
      );
      const promptJson = await promptResponse.json().catch(() => ({}));
      if (!promptResponse.ok) {
        throw new Error(
          tasksEndpointError(promptJson, promptResponse.status, "Übergabe-Prompt fehlt"),
        );
      }
      setCreated({ item: json.item, prompt: promptJson.prompt || "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ComposerSheet
      className="composer-sheet--handoff"
      label="AUFGABE"
      role="dialog"
      ariaModal
      autoFocus
      ariaLabel="Als Aufgabe übergeben"
      onDismiss={onClose}
      dismissTitle="Übergabe schließen"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose?.();
      }}
      footer={
        created ? (
          <button
            type="button"
            className="composer-sheet-go"
            onClick={() => onUsePrompt?.(created.prompt)}
          >
            Übernehmen
          </button>
        ) : (
          <button
            type="button"
            className="composer-sheet-go"
            disabled={!canSave}
            onClick={() => void save()}
          >
            {saving ? "…" : "Speichern"}
          </button>
        )
      }
    >
      {created ? (
        <p className="composer-sheet-note">
          <strong>{created.item.title}</strong> liegt unter Plan &amp; Aktivität.
        </p>
      ) : (
        <div className="composer-sheet-fields">
          <TaskEvidence prompt={promptText} answer={answerText} />
          <label>
            Titel
            <input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Was ist zu tun
            <input
              value={pass}
              maxLength={400}
              placeholder="Was falsch ist oder zu tun ist — nicht die Antwort kopieren"
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
          {error ? (
            <p className="composer-sheet-note composer-sheet-note--err">{error}</p>
          ) : (
            <p className="composer-sheet-note">
              {pairOk
                ? "Meldung und Antwort hängen als Beleg. Landet unter Plan & Aktivität."
                : "Ohne Meldung und Antwort keine Aufgabe."}
            </p>
          )}
        </div>
      )}
    </ComposerSheet>
  );
}
