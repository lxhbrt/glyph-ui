/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 *
 * Panel hinter dem Kalender-Icon: Plan (Aufgaben + wiederkehrende To-dos) und Aktivität.
 * Fertig-Status: klickbares „Fertig“ löscht die durchgestrichene To-do.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { seatFetch } from "../utils/seat.js";
import {
  TASK_HEADS,
  cleanArtifact,
  formatTaskMeta,
  tasksEndpointError,
} from "../utils/tasks.js";

const WEEKDAYS = [
  { v: 0, l: "Mo" },
  { v: 1, l: "Di" },
  { v: 2, l: "Mi" },
  { v: 3, l: "Do" },
  { v: 4, l: "Fr" },
  { v: 5, l: "Sa" },
  { v: 6, l: "So" },
];

function emptyForm() {
  return {
    title: "",
    prompt: "",
    pass: "",
    kind: "daily",
    time: "09:00",
    weekday: 0,
    allow_write: false,
  };
}

function todoStatusLabel(t) {
  if (t?.paused) return "Pause";
  if (t?.last_status === "error") return "Fehler";
  if (t?.last_status === "empty") return "leer";
  return "offen";
}

function scheduleLabel(s) {
  if (!s) return "—";
  if (s.kind === "weekly") {
    const d = WEEKDAYS.find((w) => w.v === s.weekday)?.l || `T${s.weekday}`;
    return `wöchentlich ${d} ${s.time}`;
  }
  return `täglich ${s.time}`;
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onOpenSession?: (json: object) => void,
 *   canSeeActivity?: boolean,
 * }} props
 */
