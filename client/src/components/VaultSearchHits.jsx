/**
 * Trefferliste der manuellen Ordner-Suche — einzeln zu- und abschaltbar.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { hitId } from "../utils/vaultSearch.js";

export function VaultSearchHits({
  query,
  hits = [],
  selectedIds,
  busy,
  error,
  onToggle,
  onDismiss,
  onSend,
}) {
  const n = hits.length;
  const chosen = selectedIds instanceof Set ? selectedIds : new Set();
  const onCount = hits.filter((h) => chosen.has(hitId(h))).length;

  let body = null;
  if (busy) {
    body = <p className="vault-hits-note">Suche…</p>;
  } else if (error) {
    body = <p className="vault-hits-note vault-hits-note--err">{error}</p>;
  } else if (n === 0) {
    body = <p className="vault-hits-note">Keine Treffer im Vault.</p>;
  } else {
    body = (
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
                    {h.kind === "folder" ? "Ordner" : "Datei"}
                    {" · "}
                    {h.title}
                  </span>
                  {h.excerpt ? (
                    <span className="vault-hit-excerpt">{h.excerpt}</span>
                  ) : h.path && h.path !== h.title ? (
                    <span className="vault-hit-excerpt">{h.path}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="vault-hits" aria-label="Ordner-Suche">
      <div className="vault-hits-head">
        <span className="vault-hits-label">
          {busy
            ? "Ordner-Suche"
            : n
              ? `Ordner-Suche · ${onCount}/${n}`
              : "Ordner-Suche"}
        </span>
        {query ? (
          <span className="vault-hits-query" title={query}>
            {query}
          </span>
        ) : null}
        <button
          type="button"
          className="vault-hits-dismiss"
          onClick={onDismiss}
          title="Treffer verwerfen"
          aria-label="Treffer verwerfen"
        >
          ×
        </button>
      </div>
      {body}
      {!busy && !error && n > 0 ? (
        <div className="vault-hits-footer">
          <span className="vault-hits-count">
            {onCount > 0
              ? `${onCount} aktiviert`
              : "Keine Treffer aktiviert"}
          </span>
          <button
            type="button"
            className="vault-hits-send"
            disabled={onCount === 0}
            onClick={onSend}
          >
            Mit Auswahl senden
          </button>
        </div>
      ) : null}
    </div>
  );
}
