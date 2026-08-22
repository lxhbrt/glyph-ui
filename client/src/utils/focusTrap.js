/**
 * Tab cycle for a modal root. Logic is DOM-free so tests don't need jsdom.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

export const FOCUSABLE_SEL =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function shouldWrapTab(list, active, shift) {
  if (!list?.length) return false;
  if (!list.includes(active)) return true;
  return shift ? active === list[0] : active === list[list.length - 1];
}

export function wrapTabTarget(list, active, shift) {
  if (!list?.length) return null;
  const i = list.indexOf(active);
  if (shift) {
    if (i <= 0) return list[list.length - 1];
    return list[i - 1];
  }
  if (i < 0 || i >= list.length - 1) return list[0];
  return list[i + 1];
}

export function focusables(root) {
  if (!root?.querySelectorAll) return [];
  return [...root.querySelectorAll(FOCUSABLE_SEL)].filter((el) => {
    if (el.closest("[hidden],[aria-hidden='true']")) return false;
    const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
    if (style && (style.visibility === "hidden" || style.display === "none")) {
      return false;
    }
    return true;
  });
}

/**
 * @param {HTMLElement | null} root
 * @param {KeyboardEvent} event
 * @returns {boolean} true if the event was handled
 */
export function handleDialogTab(root, event) {
  if (!root || event.key !== "Tab") return false;
  const list = focusables(root);
  if (!list.length) return false;
  const active = root.ownerDocument?.activeElement;
  if (!shouldWrapTab(list, active, event.shiftKey)) return false;
  event.preventDefault();
  const next = wrapTabTarget(list, active, event.shiftKey);
  next?.focus?.();
  return true;
}
