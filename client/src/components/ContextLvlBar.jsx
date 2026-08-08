/**
 * LVL-UP context Jagd-Bar — sticky strip above the messages panel.
 *
 * Single track (Snack pixel language):
 *   - Gray stones = context fill (truth / high-water front)
 *   - Gold snake  = scrollRatio × context fill (shrinks when scrolling up)
 *   - Soft-cap tick at soft-cap ratio
 *
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useEffect, useRef } from "react";
import { formatContextTooltip } from "../utils/contextMeter.js";

const CELL = 10;
const GAP = 1;
const STONE = CELL - GAP * 2; // 8

/** @param {string} c */
function parseColor(c) {
  const s = String(c || "").trim();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
    if (h.length >= 6) {
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    }
  }
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  return [212, 175, 55];
}

function mixColor(a, b, t) {
  const tt = Math.min(1, Math.max(0, t));
  const A = parseColor(a);
  const B = parseColor(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * tt)},${Math.round(A[1] + (B[1] - A[1]) * tt)},${Math.round(A[2] + (B[2] - A[2]) * tt)})`;
}

/**
 * @param {{
 *   contextFill: number,
 *   goldFill: number,
 *   softCapRatio: number,
 *   used: number,
 *   windowTokens: number,
 *   model: string,
 *   estimated?: boolean,
 *   animateKey?: string | number | null,
 * }} props
 */
export function ContextLvlBar({
  contextFill = 0,
  goldFill = 0,
  softCapRatio = 0.8,
  used = 0,
  windowTokens = 0,
  model = "",
  estimated = false,
  animateKey = null,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef({ key: null, from: 0, t0: 0 });
  const displayFillRef = useRef(0);

  const tooltip = formatContextTooltip({
    used,
    window: windowTokens,
    model,
    estimated,
    softCapPercent: Math.round(softCapRatio * 100),
  });

  const pct = Math.round(Math.min(1, Math.max(0, contextFill)) * 100);
  /* Compact on-bar label; full used/window lives in title/aria tooltip only */
  const label = `${estimated ? "~" : ""}${pct}%`;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const css = getComputedStyle(document.documentElement);
    const col = (name, fb) => (css.getPropertyValue(name) || "").trim() || fb;
    const palette = {
      track: col("--lvl-track", "rgba(128,128,128,0.18)"),
      gray: col("--lvl-gray", "rgba(140,140,150,0.55)"),
      grayEdge: col("--lvl-gray-edge", "rgba(180,180,190,0.7)"),
      head: col("--snack-snake-head", col("--gold-bright", "#e8c86a")),
      body: col("--snack-snake-body", col("--gold", "#d4af37")),
      soft: col("--lvl-soft-cap", "rgba(232,200,106,0.85)"),
      eye: "rgba(0,0,0,0.78)",
    };

    let raf = 0;
    let ro = null;

    const paint = (displayContextFill, displayGoldFill) => {
      const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
      const w = Math.max(40, Math.floor(wrap.clientWidth));
      const h = CELL + 6;
      if (
        canvas.width !== w * dpr ||
        canvas.height !== h * dpr ||
        canvas.style.width !== `${w}px`
      ) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);

      const padY = Math.floor((h - STONE) / 2);
      const trackW = Math.max(STONE, w - 4);
      const cols = Math.max(1, Math.floor(trackW / CELL));
      const trackPx = cols * CELL;

      // Track bed
      ctx.fillStyle = palette.track;
      for (let i = 0; i < cols; i++) {
        ctx.fillRect(i * CELL + GAP, padY, STONE, STONE);
      }

      const grayN = Math.round(cols * Math.min(1, Math.max(0, displayContextFill)));
      const goldN = Math.round(cols * Math.min(1, Math.max(0, displayGoldFill)));

      // Gray high-water (context front)
      for (let i = 0; i < grayN; i++) {
        const edge = i === grayN - 1;
        ctx.fillStyle = edge ? palette.grayEdge : palette.gray;
        ctx.fillRect(i * CELL + GAP, padY, STONE, STONE);
      }

      // Gold snake — head at fill front (eye faces right / track end)
      for (let i = 0; i < goldN; i++) {
        const fromHead = goldN - 1 - i; // 0 = head
        const t = goldN <= 1 ? 0 : fromHead / (goldN - 1);
        const fill =
          fromHead === 0
            ? palette.head
            : mixColor(palette.body, "#ffffff", 0.1 + t * 0.45);
        ctx.fillStyle = fill;
        ctx.fillRect(i * CELL + GAP, padY, STONE, STONE);
        if (fromHead === 0) {
          const eye = Math.max(2, Math.floor(STONE * 0.28));
          ctx.fillStyle = palette.eye;
          ctx.fillRect(
            i * CELL + GAP + STONE - eye - 1,
            padY + Math.floor((STONE - eye) / 2),
            eye,
            eye,
          );
        }
      }

      // Soft-cap tick
      const softX = Math.min(
        trackPx - 1,
        Math.max(0, Math.round(cols * Math.min(1, Math.max(0, softCapRatio))) * CELL),
      );
      ctx.fillStyle = palette.soft;
      ctx.fillRect(softX, padY - 2, 2, STONE + 4);
    };

    const targetFill = Math.min(1, Math.max(0, contextFill));
    const targetGold = Math.min(1, Math.max(0, goldFill));

    // Load / session-switch: animate gray front from 0 → target once
    if (animRef.current.key !== animateKey && animateKey != null) {
      animRef.current = {
        key: animateKey,
        from: 0,
        t0: performance.now(),
      };
      displayFillRef.current = 0;
    }

    const DURATION = 420;
    const tick = (now) => {
      let dispFill = targetFill;
      const anim = animRef.current;
      if (anim.key === animateKey && anim.t0 > 0) {
        const u = Math.min(1, (now - anim.t0) / DURATION);
        // ease-out
        const e = 1 - (1 - u) ** 2;
        dispFill = anim.from + (targetFill - anim.from) * e;
        if (u >= 1) anim.t0 = 0;
      }
      displayFillRef.current = dispFill;
      // Gold tracks scroll live; during intro anim scale gold with dispFill progress
      const goldScale =
        targetFill > 0.0001 ? dispFill / targetFill : 1;
      const dispGold = Math.min(dispFill, targetGold * goldScale);
      paint(dispFill, dispGold);
      if (anim.t0 > 0) raf = requestAnimationFrame(tick);
    };

    paint(displayFillRef.current || targetFill, targetGold);
    raf = requestAnimationFrame(tick);

    ro = new ResizeObserver(() => {
      paint(
        displayFillRef.current || targetFill,
        Math.min(displayFillRef.current || targetFill, targetGold),
      );
    });
    ro.observe(wrap);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [contextFill, goldFill, softCapRatio, animateKey]);

  return (
    <div
      ref={wrapRef}
      className="context-lvl-bar"
      role="meter"
      aria-label="Kontext-Füllung"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={tooltip}
      title={tooltip}
    >
      <canvas ref={canvasRef} className="context-lvl-bar-canvas" />
      <div className="context-lvl-bar-meta" aria-hidden="true">
        <span className="context-lvl-bar-tag">LVL</span>
        <span className="context-lvl-bar-label">{label}</span>
      </div>
    </div>
  );
}