function ActivityCalendar({ open, onClose, onOpenSession, onUseTask, canSeeActivity = true }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("plan");
  const [todos, setTodos] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [todosLoading, setTodosLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const panelRef = useRef(null);

  const loadTodos = useCallback(async () => {
    setTodosLoading(true);
    try {
      const res = await fetch("/api/recurring");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "To-dos laden fehlgeschlagen");
      setTodos(Array.isArray(json.items) ? json.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTodosLoading(false);
    }
  }, []);
  const loadTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(tasksEndpointError(json, res.status, "Aufgaben laden fehlgeschlagen"));
    setTasks(Array.isArray(json.items) ? json.items : []);
  }, []);

  async function assignTaskTarget(taskId, nextTarget) {
    setBusyId(`task-${taskId}`);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: nextTarget }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(tasksEndpointError(json, res.status, "Zielkopf speichern fehlgeschlagen"));
      if (json.item) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? json.item : t)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function markTaskDone(task) {
    let artifact = cleanArtifact(task?.artifact);
    if (!artifact) {
      artifact = cleanArtifact(window.prompt("Artefakt — Pfad oder Ort des Ergebnisses") || "");
    }
    if (!artifact) {
      setError("Fertig braucht ein Artefakt — Pfad oder Ort des Ergebnisses");
      return;
    }
    setBusyId(`task-${task.id}`);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done", artifact }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(tasksEndpointError(json, res.status, "Fertig speichern fehlgeschlagen"));
      if (json.item) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? json.item : t)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    setSelected(null);
    setError("");
    setTab("plan");
    void loadTodos();
    void loadTasks().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    if (!canSeeActivity) {
      setData(null);
      setLoading(false);
      requestAnimationFrame(() => panelRef.current?.focus());
      return undefined;
    }
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
  }, [open, canSeeActivity, loadTodos, loadTasks]);

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

  async function act(path, opts = {}) {
    setBusyId(opts.busyId || path);
    setError("");
    try {
      const res = await fetch(path, {
        method: opts.method || "POST",
        headers: opts.body ? { "Content-Type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await loadTodos();
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function onSubmitForm(e) {
    e.preventDefault();
    const schedule =
      form.kind === "weekly"
        ? { kind: "weekly", time: form.time, weekday: Number(form.weekday) }
        : { kind: "daily", time: form.time };
    if (!editId && !form.pass.trim()) {
      setError("Fertig-Kriterium fehlt — ohne prüfbares Ergebnis kein Job.");
      return;
    }
    if (!editId && form.allow_write) {
      const ok = window.confirm(
        "Auto-Schreiben erlauben?\n\nNur unter HSEQ Sync: 00 Arbeitsfluss/, Vorlagen/, Themen/.\nOhne Bestätigung: nur Lesen.",
      );
      if (!ok) return;
    }
    if (editId) {
      await act(`/api/recurring/${encodeURIComponent(editId)}`, {
        method: "PATCH",
        body: {
          title: form.title.trim(),
          prompt: form.prompt.trim(),
          pass: form.pass.trim(),
          schedule,
          allow_write: form.allow_write,
        },
        busyId: editId,
      });
    } else {
      await act("/api/recurring", {
        method: "POST",
        body: {
          title: form.title.trim(),
          prompt: form.prompt.trim(),
          pass: form.pass.trim(),
          schedule,
          allow_write: form.allow_write,
          paused: false,
        },
        busyId: "new",
      });
    }
    setForm(emptyForm());
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(t) {
    setEditId(t.id);
    setForm({
      title: t.title || "",
      prompt: t.prompt || "",
      pass: t.pass || "",
      kind: t.schedule?.kind || "daily",
      time: t.schedule?.time || "09:00",
      weekday: t.schedule?.weekday ?? 0,
      allow_write: Boolean(t.allow_write),
    });
    setShowForm(true);
  }

  return (
    <div className="overview-scrim" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="overview-panel cal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Plan und Aktivität"
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
            <p className="overview-kicker">Übersicht</p>
            <h2>Plan &amp; Aktivität</h2>
            <p className="overview-meta">
              {tab === "plan"
                ? `${tasks.length} Aufgabe${tasks.length === 1 ? "" : "n"} · ${todos.length} wiederkehrende To-do${todos.length === 1 ? "" : "s"}`
                : data
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

        <div className="cal-tabs" role="tablist" aria-label="Plan oder Aktivität">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "plan"}
            className={`cal-tab${tab === "plan" ? " cal-tab--active" : ""}`}
            onClick={() => setTab("plan")}
          >
            Plan
            {tasks.length + todos.length ? (
              <span className="cal-tab-badge" aria-hidden="true">
                {tasks.length + todos.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "activity"}
            className={`cal-tab${tab === "activity" ? " cal-tab--active" : ""}`}
            onClick={() => setTab("activity")}
            disabled={!canSeeActivity}
            title={
              canSeeActivity
                ? "Aktivitäts-Heatmap"
                : "Aktivität nur mit Grok-Profil"
            }
          >
            Aktivität
          </button>
        </div>

        {error ? <div className="banner">{error}</div> : null}

        {tab === "plan" ? (
          <div className="cal-plan" role="tabpanel" aria-label="Aufgaben und wiederkehrende To-dos">
            <section className="cal-task-section" aria-label="Übergebene Aufgaben">
              <h3>Aufgaben</h3>
              {tasks.length === 0 ? <p className="cal-detail-empty">Noch keine übergebenen Aufgaben.</p> : (
                <ul className="cal-todo-list">
                  {tasks.map((task) => <li key={task.id} className="cal-todo-item">
                    <div className="cal-todo-main">
                      <span className="cal-todo-title">{task.title}</span>
                      <span className="cal-todo-meta">{formatTaskMeta(task)}</span>
                      {task.pass ? <span className="cal-todo-preview">Fertig wenn: {task.pass}</span> : null}
                      {task.artifact ? <span className="cal-todo-preview">{task.artifact}</span> : null}
                      {task.summary ? <span className="cal-todo-preview">{task.summary}</span> : null}
                    </div>
                    <div className="cal-todo-actions">
                      <label className="cal-task-assign">
                        <span className="sr-only">Zielkopf</span>
                        <select
                          value={task.target || ""}
                          disabled={busyId === `task-${task.id}` || task.status === "done"}
                          onChange={(e) => assignTaskTarget(task.id, e.target.value)}
                        >
                          {TASK_HEADS.map(([id, label]) => (
                            <option key={id || "none"} value={id}>{label}</option>
                          ))}
                        </select>
                      </label>
                      {task.status === "done" ? null : (
                        <button
                          type="button"
                          className="cal-todo-fertig"
                          disabled={busyId === `task-${task.id}`}
                          onClick={() => void markTaskDone(task)}
                        >
                          Fertig
                        </button>
                      )}
                      <button type="button" className="ghost cal-todo-btn" onClick={async () => {
                        try {
                          const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/prompt`);
                          const json = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(tasksEndpointError(json, res.status, "Übergabe laden fehlgeschlagen"));
                          onUseTask?.(json.prompt || "", task);
                          onClose();
                        } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
                      }}>Übernehmen</button>
                    </div>
                  </li>)}
                </ul>
              )}
            </section>
            <div className="cal-plan-toolbar">
              <p className="overview-hint" style={{ margin: 0, flex: 1 }}>
                Täglich/wöchentlich · Fertig wenn · Pause · Einmal jetzt · Löschen.
                Nach erfolgreichem Lauf: <strong>Fertig</strong> löscht die To-do.
                Leerlauf (LEER) ist nicht Erfolg.
              </p>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setEditId(null);
                  setForm(emptyForm());
                  setShowForm((v) => !v);
                }}
              >
                {showForm ? "Abbrechen" : "Neu"}
              </button>
            </div>

            {showForm ? (
              <form className="cal-todo-form" onSubmit={onSubmitForm}>
                <label className="cal-todo-field">
                  <span>Titel</span>
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Kurzname"
                  />
                </label>
                <label className="cal-todo-field">
                  <span>Prompt (an °_Agent)</span>
                  <textarea
                    required
                    rows={4}
                    value={form.prompt}
                    onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                    placeholder="Was der Agent ausführen soll…"
                  />
                </label>
                <label className="cal-todo-field">
                  <span>Fertig wenn</span>
                  <input
                    required={!editId}
                    maxLength={400}
                    value={form.pass}
                    onChange={(e) => setForm((f) => ({ ...f, pass: e.target.value }))}
                    placeholder="Prüfbares Ergebnis, sonst kein Job"
                  />
                </label>
                <div className="cal-todo-row">
                  <label className="cal-todo-field">
                    <span>Rhythmus</span>
                    <select
                      value={form.kind}
                      onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                    >
                      <option value="daily">täglich</option>
                      <option value="weekly">wöchentlich</option>
                    </select>
                  </label>
                  {form.kind === "weekly" ? (
                    <label className="cal-todo-field">
                      <span>Tag</span>
                      <select
                        value={form.weekday}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, weekday: Number(e.target.value) }))
                        }
                      >
                        {WEEKDAYS.map((w) => (
                          <option key={w.v} value={w.v}>
                            {w.l}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="cal-todo-field">
                    <span>Uhrzeit</span>
                    <input
                      type="time"
                      required
                      value={form.time}
                      onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="cal-todo-check">
                  <input
                    type="checkbox"
                    checked={form.allow_write}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, allow_write: e.target.checked }))
                    }
                  />
                  <span>
                    Auto-Schreiben (nur HSEQ: Eingang/Fertig/Vorlagen/Themen) — bei Neu
                    mit Bestätigung
                  </span>
                </label>
                <button type="submit" className="ghost" disabled={!!busyId}>
                  {editId ? "Speichern" : "Anlegen"}
                </button>
              </form>
            ) : null}

            {todosLoading ? (
              <div className="empty-inline">Lade To-dos…</div>
            ) : todos.length === 0 ? (
              <p className="cal-detail-empty">
                Noch keine wiederkehrenden To-dos. „Neu“ anlegen oder warten bis die
                HSEQ-Migration greift.
              </p>
            ) : (
              <ul className="cal-todo-list">
                {todos.map((t) => {
                  const done = t.last_status === "ok";
                  const paused = Boolean(t.paused);
                  return (
                    <li
                      key={t.id}
                      className={[
                        "cal-todo-item",
                        done ? "cal-todo-item--done" : "",
                        paused ? "cal-todo-item--paused" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="cal-todo-main">
                        <span
                          className={`cal-todo-title${done ? " cal-todo-title--done" : ""}`}
                        >
                          {t.title}
                        </span>
                        <span className="cal-todo-meta">
                          {scheduleLabel(t.schedule)}
                          {t.allow_write ? " · write" : " · read"}
                          {paused ? " · pausiert" : ""}
                          {t.last_run_at
                            ? ` · zuletzt ${String(t.last_run_at).slice(0, 16)}`
                            : ""}
                        </span>
                        {t.pass ? (
                          <span className="cal-todo-preview">Fertig wenn: {t.pass}</span>
                        ) : null}
                        {t.last_answer_preview ? (
                          <span className="cal-todo-preview" title={t.last_answer_preview}>
                            {t.last_answer_preview}
                          </span>
                        ) : null}
                      </div>
                      <div className="cal-todo-actions">
                        {done ? (
                          <button
                            type="button"
                            className="cal-todo-fertig"
                            title="Durchgestrichene To-do löschen"
                            disabled={busyId === t.id}
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  `„${t.title}“ löschen? (Fertig — endgültig)`,
                                )
                              ) {
                                return;
                              }
                              await act(`/api/recurring/${encodeURIComponent(t.id)}`, {
                                method: "DELETE",
                                busyId: t.id,
                              });
                            }}
                          >
                            Fertig
                          </button>
                        ) : (
                          <span className="cal-todo-status" aria-hidden="true">
                            {todoStatusLabel(t)}
                          </span>
                        )}
                        <button
                          type="button"
                          className="ghost cal-todo-btn"
                          disabled={!!busyId}
                          onClick={() =>
                            void act(`/api/recurring/${encodeURIComponent(t.id)}/pause`, {
                              body: { paused: !paused },
                              busyId: t.id,
                            })
                          }
                        >
                          {paused ? "Fortsetzen" : "Pause"}
                        </button>
                        <button
                          type="button"
                          className="ghost cal-todo-btn"
                          disabled={!!busyId}
                          title="Einmal jetzt ausführen"
                          onClick={() =>
                            void act(`/api/recurring/${encodeURIComponent(t.id)}/run`, {
                              body: { force: true },
                              busyId: t.id,
                            })
                          }
                        >
                          Jetzt
                        </button>
                        <button
                          type="button"
                          className="ghost cal-todo-btn"
                          disabled={!!busyId}
                          onClick={() => startEdit(t)}
                        >
                          Edit
                        </button>
                        {!done ? (
                          <button
                            type="button"
                            className="ghost cal-todo-btn cal-todo-btn--danger"
                            disabled={!!busyId}
                            onClick={async () => {
                              if (!window.confirm(`„${t.title}“ wirklich löschen?`)) return;
                              await act(`/api/recurring/${encodeURIComponent(t.id)}`, {
                                method: "DELETE",
                                busyId: t.id,
                              });
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <>
            <p className="overview-hint">
              <strong>Gelb</strong> = aktiv.{" "}
              <strong>Heller</strong> = weniger · <strong>Dunkler</strong> = häufiger.{" "}
              <strong>Peak</strong> = dunkelstes Kästchen. Klick = Sessions des Tages.
            </p>
            {loading ? (
              <div className="empty-inline">Lade Aktivität…</div>
            ) : data ? (
              <div className="cal-body">
                <div className="cal-chart" role="img" aria-label="Aktivitäts-Heatmap">
                  <div className="cal-day-labels" aria-hidden="true">
                    {dayLabels.map((lab, i) => (
                      <span
                        key={lab}
                        className={
                          i % 2 === 1
                            ? "cal-day-label"
                            : "cal-day-label cal-day-label--dim"
                        }
                      >
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
                                title={`${cell.date}: ${cell.count} Events`}
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
                      <h3 className="cal-detail-title">{formatDay(selected.date)}</h3>
                      <p className="cal-detail-meta">
                        {selected.count} Events · {selected.sessions?.length || 0}{" "}
                        Sessions
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
                                    const res = await seatFetch(
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
                              >
                                Öffnen
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="cal-detail-empty">Keine Session-Details.</p>
                      )}
                    </>
                  ) : (
                    <p className="cal-detail-empty">Kästchen wählen für den Tag.</p>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

export { ActivityCalendar };
