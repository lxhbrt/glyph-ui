/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/**
 * Activity calendar heatmap from local Grok sessions.
 * Source of truth: events.jsonl `ts` per session; fallback to summary dates.
 *
 * Days are calendar days in the server's local timezone (not UTC), so late-night
 * work in CET/CEST lands on the correct heatmap day.
 */

import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

const GROK_HOME = process.env.GROK_HOME || path.join(os.homedir(), ".grok");
const SESSIONS_ROOT = path.join(GROK_HOME, "sessions");
const STATE_DIR =
  process.env.GLYPH_UI_STATE_DIR ||
  path.join(os.homedir(), ".glyph-ui");
const CLOSED_LOG = path.join(STATE_DIR, "closed-sessions.json");

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Full heatmap response TTL — invalidated on session close. */
const ACTIVITY_CACHE_TTL_MS = 45_000;

/** @type {{ key: string, at: number, data: object | null }} */
let activityCache = { key: "", at: 0, data: null };

/**
 * Per-session events.jsonl rollup cache (mtime + size).
 * @type {Map<string, { mtimeMs: number, size: number, byDay: Map<string, number>, total: number }>}
 */
const eventDayCache = new Map();

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Local calendar day YYYY-MM-DD from a Date. */
function localDayFromDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayLocal() {
  return localDayFromDate(new Date());
}

/**
 * Map a timestamp to a local calendar day.
 * Bare YYYY-MM-DD (no time) is kept as-is; ISO/epoch convert via local TZ.
 */
function dayKey(isoOrDate) {
  if (isoOrDate == null || isoOrDate === "") return null;
  if (typeof isoOrDate === "number") {
    const ms = isoOrDate < 1e12 ? isoOrDate * 1000 : isoOrDate;
    return localDayFromDate(new Date(ms));
  }
  const s = String(isoOrDate).trim();
  // Date-only: already a calendar day (do not re-parse as UTC midnight)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return localDayFromDate(d);
}

function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return localDayFromDate(dt);
}

function startOfWeekMonday(day) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // local: 0=Sun … 6=Sat
  const monOffset = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + monOffset);
  return localDayFromDate(dt);
}

export function invalidateActivityCache() {
  activityCache = { key: "", at: 0, data: null };
  // Keep per-file event caches; mtime check still applies. Drop if path gone later.
}

