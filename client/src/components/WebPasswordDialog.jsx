/**
 * Change the Web-Tor password from the Web-Fläche (logged-in user).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

import { useEffect, useRef, useState } from "react";
import { handleDialogTab } from "../utils/focusTrap.js";

export function WebPasswordDialog({ onClose }) {
  const rootRef = useRef(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    root?.querySelector("input")?.focus?.();
    function onKey(e) {
      if (handleDialogTab(root, e)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    if (busy || ok) return;
    setError("");
    if (next !== confirm) {
      setError("Neue Passwörter stimmen nicht überein");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/web-gate/password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Ändern fehlgeschlagen");
        setBusy(false);
        return;
      }
      setOk(true);
      setBusy(false);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
      setBusy(false);
    }
  }

  return (
    <div
      className="web-password-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <form
        ref={rootRef}
        className="web-password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="web-password-title"
        onSubmit={(e) => void submit(e)}
      >
        <h2 id="web-password-title" className="web-password-title">
          Passwort ändern
        </h2>
        <p className="web-password-copy">Gilt für glyph-ui.com. Andere Geräte müssen sich neu anmelden.</p>
        <label className="web-gate-label">
          <span className="sr-only">Aktuelles Passwort</span>
          <input
            type="password"
            name="current-password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Aktuell"
            className="web-gate-input"
            disabled={ok}
          />
        </label>
        <label className="web-gate-label">
          <span className="sr-only">Neues Passwort</span>
          <input
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Neu (min. 8 Zeichen)"
            className="web-gate-input"
            disabled={ok}
          />
        </label>
        <label className="web-gate-label">
          <span className="sr-only">Neues Passwort wiederholen</span>
          <input
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Neu wiederholen"
            className="web-gate-input"
            disabled={ok}
          />
        </label>
        {error ? (
          <p className="web-gate-error" role="alert">
            {error}
          </p>
        ) : null}
        {ok ? (
          <p className="web-password-ok" role="status">
            Gespeichert.
          </p>
        ) : null}
        <div className="web-password-actions">
          <button type="button" className="web-password-cancel" onClick={() => onClose?.()}>
            {ok ? "Schließen" : "Abbrechen"}
          </button>
          {ok ? null : (
            <button
              type="submit"
              className="web-gate-submit"
              disabled={busy || !current || !next || !confirm}
            >
              {busy ? "…" : "Speichern"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
