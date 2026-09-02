/**
 * Keep the composer slash-highlight mirror in lockstep with the textarea.
 * Div wrap ≠ textarea wrap as soon as padding/font/gutter diverge — caret
 * then sits mid-text from line 2 onward.
 *
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

/** Used font/box metrics copied from the textarea onto the mirror. */
export const COMPOSER_MIRROR_STYLE_KEYS = [
  "boxSizing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "font",
  "letterSpacing",
  "wordSpacing",
  "lineHeight",
  "tabSize",
  "textIndent",
  "textTransform",
  "textAlign",
  "whiteSpace",
  "overflowWrap",
  "wordBreak",
  "wordWrap",
];

/**
 * Size the overlay to the textarea content box and copy used text metrics
 * so wrap points match the caret column (incl. scrollbar / padding mismatches).
 *
 * @param {Pick<HTMLTextAreaElement, "clientWidth" | "clientHeight" | "scrollTop" | "scrollLeft"> | null | undefined} ta
 * @param {{ style: Record<string, string>, scrollTop: number, scrollLeft: number } | null | undefined} mirror
 * @param {Record<string, string> | CSSStyleDeclaration} [computed]
 */
export function applyComposerMirrorMetrics(ta, mirror, computed) {
  if (!ta || !mirror || !mirror.style) return;
  const cs = computed || (typeof getComputedStyle === "function" ? getComputedStyle(ta) : null);
  if (!cs) return;
  mirror.style.width = `${ta.clientWidth}px`;
  mirror.style.height = `${ta.clientHeight}px`;
  mirror.style.minHeight = "";
  for (const key of COMPOSER_MIRROR_STYLE_KEYS) {
    const v = cs[key];
    if (v != null && v !== "") mirror.style[key] = v;
  }
  mirror.scrollTop = ta.scrollTop;
  mirror.scrollLeft = ta.scrollLeft;
}
