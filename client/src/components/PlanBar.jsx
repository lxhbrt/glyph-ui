/**
 * Slim always-visible execution plan strip (above LVL bar).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { planNeedsApproval, planProgress, planStatusGlyph } from "../utils/plan.js";
import { ComposerSheet } from "./ComposerSheet.jsx";

/**
 * @param {{
 *   entries: Array<{ content: string, status: string, priority?: string }>,
 *   collapsed?: boolean,
 *   onToggle?: () => void,
 *   onDismiss?: () => void,
 *   onApprove?: () => void,
 *   onRevise?: () => void,
 *   approveDisabled?: boolean,
 * }} props
 */
export function PlanBar({
  entries,
  collapsed = false,
  onToggle,
  onDismiss,
  onApprove,
  onRevise,
  approveDisabled = false,
}) {
  if (!entries?.length) return null;

  const { done, total, current, allDone } = planProgress(entries);
  const needsApproval = planNeedsApproval(entries);

  return (
    <ComposerSheet
      label="PLAN"
      count={`${done}/${total}`}
      current={collapsed ? (allDone ? "fertig" : current) : null}
      collapsed={collapsed}
      onToggle={onToggle}
      onDismiss={onDismiss}
      dismissTitle="Plan schließen (nur Anzeige — Agent behält seinen Stand)"
      dismissLabel="Plan schließen"
      done={allDone}
      role="status"
      ariaLabel={`Plan ${done} von ${total}`}
      actions={
        needsApproval && (onApprove || onRevise) ? (
          <div className="composer-sheet-actions">
            {onApprove ? (
              <button
                type="button"
                className="composer-sheet-go"
                disabled={approveDisabled}
                onClick={onApprove}
              >
                Umsetzen
              </button>
            ) : null}
            {onRevise ? (
              <button
                type="button"
                className="ghost composer-sheet-quiet"
                disabled={approveDisabled}
                onClick={onRevise}
              >
                Ändern
              </button>
            ) : null}
          </div>
        ) : null
      }
    >
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
    </ComposerSheet>
  );
}
