/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 *
 * Panel hinter dem Kalender-Icon: Plan (Aufgaben + wiederkehrende To-dos) und Aktivität.
 * Fertig-Status: „Erledigt…“ (Aufgabe + Pfad) bzw. „Erledigt löschen“ (wiederkehrend ok).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { seatFetch } from "../utils/seat.js";
import { TaskEvidence } from "./TaskEvidence.jsx";
import {
  TASK_HEADS,
  cleanArtifact,
  formatTaskMeta,
  tasksEndpointError,
} from "../utils/tasks.js";
import { SideDrawer } from "./SideDrawer.jsx";

const WEEKDAYS = [
  { v: 0, l: "Mo" },
  { v: 1, l: "Di" },
  { v: 2, l: "Mi" },
  { v: 3, l: "Do" },
  { v: 4, l: "Fr" },
  { v: 5, l: "Sa" },
  { v: 6, l: "So" },
];

const PLAN_HINT_SHORT =
  "Rhythmus · Fertig-wenn · Pause · Jetzt · Löschen. LEER ≠ Erfolg.";
const PLAN_HINT_MORE =
  "Nach erfolgreichem Lauf: „Erledigt löschen“ entfernt die To-do. Leerlauf (LEER) ist nicht Erfolg. Session-Plan (ACP) ist die Leiste über dem Composer — hier nur Aufgaben & To-dos.";

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

function todoStatusKey(t) {
  if (t?.paused) return "pause";
  if (t?.last_status === "error") return "error";
  if (t?.last_status === "empty") return "empty";
  if (t?.last_status === "ok") return "ok";
  return "open";
}

function todoStatusLabel(key) {
  switch (key) {
    case "pause":
      return "Pause";
    case "error":
      return "Fehler";
    case "empty":
      return "leer";
    case "ok":
      return "ok";
    default:
      return "offen";
  }
}

function scheduleLabel(s) {
  if (!s) return "—";
  if (s.kind === "weekly") {
    const d = WEEKDAYS.find((w) => w.v === s.weekday)?.l || `T${s.weekday}`;
    return `wöchentlich ${d} ${s.time}`;
  }
  return `täglich ${s.time}`;
}

function isOpenTask(task) {
  return task?.status !== "done";
}

function isOpenTodo(t) {
  return t?.last_status !== "ok";
}

/** Accessible ⋯ action menu for secondary todo/task actions. */
function MoreMenu({ id, label = "Weitere Aktionen", disabled, items }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!items?.length) return null;

  return (
    <div className="cal-more-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        id={id}
        className="ghost cal-todo-btn cal-more-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open ? (
        <div className="cal-more-menu" role="menu" aria-labelledby={id}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`cal-more-menu-item${item.danger ? " cal-more-menu-item--danger" : ""}`}
              disabled={item.disabled || disabled}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onOpenSession?: (json: object) => void,
 *   canSeeActivity?: boolean,
 * }} props
 */