async function readClosedLog() {
  try {
    const raw = await fs.readFile(CLOSED_LOG, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

/**
 * Count events by day for one session. Returns Map day → count.
 * Cached by events.jsonl mtime + size so repeat /api/activity is cheap.
 */
async function countEventsByDay(sessionDir, maxLines = 50_000) {
  const eventsPath = path.join(sessionDir, "events.jsonl");
  let st;
  try {
    st = await fs.stat(eventsPath);
  } catch {
    return { byDay: new Map(), total: 0 };
  }

  const hit = eventDayCache.get(eventsPath);
  if (
    hit &&
    hit.mtimeMs === st.mtimeMs &&
    hit.size === st.size
  ) {
    return { byDay: hit.byDay, total: hit.total };
  }

  const byDay = new Map();
  let total = 0;

  let stream;
  try {
    stream = createReadStream(eventsPath, { encoding: "utf8" });
  } catch {
    return { byDay, total: 0 };
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lines = 0;
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      lines += 1;
      if (lines > maxLines) break;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const day = dayKey(row.ts || row.timestamp || row.created_at);
      if (!day) continue;
      byDay.set(day, (byDay.get(day) || 0) + 1);
      total += 1;
    }
  } catch {
    /* incomplete read ok */
  }

  eventDayCache.set(eventsPath, {
    mtimeMs: st.mtimeMs,
    size: st.size,
    byDay,
    total,
  });
  // Bound cache growth (session paths are stable UUIDs)
  if (eventDayCache.size > 400) {
    const first = eventDayCache.keys().next().value;
    if (first) eventDayCache.delete(first);
  }

  return { byDay, total };
}

async function loadSummary(sessionDir) {
  try {
    return JSON.parse(
      await fs.readFile(path.join(sessionDir, "summary.json"), "utf8"),
    );
  } catch {
    return {};
  }
}

function titleFromSummary(summary, fallbackId) {
  return (
    summary?.generated_title ||
    summary?.session_summary ||
    summary?.info?.id ||
    fallbackId ||
    "Untitled"
  );
}

/**
 * Build activity heatmap for the last `weeks` weeks (ending today, local TZ).
 */
export async function buildActivity({ weeks = 20 } = {}) {
  const weekCount = Math.max(4, Math.min(52, Number(weeks) || 20));
  const today = todayLocal();
  const cacheKey = `${weekCount}:${today}`;
  const now = Date.now();
  if (
    activityCache.data &&
    activityCache.key === cacheKey &&
    now - activityCache.at < ACTIVITY_CACHE_TTL_MS
  ) {
    return activityCache.data;
  }

  const rangeEnd = today;
  // Align grid: start Monday of (end - weeks*7 + 1)
  const rawStart = addDays(rangeEnd, -(weekCount * 7 - 1));
  const rangeStart = startOfWeekMonday(rawStart);

  /** @type {Map<string, { count: number, sessions: Map<string, { id: string, title: string, count: number }> }>} */
  const days = new Map();

  const bump = (day, sessionId, title, n = 1) => {
    if (!day || day < rangeStart || day > rangeEnd) return;
    let cell = days.get(day);
    if (!cell) {
      cell = { count: 0, sessions: new Map() };
      days.set(day, cell);
    }
    cell.count += n;
    const prev = cell.sessions.get(sessionId);
    if (prev) {
      prev.count += n;
    } else {
      cell.sessions.set(sessionId, { id: sessionId, title, count: n });
    }
  };

  // Live sessions on disk
  let groups = [];
  try {
    groups = await fs.readdir(SESSIONS_ROOT, { withFileTypes: true });
  } catch {
    groups = [];
  }

  /** @type {Array<{ sessionDir: string, id: string }>} */
  const sessionJobs = [];
  for (const group of groups) {
    if (!group.isDirectory() || group.name.startsWith(".")) continue;
    if (group.name.endsWith(".sqlite")) continue;
    const groupPath = path.join(SESSIONS_ROOT, group.name);
    let children;
    try {
      children = await fs.readdir(groupPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory() || !SESSION_ID_RE.test(child.name)) continue;
      sessionJobs.push({
        sessionDir: path.join(groupPath, child.name),
        id: child.name,
      });
    }
  }

  // Process sessions with bounded concurrency (I/O bound)
  const CONCURRENCY = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < sessionJobs.length) {
      const i = cursor;
      cursor += 1;
      const { sessionDir, id } = sessionJobs[i];
      const summary = await loadSummary(sessionDir);
      const title = titleFromSummary(summary, id);
      const { byDay, total } = await countEventsByDay(sessionDir);

      if (total > 0) {
        for (const [day, n] of byDay) {
          bump(day, id, title, n);
        }
      } else {
        const day =
          dayKey(summary.last_active_at) ||
          dayKey(summary.updated_at) ||
          dayKey(summary.created_at);
        const weight = Math.max(
          1,
          Math.min(
            80,
            Number(summary.num_chat_messages) ||
              Number(summary.num_messages) ||
              1,
          ),
        );
        bump(day, id, title, weight);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, sessionJobs.length) }, () =>
      worker(),
    ),
  );

  // Closed sessions (disk may be gone) — credit closed day + title
  const closed = await readClosedLog();
  for (const entry of closed) {
    if (!entry?.id) continue;
    const day = dayKey(entry.closedAt);
    const cell = day ? days.get(day) : null;
    if (cell?.sessions?.has(entry.id)) continue;
    bump(day, entry.id, entry.title || entry.id, 3);
  }

  // Level scale from positive counts
  const positive = [...days.values()].map((c) => c.count).filter((n) => n > 0);
  positive.sort((a, b) => a - b);
  const maxCount = positive.length ? positive[positive.length - 1] : 0;
  const q = (p) => {
    if (!positive.length) return 0;
    const i = Math.min(
      positive.length - 1,
      Math.floor(p * (positive.length - 1)),
    );
    return positive[i];
  };
  const t1 = q(0.25) || 1;
  const t2 = q(0.5) || t1;
  const t3 = q(0.75) || t2;

  const levelFor = (count) => {
    if (!count) return 0;
    if (count >= maxCount && maxCount > 0) return 4; // peak band
    if (count > t3) return 3;
    if (count > t2) return 2;
    if (count > t1) return 1;
    return 1; // any activity at least level 1
  };

  // Build week columns Mon→Sun (local calendar)
  const weekCols = [];
  let colStart = rangeStart;
  while (colStart <= rangeEnd) {
    const col = [];
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(colStart, i);
      if (d > rangeEnd) {
        col.push({
          date: d,
          count: 0,
          level: 0,
          peak: false,
          sessions: [],
          empty: true,
        });
        continue;
      }
      const cell = days.get(d);
      const count = cell?.count || 0;
      const level = levelFor(count);
      const sessions = cell
        ? [...cell.sessions.values()].sort((a, b) => b.count - a.count)
        : [];
      col.push({
        date: d,
        count,
        level,
        peak: false,
        sessions,
        empty: false,
      });
    }
    weekCols.push(col);
    colStart = addDays(colStart, 7);
  }

  // Mark single global peak (darkest + eye)
  let peakDate = null;
  let peakCount = -1;
  for (const col of weekCols) {
    for (const cell of col) {
      if (cell.empty) continue;
      if (cell.count > peakCount) {
        peakCount = cell.count;
        peakDate = cell.date;
      }
    }
  }
  if (peakDate && peakCount > 0) {
    for (const col of weekCols) {
      for (const cell of col) {
        if (cell.date === peakDate) {
          cell.peak = true;
          cell.level = 4;
        }
      }
    }
  }

  const activeDays = positive.length;
  const totalEvents = positive.reduce((s, n) => s + n, 0);

  const result = {
    weeks: weekCols,
    rangeStart,
    rangeEnd,
    weekCount: weekCols.length,
    peakDate,
    peakCount: peakCount > 0 ? peakCount : 0,
    activeDays,
    totalEvents,
    maxCount,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
    legend: [
      { level: 0, label: "keine" },
      { level: 1, label: "wenig" },
      { level: 2, label: "mittel" },
      { level: 3, label: "viel" },
      { level: 4, label: "Peak", peak: true },
    ],
  };

  activityCache = { key: cacheKey, at: now, data: result };
  return result;
}
