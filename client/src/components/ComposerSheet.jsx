/**
 * Docked sheet above the LVL bar — Plan, Ordner-Suche, Aktiver Task.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useRef } from "react";

/**
 * @param {{
 *   label: string,
 *   count?: string | number | null,
 *   current?: import("react").ReactNode,
 *   collapsed?: boolean,
 *   onToggle?: () => void,
 *   onDismiss?: () => void,
 *   dismissTitle?: string,
 *   dismissLabel?: string,
 *   actions?: import("react").ReactNode,
 *   footer?: import("react").ReactNode,
 *   done?: boolean,
 *   children?: import("react").ReactNode,
 *   role?: string,
 *   ariaLabel?: string,
 *   ariaModal?: boolean,
 *   autoFocus?: boolean,
 *   className?: string,
 *   onKeyDown?: (e: import("react").KeyboardEvent) => void,
 * }} props
 */
export function ComposerSheet({
  label,
  count,
  current,
  collapsed = false,
  onToggle,
  onDismiss,
  dismissTitle = "Schließen",
  dismissLabel = "Schließen",
  actions = null,
  footer = null,
  done = false,
  children = null,
  role = "region",
  ariaLabel,
  ariaModal,
  autoFocus = false,
  className = "",
  onKeyDown,
}) {
  const rootRef = useRef(null);
  const expandable = typeof onToggle === "function";

  useEffect(() => {
    if (!autoFocus) return;
    rootRef.current?.focus();
  }, [autoFocus]);

  const headInner = (
    <>
      <span className="composer-sheet-label">{label}</span>
      {count != null && count !== "" ? (
        <span className="composer-sheet-count">{count}</span>
      ) : null}
      {current ? (
        <span
          className="composer-sheet-current"
          title={typeof current === "string" ? current : undefined}
        >
          {current}
        </span>
      ) : null}
      {expandable ? (
        <span className="composer-sheet-chevron" aria-hidden="true">
          {collapsed ? "▸" : "▾"}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      ref={rootRef}
      className={`composer-sheet${done ? " composer-sheet--done" : ""}${
        collapsed ? " composer-sheet--collapsed" : ""
      }${className ? ` ${className}` : ""}`}
      role={role}
      aria-label={ariaLabel || label}
      aria-modal={role === "dialog" ? (ariaModal ? "true" : "false") : undefined}
      tabIndex={autoFocus || onKeyDown ? -1 : undefined}
      onKeyDown={onKeyDown}
    >
      <div className="composer-sheet-toolbar">
        {expandable ? (
          <button
            type="button"
            className="composer-sheet-head"
            onClick={onToggle}
            title={collapsed ? `${label} ausklappen` : `${label} einklappen`}
            aria-expanded={!collapsed}
          >
            {headInner}
          </button>
        ) : (
          <div className="composer-sheet-head">{headInner}</div>
        )}
        {actions}
        {onDismiss ? (
          <button
            type="button"
            className="composer-sheet-dismiss"
            onClick={onDismiss}
            title={dismissTitle}
            aria-label={dismissLabel}
          >
            ×
          </button>
        ) : null}
      </div>
      {!collapsed && children ? (
        <div className="composer-sheet-body">{children}</div>
      ) : null}
      {!collapsed && footer ? (
        <div className="composer-sheet-footer">{footer}</div>
      ) : null}
    </div>
  );
}