function ActivityCalendar({ open, onClose, onOpenSession, onUseTask, canSeeActivity = true, side = "right", mode = "overlay" }) {
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
  const [hintMore, setHintMore] = useState(false);
  const [artifactEditId, setArtifactEditId] = useState(null);
  const [artifactDraft, setArtifactDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [writeConfirmPending, setWriteConfirmPending] = useState(false);
  const panelRef = useRef(null);
  const uid = useId();

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

  async function submitTaskDone(task, artifact) {
    const cleaned = cleanArtifact(artifact);
    if (!cleaned) {
      setError("Erledigt braucht einen Pfad oder Ort");
      return;
    }
    setBusyId(`task-${task.id}`);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done", artifact: cleaned }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(tasksEndpointError(json, res.status, "Erledigt speichern fehlgeschlagen"));
      if (json.item) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? json.item : t)));
      }
      setArtifactEditId(null);
      setArtifactDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function beginTaskDone(task) {
    const existing = cleanArtifact(task?.artifact);
    if (existing) {
      void submitTaskDone(task, existing);
      return;
    }
    setConfirmDeleteId(null);
    setArtifactEditId(task.id);
    setArtifactDraft("");
  }

  useEffect(() => {
    if (!open) return undefined;
    setSelected(null);
    setError("");
    setTab("plan");
    setHintMore(false);
    setArtifactEditId(null);
    setArtifactDraft("");
    setConfirmDeleteId(null);
    setWriteConfirmPending(false);
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

  const openTasks = tasks.filter(isOpenTask);
  const openTodos = todos.filter(isOpenTodo);
  const planOpenCount = openTasks.length + openTodos.length;
  const planHasError = todos.some((t) => t.last_status === "error");

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
      setConfirmDeleteId(null);
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function persistForm(allowWrite) {
    const schedule =
      form.kind === "weekly"
        ? { kind: "weekly", time: form.time, weekday: Number(form.weekday) }
        : { kind: "daily", time: form.time };
    if (editId) {
      await act(`/api/recurring/${encodeURIComponent(editId)}`, {
        method: "PATCH",
        body: {
          title: form.title.trim(),
          prompt: form.prompt.trim(),
          pass: form.pass.trim(),
          schedule,
          allow_write: allowWrite,
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
          allow_write: allowWrite,
          paused: false,
        },
        busyId: "new",
      });
    }
    setForm(emptyForm());
    setEditId(null);
    setShowForm(false);
    setWriteConfirmPending(false);
  }

  async function onSubmitForm(e) {
    e.preventDefault();
    if (!editId && !form.pass.trim()) {
      setError("Fertig-Kriterium fehlt — ohne prüfbares Ergebnis kein Job.");
      return;
    }
    if (!editId && form.allow_write && !writeConfirmPending) {
      setWriteConfirmPending(true);
      return;
    }
    await persistForm(form.allow_write);
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
    setWriteConfirmPending(false);
    setShowForm(true);
  }

  function openNewForm() {
    setEditId(null);
    setForm(emptyForm());
    setWriteConfirmPending(false);
    setShowForm(true);
  }

  function selectTab(next) {
    if (next === "activity" && !canSeeActivity) {
      setTab("activity");
      return;
    }
    setTab(next);
  }

  const kicker =
    tab === "plan"
      ? "Aufgaben & To-dos"
      : canSeeActivity
        ? "Aktivität"
        : "Aktivität · eingeschränkt";

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      kicker={kicker}
      title="Plan & Aktivität"
      side={side}
      mode={mode}
      className="app-drawer--plan"
      ariaLabel="Plan und Aktivität"
      initialFocusRef={panelRef}
      meta={
        <>
          {tab === "plan"
            ? `${openTasks.length} offene Aufgabe${openTasks.length === 1 ? "" : "n"} · ${openTodos.length} offene To-do${openTodos.length === 1 ? "" : "s"}`
            : canSeeActivity
              ? data
                ? `${data.activeDays} aktive Tage · ${data.totalEvents} Events · Peak ${data.peakDate || "—"}`
                : "Wann du gearbeitet hast — und woran"
              : "Nur im Grok-Profil sichtbar"}
          {tab === "plan" ? (
            <p className="cal-plan-note">
              Session-Plan = Leiste über dem Composer · hier: Aufgaben &amp; To-dos
            </p>
          ) : null}
        </>
      }
    >
      {/* focus landing for Esc/tab trap */}
      <div ref={panelRef} tabIndex={-1} className="sr-only">
        Plan und Aktivität
      </div>
        <div className="cal-tabs cal-panel-sticky cal-panel-sticky--tabs" role="tablist" aria-label="Plan oder Aktivität">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "plan"}
            className={`cal-tab${tab === "plan" ? " cal-tab--active" : ""}`}
            onClick={() => selectTab("plan")}
          >
            Plan
            {planOpenCount ? (
              <span className="cal-tab-badge" aria-label={`${planOpenCount} offen`}>
                {planOpenCount}
              </span>
            ) : null}
            {planHasError ? (
              <span className="cal-tab-dot" title="Mindestens ein To-do mit Fehler" aria-label="Fehler vorhanden" />
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "activity"}
            className={`cal-tab${tab === "activity" ? " cal-tab--active" : ""}`}
            onClick={() => selectTab("activity")}
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

        <div className="cal-scroll">
          {tab === "plan" ? (
            <div className="cal-plan" role="tabpanel" aria-label="Aufgaben und wiederkehrende To-dos">
              <section className="cal-zone cal-zone--tasks" aria-label="Übergebene Aufgaben">
                <div className="cal-zone-head">
                  <h3 className="cal-zone-title">Aufgaben</h3>
                  <span className="cal-zone-count">{openTasks.length} offen</span>
                </div>
                {tasks.length === 0 ? (
                  <p className="cal-detail-empty">Noch keine übergebenen Aufgaben.</p>
                ) : (
                  <ul className="cal-todo-list">
                    {tasks.map((task) => (
                      <li key={task.id} className={`cal-todo-item${task.status === "done" ? " cal-todo-item--done" : ""}`}>
                        <div className="cal-todo-main">
                          <div className="cal-todo-title-row">
                            <span className={`cal-todo-title${task.status === "done" ? " cal-todo-title--done" : ""}`}>
                              {task.title}
                            </span>
                            <span
                              className={`cal-status-chip cal-status-chip--${task.status === "done" ? "ok" : "open"}`}
                            >
                              {task.status === "done" ? "erledigt" : "offen"}
                            </span>
                          </div>
                          <span className="cal-todo-meta">{formatTaskMeta(task)}</span>
                          {task.pass ? <span className="cal-todo-preview">Zu tun: {task.pass}</span> : null}
                          {task.artifact ? <span className="cal-todo-preview">{task.artifact}</span> : null}
                          {task.summary ? <span className="cal-todo-preview">{task.summary}</span> : null}
                          <TaskEvidence
                            prompt={task.evidence?.prompt}
                            answer={task.evidence?.answer}
                          />
                          {artifactEditId === task.id ? (
                            <form
                              className="cal-inline-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void submitTaskDone(task, artifactDraft);
                              }}
                            >
                              <label className="cal-todo-field">
                                <span>Pfad oder Ort des Ergebnisses</span>
                                <input
                                  autoFocus
                                  required
                                  value={artifactDraft}
                                  onChange={(e) => setArtifactDraft(e.target.value)}
                                  placeholder="z. B. HSEQ Sync/…/Ergebnis.md"
                                />
                              </label>
                              <div className="cal-inline-actions">
                                <button type="submit" className="primary" disabled={busyId === `task-${task.id}`}>
                                  Erledigt speichern
                                </button>
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => {
                                    setArtifactEditId(null);
                                    setArtifactDraft("");
                                  }}
                                >
                                  Abbrechen
                                </button>
                              </div>
                            </form>
                          ) : null}
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
                              disabled={busyId === `task-${task.id}` || artifactEditId === task.id}
                              title="Aufgabe erledigen (Pfad nötig)"
                              onClick={() => beginTaskDone(task)}
                            >
                              Erledigt…
                            </button>
                          )}
                          <button
                            type="button"
                            className="ghost cal-todo-btn"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/prompt`);
                                const json = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(tasksEndpointError(json, res.status, "Übergabe laden fehlgeschlagen"));
                                onUseTask?.(json.prompt || "", task);
                                onClose();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              }
                            }}
                          >
                            Übernehmen
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="cal-zone cal-zone--recurring" aria-label="Wiederkehrende To-dos">
                <div className="cal-zone-head">
                  <h3 className="cal-zone-title">Wiederkehrend</h3>
                  <span className="cal-zone-count">{openTodos.length} offen</span>
                  <button
                    type="button"
                    className="primary cal-zone-primary"
                    onClick={() => {
                      if (showForm && !editId) {
                        setShowForm(false);
                        setWriteConfirmPending(false);
                      } else {
                        openNewForm();
                      }
                    }}
                  >
                    {showForm && !editId ? "Abbrechen" : "Neu"}
                  </button>
                </div>

                <div className="cal-plan-toolbar">
                  <p className="overview-hint cal-hint-one" style={{ margin: 0, flex: 1 }}>
                    {PLAN_HINT_SHORT}{" "}
                    <button
                      type="button"
                      className="cal-hint-more"
                      aria-expanded={hintMore}
                      title={PLAN_HINT_MORE}
                      onClick={() => setHintMore((v) => !v)}
                    >
                      {hintMore ? "Weniger" : "Mehr"}
                    </button>
                  </p>
                </div>
                {hintMore ? <p className="cal-hint-detail">{PLAN_HINT_MORE}</p> : null}

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
                    <label
                      className="cal-todo-check"
                      title="Nur unter HSEQ Sync: 00 Arbeitsfluss/, Vorlagen/, Themen/. Ohne Bestätigung: nur Lesen."
                    >
                      <input
                        type="checkbox"
                        checked={form.allow_write}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, allow_write: e.target.checked }));
                          setWriteConfirmPending(false);
                        }}
                      />
                      <span>Auto-Schreiben (HSEQ-Ordner)</span>
                    </label>
                    {writeConfirmPending ? (
                      <div className="cal-inline-confirm" role="group" aria-label="Auto-Schreiben bestätigen">
                        <p>
                          Auto-Schreiben erlauben? Nur unter HSEQ Sync: 00 Arbeitsfluss/, Vorlagen/, Themen/.
                          Ohne Bestätigung: nur Lesen.
                        </p>
                        <div className="cal-inline-actions">
                          <button
                            type="button"
                            className="primary"
                            disabled={!!busyId}
                            onClick={() => void persistForm(true)}
                          >
                            Erlauben &amp; anlegen
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => {
                              setForm((f) => ({ ...f, allow_write: false }));
                              setWriteConfirmPending(false);
                            }}
                          >
                            Nur Lesen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="submit" className="primary" disabled={!!busyId}>
                        {editId ? "Speichern" : "Anlegen"}
                      </button>
                    )}
                    {editId ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setShowForm(false);
                          setEditId(null);
                          setForm(emptyForm());
                          setWriteConfirmPending(false);
                        }}
                      >
                        Abbrechen
                      </button>
                    ) : null}
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
                      const statusKey = todoStatusKey(t);
                      const confirming = confirmDeleteId === t.id;
                      return (
                        <li
                          key={t.id}
                          className={[
                            "cal-todo-item",
                            done ? "cal-todo-item--done" : "",
                            paused ? "cal-todo-item--paused" : "",
                            statusKey === "empty" ? "cal-todo-item--empty" : "",
                            statusKey === "error" ? "cal-todo-item--error" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div className="cal-todo-main">
                            <div className="cal-todo-title-row">
                              <span
                                className={`cal-todo-title${done ? " cal-todo-title--done" : ""}`}
                              >
                                {t.title}
                              </span>
                              <span className={`cal-status-chip cal-status-chip--${statusKey}`}>
                                {todoStatusLabel(statusKey)}
                              </span>
                            </div>
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
                            {statusKey === "empty" ? (
                              <span className="cal-status-chip cal-status-chip--empty cal-status-chip--inline">
                                LEER — kein Erfolg
                              </span>
                            ) : null}
                            {confirming ? (
                              <div className="cal-inline-confirm" role="group" aria-label="Löschen bestätigen">
                                <p>
                                  {done
                                    ? `„${t.title}“ löschen? (Erledigt — endgültig)`
                                    : `„${t.title}“ wirklich löschen?`}
                                </p>
                                <div className="cal-inline-actions">
                                  <button
                                    type="button"
                                    className="danger"
                                    disabled={busyId === t.id}
                                    onClick={() =>
                                      void act(`/api/recurring/${encodeURIComponent(t.id)}`, {
                                        method: "DELETE",
                                        busyId: t.id,
                                      })
                                    }
                                  >
                                    Löschen
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={() => setConfirmDeleteId(null)}
                                  >
                                    Abbrechen
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="cal-todo-actions">
                            {done ? (
                              <button
                                type="button"
                                className="cal-todo-fertig"
                                title="Durchgestrichene To-do löschen"
                                disabled={busyId === t.id || confirming}
                                onClick={() => {
                                  setArtifactEditId(null);
                                  setConfirmDeleteId(t.id);
                                }}
                              >
                                Erledigt löschen
                              </button>
                            ) : null}
                            <MoreMenu
                              id={`${uid}-todo-${t.id}`}
                              disabled={!!busyId || confirming}
                              items={[
                                {
                                  key: "pause",
                                  label: paused ? "Fortsetzen" : "Pause",
                                  onClick: () =>
                                    void act(`/api/recurring/${encodeURIComponent(t.id)}/pause`, {
                                      body: { paused: !paused },
                                      busyId: t.id,
                                    }),
                                },
                                {
                                  key: "run",
                                  label: "Jetzt",
                                  onClick: () =>
                                    void act(`/api/recurring/${encodeURIComponent(t.id)}/run`, {
                                      body: { force: true },
                                      busyId: t.id,
                                    }),
                                },
                                {
                                  key: "edit",
                                  label: "Edit",
                                  onClick: () => startEdit(t),
                                },
                                ...(done
                                  ? []
                                  : [
                                      {
                                        key: "del",
                                        label: "Löschen",
                                        danger: true,
                                        onClick: () => {
                                          setArtifactEditId(null);
                                          setConfirmDeleteId(t.id);
                                        },
                                      },
                                    ]),
                              ]}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          ) : !canSeeActivity ? (
            <div className="cal-activity-blocked" role="tabpanel" aria-label="Aktivität nicht verfügbar">
              <p className="cal-blocked-title">Nur im Grok-Profil</p>
              <p className="cal-detail-empty">
                Die Aktivitäts-Heatmap ist an das Grok-Profil gebunden. Wechsle das Profil,
                um Sessions und Peak-Tage zu sehen. Der Tab bleibt deaktiviert, bis das möglich ist.
              </p>
            </div>
          ) : (
            <div className="cal-activity" role="tabpanel" aria-label="Aktivität">
              <div className="cal-activity-top">
                <p className="overview-hint cal-hint-one" style={{ margin: 0 }}>
                  Gelb = aktiv · heller weniger · dunkler mehr · Peak = dunkelstes Kästchen.
                </p>
                <div className="cal-legend cal-legend--compact" aria-hidden="true">
                  <span className="cal-legend-label">weniger</span>
                  {[0, 1, 2, 3, 4].map((lv) => (
                    <span
                      key={lv}
                      className={`cal-cell cal-cell--l${lv}${lv === 4 ? " cal-cell--peak" : ""}`}
                    />
                  ))}
                  <span className="cal-legend-label">mehr</span>
                </div>
              </div>
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
                              <li key={s.id} className="cal-session-card">
                                <div className="cal-session-card-main">
                                  <span className="cal-session-title">{s.title}</span>
                                  <span className="cal-session-count" title="Events">
                                    {s.count}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="primary cal-session-open"
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
            </div>
          )}
        </div>
    </SideDrawer>
  );
}
export { ActivityCalendar };
