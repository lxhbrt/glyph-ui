/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useRef, useState } from "react";

function ActivityCalendar({ open, onClose, onOpenSession }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setSelected(null);
    setError("");
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/activity?weeks=20");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Aktivität laden fehlgeschlagen");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const dayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const formatDay = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="overview-scrim" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="overview-panel cal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Aktivitäts-Kalender"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <header className="overview-head">
          <div>
            <p className="overview-kicker">Aktivität</p>
            <h2>Kalender</h2>
            <p className="overview-meta">
              {data
                ? `${data.activeDays} aktive Tage · ${data.totalEvents} Events · Peak ${data.peakDate || "—"}`
                : "Wann du gearbeitet hast — und woran"}
            </p>
          </div>
          <div className="overview-head-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Schließen
            </button>
          </div>
        </header>

        <p className="overview-hint">
          <strong>Gelb</strong> = aktiv.{" "}
          <strong>Heller</strong> = weniger · <strong>Dunkler</strong> = häufiger.{" "}
          <strong>Peak</strong> = dunkelstes Kästchen mit Auge. Klick = Sessions des Tages.
        </p>

        {error ? <div className="banner">{error}</div> : null}
        {loading ? (
          <div className="empty-inline">Lade Aktivität…</div>
        ) : data ? (
          <div className="cal-body">
            <div className="cal-chart" role="img" aria-label="Aktivitäts-Heatmap">
              <div className="cal-day-labels" aria-hidden="true">
                {dayLabels.map((lab, i) => (
                  <span key={lab} className={i % 2 === 1 ? "cal-day-label" : "cal-day-label cal-day-label--dim"}>
                    {i % 2 === 1 ? lab : ""}
                  </span>
                ))}
              </div>
              <div className="cal-grid-wrap">
                <div className="cal-grid">
                  {(data.weeks || []).map((week, wi) => (
                    <div className="cal-week" key={`w-${wi}`}>
                      {week.map((cell) => {
                        if (cell.empty) {
                          return (
                            <span
                              key={cell.date}
                              className="cal-cell cal-cell--pad"
                              aria-hidden="true"
                            />
                          );
                        }
                        const isSel = selected?.date === cell.date;
                        return (
                          <button
                            key={cell.date}
                            type="button"
                            className={[
                              "cal-cell",
                              `cal-cell--l${cell.level}`,
                              cell.peak ? "cal-cell--peak" : "",
                              isSel ? "cal-cell--selected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            title={`${cell.date}: ${cell.count} Events${cell.peak ? " · Peak" : ""}`}
                            aria-label={`${cell.date}, ${cell.count} Events${cell.peak ? ", Peak" : ""}`}
                            aria-pressed={isSel}
                            onClick={() => setSelected(cell)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="cal-legend" aria-hidden="true">
              <span className="cal-legend-label">weniger</span>
              {[0, 1, 2, 3, 4].map((lv) => (
                <span
                  key={lv}
                  className={`cal-cell cal-cell--l${lv}${lv === 4 ? " cal-cell--peak" : ""}`}
                />
              ))}
              <span className="cal-legend-label">mehr · Peak</span>
            </div>

            <div className="cal-detail">
              {selected ? (
                <>
                  <h3 className="cal-detail-title">
                    {formatDay(selected.date)}
                    {selected.peak ? (
                      <span className="cal-peak-badge" title="Peak-Tag">
                        Peak
                      </span>
                    ) : null}
                  </h3>
                  <p className="cal-detail-meta">
                    {selected.count} Events · {selected.sessions?.length || 0} Session
                    {(selected.sessions?.length || 0) === 1 ? "" : "s"}
                  </p>
                  {selected.sessions?.length ? (
                    <ul className="cal-session-list">
                      {selected.sessions.map((s) => (
                        <li key={s.id} className="cal-session-row">
                          <div className="cal-session-main">
                            <span className="cal-session-title">{s.title}</span>
                            <span className="cal-session-count">{s.count}</span>
                          </div>
                          <button
                            type="button"
                            className="ghost cal-session-open"
                            onClick={async () => {
                              try {
                                const res = await fetch(
                                  `/api/sessions/${s.id}/open`,
                                  { method: "POST" },
                                );
                                const json = await res.json();
                                if (!res.ok) {
                                  throw new Error(
                                    json.error || "Session nicht öffnenbar",
                                  );
                                }
                                onOpenSession?.(json);
                                onClose?.();
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : String(err),
                                );
                              }
                            }}
                            title="Session öffnen (falls noch auf Disk)"
                          >
                            Öffnen
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="cal-detail-empty">Keine Session-Details für diesen Tag.</p>
                  )}
                </>
              ) : (
                <p className="cal-detail-empty">
                  Wähle ein Kästchen — dann siehst du, woran du an dem Tag gearbeitet hast.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export { ActivityCalendar };
