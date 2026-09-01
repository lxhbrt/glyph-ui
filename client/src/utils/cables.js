/**
 * Shared hanging-cable path for Kabelsalat + Kabelplan (viewBox units).
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

function r2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Quadratic sag toward +y (map bottom) so spokes read as cables, not rulers.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {string} SVG path `d`
 */
/** Sample the same sagging quadratic as stones (head → tail). t=0 at start. */
export function snackTail(x1, y1, x2, y2, opts) {
  const a = Number(x1) || 0;
  const b = Number(y1) || 0;
  const c = Number(x2) || 0;
  const d = Number(y2) || 0;
  const mx = (a + c) / 2;
  const my = (b + d) / 2;
  const len = Math.hypot(c - a, d - b) || 1;
  const maxSag = opts && opts.maxSag != null ? Number(opts.maxSag) : 10;
  const minSag = opts && opts.minSag != null ? Number(opts.minSag) : 3;
  const sag = Math.min(maxSag, Math.max(minSag, len * 0.16));
  const qy = my + sag;
  const n =
    opts && opts.count != null
      ? Math.max(3, Math.round(Number(opts.count)))
      : Math.max(8, Math.min(22, Math.round(len / 20)));
  const insetFrom = Math.max(0, Math.min(0.4, Number(opts && opts.insetFrom) || 0));
  const insetTo = Math.max(0, Math.min(0.4, Number(opts && opts.insetTo) || 0));
  const t0 = insetFrom;
  const t1 = 1 - insetTo;
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const t = t0 + ((i + 0.5) / n) * (t1 - t0);
    const u = 1 - t;
    pts.push({
      x: r2(u * u * a + 2 * u * t * mx + t * t * c),
      y: r2(u * u * b + 2 * u * t * qy + t * t * d),
      t,
    });
  }
  return pts;
}

/**
 * Live tails stay in the gold family (bright at the head).
 * Gray / dark = inactive or locked. No red on the tail.
 * @param {{
 *   t: number,
 *   live?: boolean,
 *   mode?: string,
 *   hidden?: boolean,
 *   towardHead?: boolean,
 * }} input
 */
export function tailTone({
  t = 0,
  live = false,
  mode = "",
  hidden = false,
  towardHead = true,
} = {}) {
  if (hidden || !live || mode === "private") return "is-dark";
  const headness = towardHead ? Number(t) || 0 : 1 - (Number(t) || 0);
  if (mode === "r") {
    return headness > 0.5 ? "is-gold-dim" : "is-gold-deep";
  }
  if (headness > 0.74) return "is-gold-bright";
  if (headness > 0.48) return "is-gold";
  if (headness > 0.22) return "is-gold-dim";
  return "is-gold-deep";
}

export function cablePath(x1, y1, x2, y2, opts) {
  const a = Number(x1) || 0;
  const b = Number(y1) || 0;
  const c = Number(x2) || 0;
  const d = Number(y2) || 0;
  const mx = (a + c) / 2;
  const my = (b + d) / 2;
  const len = Math.hypot(c - a, d - b) || 1;
  const maxSag = opts && opts.maxSag != null ? Number(opts.maxSag) : 10;
  const minSag = opts && opts.minSag != null ? Number(opts.minSag) : 3;
  const sag = Math.min(maxSag, Math.max(minSag, len * 0.16));
  return `M ${r2(a)} ${r2(b)} Q ${r2(mx)} ${r2(my + sag)} ${r2(c)} ${r2(d)}`;
}

/** Almost-straight spoke. Tiny perpendicular bend — not a hanging cable. */
export function hairlinePath(x1, y1, x2, y2, opts) {
  const a = Number(x1) || 0;
  const b = Number(y1) || 0;
  const c = Number(x2) || 0;
  const d = Number(y2) || 0;
  const dx = c - a;
  const dy = d - b;
  const len = Math.hypot(dx, dy) || 1;
  const bend = opts && opts.bend != null ? Number(opts.bend) : 0.032;
  const sign = opts && opts.sign != null ? Number(opts.sign) : 1;
  const mx = (a + c) / 2 + (-dy / len) * len * bend * sign;
  const my = (b + d) / 2 + (dx / len) * len * bend * sign;
  return `M ${r2(a)} ${r2(b)} Q ${r2(mx)} ${r2(my)} ${r2(c)} ${r2(d)}`;
}
