/**
 * Shared right side drawer — Skills / Plan stay beside chat (Graph stays full-bleed).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useId, useRef, useState } from "react";
import { handleDialogTab } from "../utils/focusTrap.js";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.title
 * @param {string} [props.kicker]
 * @param {import("react").ReactNode} [props.meta]
 * @param {import("react").ReactNode} [props.headExtra]
 * @param {import("react").ReactNode} props.children
 * @param {string} [props.className]  extra class on panel (e.g. extensions / cal)
 * @param {string} [props.ariaLabel]
 * @param {import("react").RefObject<HTMLElement | null>} [props.initialFocusRef]
 * @param {boolean} [props.mounted]  keep children mounted while exit anim plays
 */
function SideDrawer({
  open,
  onClose,
  title,
  kicker = "",
  meta = null,
  headExtra = null,
  children,
  className = "",
  ariaLabel,
  initialFocusRef,
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const [present, setPresent] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      if (reduce) setEntered(true);
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setPresent(false);
      return undefined;
    }
    const t = window.setTimeout(() => setPresent(false), 200);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !present) return undefined;
    const focusTarget =
      initialFocusRef?.current ||
      panelRef.current?.querySelector?.(
        'input:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ) ||
      panelRef.current;
    const id = requestAnimationFrame(() => {
      focusTarget?.focus?.();
    });
    return () => cancelAnimationFrame(id);
  }, [open, present, initialFocusRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onTab = (e) => {
      if (e.key === "Tab") handleDialogTab(panelRef.current, e);
    };
    // Bubble: nested menus (⋯) preventDefault on Esc first
    const onEsc = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target;
      if (
        t &&
        typeof t.closest === "function" &&
        t.closest(".cal-more-menu, .cal-more-wrap, [role='menu']")
      ) {
        return;
      }
      e.preventDefault();
      onClose?.();
    };
    window.addEventListener("keydown", onTab, true);
    window.addEventListener("keydown", onEsc, false);
    return () => {
      window.removeEventListener("keydown", onTab, true);
      window.removeEventListener("keydown", onEsc, false);
    };
  }, [open, onClose]);

  if (!present) return null;

  const label = ariaLabel || title;

  return (
    <aside
      ref={panelRef}
      className={`app-drawer${entered && open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-label={label}
      tabIndex={-1}
      data-drawer-open={open ? "true" : "false"}
    >
      <header className="app-drawer-head">
        <div className="app-drawer-head-text">
          {kicker ? <p className="overview-kicker">{kicker}</p> : null}
          <h2 id={titleId}>{title}</h2>
          {meta ? <div className="overview-meta app-drawer-meta">{meta}</div> : null}
        </div>
        <div className="overview-head-actions app-drawer-head-actions">
          {headExtra}
          <button type="button" className="ghost" onClick={onClose}>
            Schließen
          </button>
        </div>
      </header>
      <div className="app-drawer-body">{children}</div>
    </aside>
  );
}

export { SideDrawer };
