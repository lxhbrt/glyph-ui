/**
 * Trefferliste der manuellen Ordner-Suche — einzeln zu- und abschaltbar.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { hitId, hitKindLabel, hitVaultLabel } from "../utils/vaultSearch.js";
import { ComposerSheet } from "./ComposerSheet.jsx";

export function VaultSearchHits({
  query,
  hits = [],
  selectedIds,
  busy,
  error,
  fallback = "",
  onToggle,
  onDismiss,
  onSend,
  onContinueWithout,
}) {
  const n = hits.length;
  const chosen = selectedIds instanceof Set ? selectedIds : new Set();
  const onCount = hits.filter((h) => chosen.has(hitId(h))).length;
  void fallback; // engine may still set KomNet/DGUV; sheet title is Hub+Copy

  let body = null;
  if (busy) {
    body = <p className="composer-sheet-note">Suche…</p>;
  } else if (error) {
    body = <p className="composer-sheet-note composer-sheet-note--err">{error}</p>;
  } else if (n === 0) {
    body = (
      <p className="composer-sheet-note">
        Keine Treffer im Vault, KomNet oder DGUV.
      </p>
    );
  } else {
    body = (
      <>
        <p className="composer-sheet-note vault-hits-subtitle">
          Erste Treffer — wähle Ordner/Dateien für den Kontext.
        </p>
        <ul className="vault-hits-list">
          {hits.map((h) => {
            const id = hitId(h);
            const on = chosen.has(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`vault-hit${on ? " is-on" : ""}`}
                  aria-pressed={on}
                  onClick={() => onToggle(id)}
                >
                  <span className="vault-hit-pip" aria-hidden="true" />
                  <span className="vault-hit-body">
                    <span className="vault-hit-title">
                      {hitKindLabel(h)}
                      {hitVaultLabel(h) ? ` · ${hitVaultLabel(h)}` : ""}
                      {" · "}
                      {h.title}
                    </span>
                    {h.excerpt ? (
                      <span className="vault-hit-excerpt">{h.excerpt}</span>
                    ) : h.path && h.path !== h.title ? (
                      <span className="vault-hit-excerpt">{h.path}</span>
                    ) : (
                      <span className="vault-hit-excerpt">leer</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <ComposerSheet
      label="Wo weitersuchen?"
      count={busy || !n ? null : `${onCount}/${n}`}
      current={query || null}
      onDismiss={onDismiss}
      dismissTitle={busy ? "Suche abbrechen" : "Treffer verwerfen"}
      dismissLabel={busy ? "Suche abbrechen" : "Treffer verwerfen"}
      ariaLabel="Wo weitersuchen?"
      footer={
        !busy && !error && n > 0 ? (
          <>
            <button
              type="button"
              className="ghost composer-sheet-quiet"
              onClick={onContinueWithout}
            >
              Ohne Auswahl weiter
            </button>
            <button
              type="button"
              className="composer-sheet-go"
              disabled={onCount === 0}
              onClick={onSend}
            >
              Übernehmen
            </button>
          </>
        ) : null
      }
    >
      {body}
    </ComposerSheet>
  );
}
