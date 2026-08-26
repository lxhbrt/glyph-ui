/**
 * Password gate for the public Web-Fläche (glyph-ui.com).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

import { useState } from "react";

export function WebGate({ onUnlocked }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/web-gate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Passwort falsch");
        setBusy(false);
        return;
      }
      onUnlocked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
      setBusy(false);
    }
  }

  return (
    <div className="web-gate">
      <form className="web-gate-card" onSubmit={(e) => void submit(e)}>
        <p className="web-gate-kicker">glyph-ui.com</p>
        <h1 className="web-gate-title">°_Agent</h1>
        <p className="web-gate-copy">Web-Fläche. Schreibtisch bleibt auf dem Mac.</p>
        <label className="web-gate-label">
          <span className="sr-only">Passwort</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort"
            className="web-gate-input"
          />
        </label>
        {error ? (
          <p className="web-gate-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="web-gate-submit" disabled={busy || !password}>
          {busy ? "…" : "Öffnen"}
        </button>
      </form>
    </div>
  );
}
