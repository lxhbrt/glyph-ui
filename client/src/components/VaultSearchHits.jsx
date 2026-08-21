/**
 * Trefferliste der manuellen Ordner-Suche — einzeln zu- und abschaltbar.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { hitId, hitKindLabel } from "../utils/vaultSearch.js";
import { ComposerSheet } from "./ComposerSheet.jsx";

function sheetLabel(fallback, hits) {
  const src = String(fallback || "");
  if (src === "dguv") return "DGUV";
  if (src === "komnet") return "KOMNET";
  if ((hits || []).some((h) => h.kind === "web")) {
    const dguv = hits.some(
      (h) => h.source === "dguv" || String(h.path || "").includes("dguv.de"),
    );
    return dguv ? "DGUV" : "KOMNET";
  }
  return "ORDNER";
}

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
}) {
  const n = hits.length;
  const chosen = selectedIds instanceof Set ? selectedIds : new Set();
  const onCount = hits.filter((h) => chosen.has(hitId(h))).length;

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
    <ComposerSheet
      label={sheetLabel(fallback, hits)}
      count={busy || !n ? null : `${onCount}/${n}`}
      current={query || null}
      onDismiss={onDismiss}
      dismissTitle={busy ? "Suche abbrechen" : "Treffer verwerfen"}
      dismissLabel={busy ? "Suche abbrechen" : "Treffer verwerfen"}
      ariaLabel="Ordner-Suche"
      footer={
        !busy && !error && n > 0 ? (
          <>
            <span className="composer-sheet-footnote">
              {onCount > 0 ? `${onCount} aktiviert` : "Keine Treffer aktiviert"}
            </span>
            <button
              type="button"
              className="composer-sheet-go"
              disabled={onCount === 0}
              onClick={onSend}
            >
              Mit Auswahl senden
            </button>
          </>
        ) : null
      }
    >
      {body}
    </ComposerSheet>
  );
}
