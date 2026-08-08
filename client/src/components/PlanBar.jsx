/**
 * Slim always-visible execution plan strip (above composer).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { planProgress, planStatusGlyph } from "../utils/plan.js";

/**
 * @param {{
 *   entries: Array<{ content: string, status: string, priority?: string }>,
 *   collapsed?: boolean,
 *   onToggle?: () => void,
 *   onDismiss?: () => void,
 * }} props
 */
export function PlanBar({ entries, collapsed = false, onToggle, onDismiss }) {
  if (!entries?.length) return null;

  const { done, total, current, allDone } = planProgress(entries);

  return (
    <div
      className={`plan-bar${allDone ? " plan-bar--done" : ""}${
        collapsed ? " plan-bar--collapsed" : ""
      }`}
      role="status"
      aria-label={`Plan ${done} von ${total}`}
    >
      <div className="plan-bar-toolbar">
        <button
          type="button"
          className="plan-bar-head"
          onClick={onToggle}
          title={collapsed ? "Plan ausklappen" : "Plan einklappen"}
          aria-expanded={!collapsed}
        >
          <span className="plan-bar-label">PLAN</span>
          <span className="plan-bar-count">
            {done}/{total}
          </span>
          {collapsed && current ? (
            <span className="plan-bar-current" title={current}>
              {allDone ? "fertig" : current}
            </span>
          ) : null}
          <span className="plan-bar-chevron" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
        </button>
        {onDismiss ? (
          <button
            type="button"
            className="plan-bar-dismiss"
            onClick={onDismiss}
            title="Plan schließen (nur Anzeige — Agent behält seinen Stand)"
            aria-label="Plan schließen"
          >
            ×
          </button>
        ) : null}
      </div>
      {!collapsed ? (
        <ol className="plan-bar-list">
          {entries.map((e, i) => (
            <li
              key={`${i}-${e.content.slice(0, 24)}`}
              className={`plan-bar-item plan-bar-item--${e.status}`}
              title={e.content}
            >
              <span className="plan-bar-glyph" aria-hidden="true">
                {planStatusGlyph(e.status)}
              </span>
              <span className="plan-bar-text">{e.content}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
