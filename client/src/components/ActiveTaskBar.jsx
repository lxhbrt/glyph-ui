/**
 * Arbeitsleiste: aktiver ^_Code-Task (Scope, Restzeit, Widerrufen).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { ComposerSheet } from "./ComposerSheet.jsx";
import { formatActionClasses, formatIdleRemaining } from "../utils/codeGrants.js";

/**
 * @param {{
 *   task: {
 *     label?: string,
 *     workspace_root?: string,
 *     path_prefixes?: string[],
 *     action_classes?: string[],
 *     idle_remaining_s?: number,
 *     why?: string,
 *   } | null,
 *   onRevoke?: () => void,
 *   busy?: boolean,
 * }} props
 */
export function ActiveTaskBar({ task, onRevoke, busy = false }) {
  if (!task) return null;
  const name = String(task.label || task.why || "Task").trim() || "Task";
  const prefixes = Array.isArray(task.path_prefixes)
    ? task.path_prefixes.join(", ")
    : "";
  const classes = formatActionClasses(task.action_classes);
  const rest = formatIdleRemaining(task.idle_remaining_s);
  const ws = String(task.workspace_root || "").split(/[/\\]/).filter(Boolean);
  const wsName = ws[ws.length - 1] || task.workspace_root || "";

  return (
    <ComposerSheet
      label="TASK"
      current={`${name} · ${rest}`}
      role="status"
      ariaLabel={`Aktiver Task ${name}`}
      actions={
        onRevoke ? (
          <div className="composer-sheet-actions">
            <button
              type="button"
              className="ghost composer-sheet-quiet"
              disabled={busy}
              onClick={onRevoke}
            >
              Widerrufen
            </button>
          </div>
        ) : null
      }
    >
      <ul className="active-task-meta">
        {wsName ? <li>Workspace {wsName}</li> : null}
        {prefixes ? <li>Pfade {prefixes}</li> : null}
        {classes ? <li>Aktionen {classes}</li> : null}
        <li>Restzeit {rest}</li>
      </ul>
    </ComposerSheet>
  );
}
