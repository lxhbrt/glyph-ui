/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatWhen } from "../utils/format.js";
import { SummarizeDialog } from "./SummarizeDialog.jsx";

function CommandOverview({ open, onClose, onOpenSession, canSummarize = false, profile = "grok" }) {
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [closingId, setClosingId] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  /** Aktive Session, deren Zusammenfassungs-Dialog geöffnet ist. */
  const [summaryTarget, setSummaryTarget] = useState(null);
  /** Cursor in the list — NOT the live agent session. */
  const [selectedIndex, setSelectedIndex] = useState(0);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const rowRefs = useRef(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sessions");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setLastResult(null);
      setConfirmId(null);
      setSelectedIndex(0);
      void load();
      // Lupe opens sessions + search together — focus filter field
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, load]);

  const filtered = useMemo(() => {
    const list = data?.sessions || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      [s.title, s.summary, s.cwd, s.model, s.agent, s.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, query]);

  // Keep selection in range when filter/list changes
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((i) => Math.min(Math.max(0, i), filtered.length - 1));
  }, [filtered.length, query]);

  // Scroll selected row into view
  useEffect(() => {
    const id = filtered[selectedIndex]?.id;
    if (!id) return;
    const el = rowRefs.current.get(id);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, filtered]);

  const closeSession = useCallback(
    async (id, { writeWiki = true, deleteDisk = true } = {}) => {
      setClosingId(id);
      setError("");
      setLastResult(null);
      try {
        const res = await fetch(`/api/sessions/${id}/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ writeWiki, deleteDisk }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Schließen fehlgeschlagen");
        setLastResult(json);
        setConfirmId(null);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setClosingId(null);
      }
    },
    [load],
  );

  const openSessionById = useCallback(
    async (id) => {
      if (!id || opening) return;
      setOpening(true);
      setError("");
      try {
        const res = await fetch(`/api/sessions/${id}/open`, { method: "POST" });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Session konnte nicht geladen werden");
        }
        onOpenSession?.(json);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setOpening(false);
      }
    },
    [opening, onOpenSession, onClose],
  );

  const openSelected = useCallback(async () => {
    const s = filtered[selectedIndex];
    if (!s) return;
    await openSessionById(s.id);
  }, [filtered, selectedIndex, openSessionById]);

  const onPanelKeyDown = useCallback(
    (e) => {
      // Don't steal keys while typing in search or confirming close buttons
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          // leave search and navigate list
          e.preventDefault();
          panelRef.current?.focus();
          if (e.key === "ArrowDown") {
            setSelectedIndex((i) =>
              Math.min(filtered.length - 1, Math.max(0, i) + 1),
            );
          } else {
            setSelectedIndex((i) => Math.max(0, i - 1));
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) =>
          Math.min(filtered.length - 1, Math.max(0, i) + 1),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void openSelected();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (confirmId) setConfirmId(null);
        else onClose();
      }
    },
    [filtered.length, openSelected, onClose, confirmId],
  );

  if (!open) return null;

  return (
    <div className="overview-scrim" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="overview-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command Overview"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
      >
        <header className="overview-head">
          <div>
            <p className="overview-kicker">Suche &amp; Sessions</p>
            <h2>Sessions</h2>
            <p className="overview-meta">
              {data
                ? `${data.count} on record · ${data.totalLabel} lokal`
                : "…"}
              {data?.wikiRoot ? (
                <>
                  <br />
                  <span className="muted-path">Wiki → sources/grok-sessions</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="overview-head-actions">
            <button type="button" onClick={() => void load()} disabled={loading}>
              {loading ? "…" : "Aktualisieren"}
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              Schließen
            </button>
          </div>
        </header>

        <p className="overview-hint">
          <strong>Auswählen:</strong> Klick oder ↑↓ — Markierung (nicht „aktiv“).{" "}
          <strong>Laden:</strong> Enter oder Doppelklick (Verlauf öffnen).{" "}
          <strong>Schließen:</strong> Ja + Wiki · Löschen (/delete) · Abbrechen.
          Disk: <code>~/.grok/sessions</code>.
        </p>

        <input
          ref={searchRef}
          className="overview-search"
          type="search"
          placeholder="Sessions suchen: Titel, Workspace, Model…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
        />

        {error ? <div className="banner">{error}</div> : null}
        {opening ? (
          <div className="banner ok-banner">Session wird geladen…</div>
        ) : null}
        {lastResult ? (
          <div className="banner ok-banner">
            {lastResult.wikiWritten
              ? "Ja + Wiki: "
              : lastResult.diskDeleted
                ? "Gelöscht (/delete): "
                : "Geschlossen: "}
            {lastResult.session?.title || lastResult.session?.id}
            {lastResult.freedLabel ? ` · freigegeben ${lastResult.freedLabel}` : ""}
            {lastResult.wikiPath ? (
              <>
                <br />
                <code>{lastResult.wikiPath}</code>
              </>
            ) : null}
          </div>
        ) : null}
        {data?.cleaned?.removed > 0 ? (
          <div className="banner ok-banner">
            Leere Chats bereinigt: {data.cleaned.removed}
            {data.cleaned.freedLabel
              ? ` · freigegeben ${data.cleaned.freedLabel}`
              : ""}
          </div>
        ) : null}

        <div className="overview-list" ref={listRef} role="listbox" aria-label="Sessions">
          {loading && !data ? (
            <div className="empty-inline">Lade Sessions…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-inline">Keine Sessions.</div>
          ) : (
            filtered.map((s, index) => {
              const isActive = data?.activeSessionId === s.id;
              const isSelected = index === selectedIndex;
              const confirming = confirmId === s.id;
              return (
                <article
                  key={s.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(s.id, el);
                    else rowRefs.current.delete(s.id);
                  }}
                  role="option"
                  aria-selected={isSelected}
                  className={[
                    "session-row",
                    isSelected ? "is-selected" : "",
                    isActive ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedIndex(index)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    setSelectedIndex(index);
                    void openSessionById(s.id);
                  }}
                >
                  <div className="session-main">
                    <div className="session-title-row">
                      <strong>{s.title}</strong>
                      {isActive ? <span className="tag">aktiv</span> : null}
                      {isSelected && !isActive ? (
                        <span className="tag muted">markiert</span>
                      ) : null}
                      {s.kind === "subagent" ? (
                        <span className="tag muted">subagent</span>
                      ) : null}
                      {s.empty ? (
                        <span className="tag muted">leer</span>
                      ) : null}
                    </div>
                    <div className="session-sub">
                      {s.diskLabel} · {s.chatMessages ?? "?"} msgs ·{" "}
                      {formatWhen(s.updatedAt)}
                      {s.model ? ` · ${s.model}` : ""}
                    </div>
                    <div className="session-id">{s.id}</div>
                  </div>
                  <div
                    className="session-actions"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    {confirming ? (
                      <>
                        <button
                          type="button"
                          className="primary"
                          disabled={closingId === s.id || isActive || opening}
                          title="Zusammenfassen → Wiki → dann Session-Ordner löschen"
                          onClick={() =>
                            void closeSession(s.id, {
                              writeWiki: true,
                              deleteDisk: true,
                            })
                          }
                        >
                          {closingId === s.id ? "…" : "Ja + Wiki"}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={closingId === s.id || isActive || opening}
                          title="TUI /delete — Session-Historie endgültig löschen (ohne Wiki)"
                          onClick={() =>
                            void closeSession(s.id, {
                              writeWiki: false,
                              deleteDisk: true,
                            })
                          }
                        >
                          {closingId === s.id ? "…" : "Löschen"}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={closingId === s.id}
                          onClick={() => setConfirmId(null)}
                        >
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="primary"
                          disabled={opening}
                          title="Verlauf laden (Enter / Doppelklick)"
                          onClick={() => {
                            setSelectedIndex(index);
                            void openSessionById(s.id);
                          }}
                        >
                          Öffnen
                        </button>
                        {canSummarize && (
                          <button
                            type="button"
                            disabled={opening || isActive || s.empty || !s.chatMessages}
                            title={
                              s.empty || !s.chatMessages
                                ? "Session ohne Nachrichten — Zusammenfassung nicht möglich"
                                : isActive
                                  ? "Aktive Session geschützt — erst Stift (Neuer Chat)"
                                  : "Session zusammenfassen (Vorschau → Bestätigen)"
                            }
                            onClick={() => setSummaryTarget({ id: s.id, title: s.title || "Session" })}
                          >
                            Zusammenfassen
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={closingId === s.id || isActive || opening}
                          title={
                            isActive
                              ? "Aktive Chat-Session geschützt — zuerst Stift (Neuer Chat /new)"
                              : "Ja + Wiki · Löschen (/delete) · Abbrechen"
                          }
                          onClick={() => setConfirmId(s.id)}
                        >
                          Schließen
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      {summaryTarget && (
        <SummarizeDialog
          sessionId={summaryTarget.id}
          sessionTitle={summaryTarget.title}
          profile={profile}
          onClose={() => setSummaryTarget(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

export { CommandOverview };
