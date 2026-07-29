/**
 * Grok Build Terminal — browser chat UI
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

function wsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * Chat markdown: GFM + single newlines as hard breaks (Enter in the composer).
 * Without remark-breaks, Markdown collapses "line1\\nline2" into one line.
 */
function MarkdownBody({ text }) {
  const source = text ?? "";
  if (!source.trim()) {
    return <div className="md-body md-body--empty" />;
  }
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          // Avoid huge default margins inside tight chat bubbles
          p: ({ children }) => <p className="md-p">{children}</p>,
          br: () => <br />,
          ul: ({ children }) => <ul className="md-list">{children}</ul>,
          ol: ({ children }) => <ol className="md-list md-list--ol">{children}</ol>,
          li: ({ children }) => <li className="md-li">{children}</li>,
          h1: ({ children }) => <h3 className="md-h">{children}</h3>,
          h2: ({ children }) => <h3 className="md-h">{children}</h3>,
          h3: ({ children }) => <h4 className="md-h md-h--sm">{children}</h4>,
          h4: ({ children }) => <h4 className="md-h md-h--sm">{children}</h4>,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className?.includes("language-"));
            if (isBlock) {
              return (
                <code className={`md-code-block ${className || ""}`} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="md-code-inline" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="md-pre">{children}</pre>,
          blockquote: ({ children }) => (
            <blockquote className="md-quote">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="md-table-wrap">
              <table className="md-table">{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Shared snack stone geometry — same as Enter SnackBoard drawCell:
 * cell ≥ 10, gapRatio 0.14 → 8px gold stones, 2px between, 10px step.
 */
const SNACK_CELL = 10;
const SNACK_GAP = Math.max(1, Math.floor(SNACK_CELL * 0.14)); // 1
const SNACK_PIXEL = SNACK_CELL - SNACK_GAP * 2; // 8
const SNACK_STEP = SNACK_CELL; // center-to-center = cell

/** Parse #rgb / #rrggbb / rgb() / rgba() → [r,g,b] */
function snackParseColor(c) {
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
  return [212, 175, 55]; // --gold fallback
}

/** Lerp two CSS colors; t=0 → a, t=1 → b */
function snackMixColor(a, b, t) {
  const tt = Math.min(1, Math.max(0, t));
  const A = snackParseColor(a);
  const B = snackParseColor(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * tt);
  const g = Math.round(A[1] + (B[1] - A[1]) * tt);
  const bl = Math.round(A[2] + (B[2] - A[2]) * tt);
  return `rgb(${r},${g},${bl})`;
}

/**
 * Snack while Grok works: chases a coral STOP square on a dark arena.
 * Gold snake (accent family) stays visible in light + dark theme.
 * Click = cancel turn.
 */
function SnackBoard({ running, onStopClick }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const layoutRef = useRef({ cell: SNACK_CELL, boardW: 40, boardH: 40 });
  const onStopRef = useRef(onStopClick);
  onStopRef.current = onStopClick;

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const css = getComputedStyle(document.documentElement);
    const col = (name, fallback) =>
      (css.getPropertyValue(name) || "").trim() || fallback;
    // Fallbacks = same gold/danger hex as CSS tokens
    const palette = {
      arena: col("--send-work-bg", "transparent"),
      head: col("--snack-snake-head", "#d4af37"),
      body: col("--snack-snake-body", "#d4af37"),
      // Light end of head→tail ramp (only white mix — no extra hue)
      tailLite: "#ffffff",
      stop: col("--snack-stop", "#d94a4a"),
      stopInner: col("--snack-stop-inner", "#d94a4a"),
      // Dark pupil — readable on gold head in light + dark
      eye: "rgba(0,0,0,0.82)",
    };

    const parent = canvas.parentElement;
    const rect =
      parent?.getBoundingClientRect?.() || canvas.getBoundingClientRect();
    const availW = Math.max(28, Math.floor(rect.width));
    const availH = Math.max(40, Math.floor(rect.height));

    const cols = 4;
    let cell = Math.floor(Math.min(availW / cols, availH / 5));
    // Floor matches side scrollbar / WARTE stones (SNACK_CELL)
    cell = Math.max(SNACK_CELL, cell);
    const rows = Math.max(4, Math.floor(availH / cell));
    const boardW = cols * cell;
    const boardH = rows * cell;
    const maxLen = 5;
    layoutRef.current = { cell, boardW, boardH, cols, rows };

    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    canvas.width = boardW * dpr;
    canvas.height = boardH * dpr;
    canvas.style.width = `${boardW}px`;
    canvas.style.height = `${boardH}px`;
    canvas.style.maxWidth = "none";
    canvas.style.maxHeight = "none";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const key = (x, y) => `${x},${y}`;

    const reset = () => {
      const midY = Math.floor(rows / 2);
      stateRef.current = {
        snake: [
          { x: 1, y: midY },
          { x: 0, y: midY },
        ],
        dir: { x: 1, y: 0 },
        // Large stop target near bottom-right of board
        food: { x: cols - 1, y: Math.min(rows - 1, midY + 1) },
      };
    };

    const placeFood = (snake) => {
      const head = snake[0];
      const free = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!snake.some((s) => s.x === x && s.y === y)) {
            free.push({
              x,
              y,
              d: Math.abs(x - head.x) + Math.abs(y - head.y),
            });
          }
        }
      }
      if (free.length === 0) return { x: cols - 1, y: rows - 1 };
      free.sort((a, b) => b.d - a.d);
      const pool = free.slice(0, Math.max(1, Math.ceil(free.length * 0.4)));
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return { x: pick.x, y: pick.y };
    };

    const isBlocked = (x, y, snake, ignoreTail) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return true;
      const limit = ignoreTail ? snake.length - 1 : snake.length;
      for (let i = 0; i < limit; i++) {
        if (snake[i].x === x && snake[i].y === y) return true;
      }
      return false;
    };

    const bfsFirstStep = (snake, target) => {
      const head = snake[0];
      if (head.x === target.x && head.y === target.y) return null;

      const q = [{ x: head.x, y: head.y }];
      const came = new Map();
      came.set(key(head.x, head.y), null);
      let found = null;

      while (q.length) {
        const cur = q.shift();
        if (cur.x === target.x && cur.y === target.y) {
          found = cur;
          break;
        }
        const neigh = [
          { x: cur.x + 1, y: cur.y },
          { x: cur.x - 1, y: cur.y },
          { x: cur.x, y: cur.y + 1 },
          { x: cur.x, y: cur.y - 1 },
        ];
        neigh.sort((a, b) => {
          const da = Math.abs(a.x - target.x) + Math.abs(a.y - target.y);
          const db = Math.abs(b.x - target.x) + Math.abs(b.y - target.y);
          return da - db;
        });
        for (const n of neigh) {
          const k = key(n.x, n.y);
          if (came.has(k)) continue;
          if (isBlocked(n.x, n.y, snake, true)) continue;
          came.set(k, cur);
          q.push(n);
        }
      }

      if (!found) return null;

      let cur = found;
      let prev = came.get(key(cur.x, cur.y));
      while (prev && !(prev.x === head.x && prev.y === head.y)) {
        cur = prev;
        prev = came.get(key(cur.x, cur.y));
      }
      return { x: cur.x - head.x, y: cur.y - head.y };
    };

    const escapeDir = (snake) => {
      const head = snake[0];
      const options = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];
      let best = null;
      let bestScore = -1;
      for (const d of options) {
        const nx = head.x + d.x;
        const ny = head.y + d.y;
        if (isBlocked(nx, ny, snake, true)) continue;
        let open = 0;
        for (const d2 of options) {
          if (!isBlocked(nx + d2.x, ny + d2.y, snake, true)) open++;
        }
        if (open > bestScore) {
          bestScore = open;
          best = d;
        }
      }
      return best;
    };

    const pickDir = (snake) => {
      const food = stateRef.current.food;
      return bfsFirstStep(snake, food) || escapeDir(snake);
    };

    const drawCell = (x, y, fill, gapRatio = 0.14) => {
      // Same inset math as SNACK_PIXEL / SNACK_GAP (unified stone size)
      const gap = Math.max(1, Math.floor(cell * gapRatio));
      const s = cell - gap * 2;
      ctx.fillStyle = fill;
      ctx.fillRect(x * cell + gap, y * cell + gap, s, s);
      return { gap, size: s, px: x * cell + gap, py: y * cell + gap };
    };

    /** Coral stop block — clear target, not neon red */
    const drawStop = (x, y) => {
      const pad = Math.max(1, Math.floor(cell * 0.08));
      const s = cell - pad * 2;
      ctx.fillStyle = palette.stop;
      ctx.fillRect(x * cell + pad, y * cell + pad, s, s);
      const inn = Math.max(2, Math.floor(s * 0.22));
      ctx.fillStyle = palette.stopInner;
      ctx.fillRect(
        x * cell + pad + inn,
        y * cell + pad + inn,
        s - inn * 2,
        s - inn * 2,
      );
    };

    /** Dark pupil on head, aimed at the stop target (works light + dark). */
    const drawEye = (head, food, stone) => {
      const { px, py, size: sz } = stone;
      const eye = Math.max(2, Math.floor(sz * 0.28));
      const dx = food.x - head.x;
      const dy = food.y - head.y;
      let ex;
      let ey;
      if (Math.abs(dx) >= Math.abs(dy)) {
        // Prefer horizontal gaze
        ex = dx >= 0 ? px + sz - eye - 1 : px + 1;
        ey = py + Math.floor((sz - eye) / 2);
      } else {
        ex = px + Math.floor((sz - eye) / 2);
        ey = dy >= 0 ? py + sz - eye - 1 : py + 1;
      }
      ctx.fillStyle = palette.eye;
      ctx.fillRect(ex, ey, eye, eye);
    };

    const draw = () => {
      const s = stateRef.current;
      if (!s) return;

      // Transparent / same as button surface — no black fill takeover
      ctx.clearRect(0, 0, boardW, boardH);
      drawStop(s.food.x, s.food.y);

      // Head → tail gets lighter (same idea as chat scrollbar)
      const n = s.snake.length;
      s.snake.forEach((seg, i) => {
        const t = n <= 1 ? 0 : i / (n - 1); // 0 = head, 1 = tail
        // Head = full head gold; each body stone lighter toward white
        const fill =
          i === 0
            ? palette.head
            : snackMixColor(palette.body, palette.tailLite, 0.12 + t * 0.55);
        const stone = drawCell(seg.x, seg.y, fill, 0.14);
        if (i === 0) drawEye(seg, s.food, stone);
      });
    };

    reset();
    draw();

    const step = () => {
      const s = stateRef.current;
      if (!s) return;

      const nextDir = pickDir(s.snake);
      if (!nextDir) {
        reset();
        draw();
        return;
      }
      s.dir = nextDir;
      const head = s.snake[0];
      const nx = head.x + s.dir.x;
      const ny = head.y + s.dir.y;

      if (isBlocked(nx, ny, s.snake, true)) return;

      const next = [{ x: nx, y: ny }, ...s.snake];
      if (nx === s.food.x && ny === s.food.y) {
        // Hit stop square in-game — just relocate; real stop is click
        s.snake = next.slice(0, maxLen);
        s.food = placeFood(s.snake);
      } else {
        s.snake = next.slice(0, -1);
      }
      draw();
    };

    // Any click on the snack board while working = stop (red square is the cue)
    const onClick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onStopRef.current?.();
    };
    const onPointer = (ev) => {
      // pointerdown is more reliable than click inside nested button faces
      ev.preventDefault();
      ev.stopPropagation();
      onStopRef.current?.();
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("pointerdown", onPointer);
    const id = setInterval(step, 250);
    return () => {
      clearInterval(id);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("pointerdown", onPointer);
    };
  }, [running]);

  return (
    <canvas
      ref={canvasRef}
      className="snack-canvas snack-canvas--stop"
      title="Rotes Rechteck = Stopp (klicken)"
    />
  );
}

/**
 * Pixel-Snack scrollbar — Endpunkt-Modell
 *
 *  1. APPLE = always exact PIXEL×PIXEL square (never a bar).
 *  2. APPLE is pinned to the destination endpoint the snake hunts:
 *       scroll down → apple at BOTTOM of the track
 *       scroll up   → apple at TOP of the track
 *  3. Snake head maps to scroll ratio along the free track range.
 *  4. At the destination the apple sits on the snout (zero gap).
 *  5. After reverse, apple flips to the other end → large distance.
 *  6. HEAD is a fixed brick (never crawls); BODY pixels rotate tightly.
 *  7. Body spacing stays Enter-tight (STEP); never stretches. No ladder.
 */
function SnackScrollbar({ scrollRef, deps = [] }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const stateRef = useRef({
    visible: false,
    ratio: 0,
    trackH: 0,
    scrollTop: 0,
    dir: 1, // 1 = down (apple at bottom), -1 = up (apple at top)
    headY: 0,
    appleY: 0,
    headMin: 0,
    headMax: 0,
    snakeTop: 0,
    snakeBot: 0,
  });

  const PIXEL = SNACK_PIXEL; // 8×8 every stone + apple
  const BODY_N = 4; // rotating body stones (not head)
  const TOTAL = 1 + BODY_N; // head + body
  const BODY_GAP = SNACK_STEP - SNACK_PIXEL; // 2
  const STEP = SNACK_STEP; // 10
  const SNAKE_H = TOTAL * PIXEL + (TOTAL - 1) * BODY_GAP;
  const BODY_TRAIL = (TOTAL - 1) * STEP; // distance from head to last body slot
  const RAIL_W = PIXEL + 4;

  const drawSquare = (ctx, x, y, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x), Math.round(y), PIXEL, PIXEL);
  };

  const drawApple = (ctx, x, y, stop, stopInner) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    ctx.fillStyle = stop;
    ctx.fillRect(ix, iy, PIXEL, PIXEL);
    ctx.fillStyle = stopInner;
    ctx.fillRect(ix + 3, iy + 3, 2, 2);
  };

  /** Head travel range so snout touches apple at destination. */
  const headRange = (trackH, dir) => {
    const appleBelow = dir >= 0;
    const appleY = appleBelow ? trackH - PIXEL : 0;
    let headMin;
    let headMax;
    if (appleBelow) {
      // Body trails upward. Start near top; finish with snout on bottom apple.
      headMin = BODY_TRAIL;
      headMax = appleY - PIXEL; // head bottom edge = apple top edge
    } else {
      // Body trails downward. Finish near bottom; start with snout on top apple.
      headMin = appleY + PIXEL; // head top edge = apple bottom edge
      headMax = trackH - PIXEL - BODY_TRAIL;
    }
    if (headMax < headMin) {
      // Tiny track: collapse to centered contact if possible
      const mid = Math.max(0, Math.floor((trackH - PIXEL) / 2));
      headMin = appleBelow ? 0 : mid;
      headMax = appleBelow ? mid : Math.max(0, trackH - PIXEL);
      if (headMax < headMin) {
        headMin = 0;
        headMax = 0;
      }
    }
    return { appleY, headMin, headMax };
  };

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const st = stateRef.current;
    const css = getComputedStyle(document.documentElement);
    const col = (n, fb) => (css.getPropertyValue(n) || "").trim() || fb;
    const headC = col("--snack-snake-head", col("--gold-bright", "#e8c86a"));
    const bodyC = col("--snack-snake-body", col("--gold", "#d4af37"));
    const stopC = col("--snack-stop", "#d94a4a");
    const stopInnerC = col("--snack-stop-inner", "#e07070");

    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const w = RAIL_W;
    const h = Math.max(1, Math.floor(wrap.clientHeight));
    if (
      canvas.width !== w * dpr ||
      canvas.height !== h * dpr ||
      canvas.style.width !== `${w}px` ||
      canvas.style.height !== `${h}px`
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
    if (!st.visible) return;

    const x = Math.floor((w - PIXEL) / 2);
    const appleBelow = st.dir >= 0;
    const headY = Math.round(st.headY);
    const appleY = Math.round(st.appleY);

    // ── HEAD: fixed brick, eye toward destination apple ───────────
    drawSquare(ctx, x, headY, headC);
    {
      const eye = 2;
      const ex = x + Math.floor((PIXEL - eye) / 2);
      const ey = appleBelow
        ? Math.round(headY) + PIXEL - eye - 1
        : Math.round(headY) + 1;
      ctx.fillStyle = "rgba(0,0,0,0.78)";
      ctx.fillRect(ex, ey, eye, eye);
    }

    // ── BODY: crawl wrap; head→tail gets lighter ─────────────────
    const phase = ((st.scrollTop * 0.55) % STEP + STEP) % STEP;
    const band = BODY_N * STEP;
    for (let k = 0; k < BODY_N; k++) {
      let dist = (k + 1) * STEP - phase;
      dist = ((dist % band) + band) % band;
      if (dist < BODY_GAP) continue;

      // Soft edge only when a stone wraps at the tail band
      let alpha = 1;
      if (dist > band - PIXEL) {
        alpha = Math.max(0, (band - dist) / PIXEL);
      }

      const y = appleBelow
        ? headY - dist // body trails upward (away from bottom apple)
        : headY + dist; // body trails downward (away from top apple)

      if (y + PIXEL < 0 || y > h) continue;
      // k=0 nearest head, k→tail lighter (mix toward white only)
      const t = (k + 1) / BODY_N;
      const fill = snackMixColor(bodyC, "#ffffff", 0.08 + t * 0.5);
      ctx.globalAlpha = Math.max(0.45, alpha);
      drawSquare(ctx, x, y, fill);
    }
    ctx.globalAlpha = 1;

    // ── APPLE: pinned to endpoint, PIXEL×PIXEL ────────────────────
    if (appleY + PIXEL >= 0 && appleY <= h) {
      drawApple(ctx, x, appleY, stopC, stopInnerC);
    }
  }, [PIXEL, RAIL_W, STEP, BODY_N, BODY_GAP]);

  const measure = useCallback(() => {
    const el = scrollRef?.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflow = scrollHeight - clientHeight;
    const trackH = wrap.clientHeight;
    const prev = stateRef.current.scrollTop;
    const delta = scrollTop - prev;
    // Direction pins apple to the endpoint being hunted
    let dir = stateRef.current.dir;
    if (delta > 1.5) dir = 1;
    else if (delta < -1.5) dir = -1;

    if (overflow <= 4 || trackH <= 0) {
      stateRef.current = {
        ...stateRef.current,
        visible: false,
        trackH,
        scrollTop,
        dir,
      };
      setVisible(false);
      paint();
      return;
    }

    const ratio = Math.min(1, Math.max(0, scrollTop / overflow));
    const { appleY, headMin, headMax } = headRange(trackH, dir);
    const headY = headMin + ratio * (headMax - headMin);
    const appleBelow = dir >= 0;
    // Hit-box for the tight snake (body + head), not the empty hunt gap
    const snakeTop = appleBelow ? headY - BODY_TRAIL : headY;
    const snakeBot = appleBelow
      ? headY + PIXEL
      : headY + BODY_TRAIL + PIXEL;

    stateRef.current = {
      visible: true,
      ratio,
      trackH,
      scrollTop,
      dir,
      headY,
      appleY,
      headMin,
      headMax,
      snakeTop,
      snakeBot,
    };
    setVisible(true);
    paint();
  }, [scrollRef, paint, PIXEL, BODY_TRAIL]);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return undefined;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, scrollRef, ...deps]);

  const scrollToRatio = useCallback(
    (ratio) => {
      const el = scrollRef?.current;
      if (!el) return;
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow <= 0) return;
      el.scrollTop = Math.min(1, Math.max(0, ratio)) * overflow;
    },
    [scrollRef],
  );

  const onPointerDown = (e) => {
    e.preventDefault();
    const wrap = wrapRef.current;
    const el = scrollRef?.current;
    if (!wrap || !el) return;
    const rect = wrap.getBoundingClientRect();
    const st = stateRef.current;
    if (!st.visible) return;
    const yIn = e.clientY - rect.top;
    const { headMin, headMax, headY, snakeTop, snakeBot } = st;
    const onSnake = yIn >= snakeTop - 4 && yIn <= snakeBot + 4;
    if (onSnake) {
      dragRef.current = {
        startY: e.clientY,
        startHeadY: headY,
        headMin,
        headMax,
      };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } else {
      // Click track / apple → jump so head would sit near click
      const targetHead = Math.min(headMax, Math.max(headMin, yIn - PIXEL / 2));
      const span = headMax - headMin;
      scrollToRatio(span > 0 ? (targetHead - headMin) / span : 0);
    }
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const { startY, startHeadY, headMin, headMax } = dragRef.current;
    const headY = Math.min(
      headMax,
      Math.max(headMin, startHeadY + (e.clientY - startY)),
    );
    const span = headMax - headMin;
    scrollToRatio(span > 0 ? (headY - headMin) / span : 0);
  };

  const onPointerUp = (e) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`snack-scroll${visible ? " snack-scroll--on" : ""}`}
      style={{ width: RAIL_W }}
      aria-hidden={!visible}
    >
      <canvas
        ref={canvasRef}
        className="snack-scroll-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Scrollen · Apfel = Endpunkt · Schlange jagt · an Schnauze am Ziel"
      />
    </div>
  );
}

/** Elapsed whole seconds while `active` is true (resets when active flips on). */
function useWorkingSeconds(active) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return undefined;
    }
    const started = Date.now();
    setSeconds(0);
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 200);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}

/**
 * Command legend for this Browser-UI.
 * Keep UI-accurate first; slash list = high-value TUI/agent commands only
 * (not every pager-only flag). See ~/.grok/docs/user-guide/04-slash-commands.md
 */
const COMMAND_LEGEND = [
  {
    group: "Linke Leiste (diese UI)",
    items: [
      {
        cmd: "Lupe",
        need: "empfohlen",
        desc: "Sessions suchen/filtern, öffnen, schließen (+ Wiki-Archiv).",
      },
      {
        cmd: "Stift · Neuer Chat",
        need: "optional",
        desc: "Neue ACP-Session, Chat leeren. Entspricht TUI /new.",
      },
      {
        cmd: "Befehle",
        need: "optional",
        desc: "Filterbare Befehls-Legende (Slash, Composer, Leiste).",
      },
      {
        cmd: "Buch · Handbuch",
        need: "optional",
        desc: "Kurzhandbuch ganz unten in der Leiste (Tabs: Handbuch / Befehle).",
      },
      {
        cmd: "Kalender",
        need: "optional",
        desc: "Aktivitäts-Heatmap (gelb = aktiv, dunkler = häufiger, Peak mit Auge). Klick → Sessions des Tages.",
      },
      {
        cmd: "Wiki (i)",
        need: "optional",
        desc: "Öffnet Wiki-Index als .md (00 Index / WIKI.md / index.md) in Obsidian oder Standard-App.",
      },
      {
        cmd: "Workspace",
        need: "optional",
        desc: "Öffnet den aktuellen Arbeitsordner (cwd) im Finder.",
      },
      {
        cmd: "Theme",
        need: "optional",
        desc: "Hell / Dunkel umschalten.",
      },
      {
        cmd: "Refresh",
        need: "optional",
        desc: "UI neu laden (statt ⌘⇧R).",
      },
    ],
  },
  {
    group: "Composer & Chat",
    items: [
      {
        cmd: "Enter",
        need: "normal",
        desc: "Senden (ohne Shift). Shift+Enter = neue Zeile. Während Grok arbeitet → Warteschlange.",
      },
      {
        cmd: "Warteschlange",
        need: "optional",
        desc: "Follow-ups parken während der Antwort (wie TUI). Danach automatisch senden. × / Leeren.",
      },
      {
        cmd: "↵ / Snack · Stopp",
        need: "auto",
        desc: "Idle = Enter. Während Arbeit: Text+Enter = Queue; leerer Klick/Snack = sofortiger Soft-Abbruch (ACP). Kritische Tools laufen sicher zu Ende mit Hinweis.",
      },
      {
        cmd: "Chat | Deep Search | Fork",
        need: "empfohlen",
        desc: "Chat = normale Nachricht. Deep Search = /deep-research. Fork = Session branchen (/fork).",
      },
      {
        cmd: "verbunden / offline",
        need: "empfohlen",
        desc: "Agent starten/beenden. Gold = verbunden (nicht mehr „grün“).",
      },
      {
        cmd: "Freitext + Kontext",
        need: "normal",
        desc: "Aufgabe, Pfad, Fehlertext, Ziel — je klarer, desto besser.",
      },
      {
        cmd: "Mikrofon · Sprache",
        need: "optional",
        desc: "Diktieren (Grok STT). Klick starten/stoppen → Text im Composer. Braucht XAI_API_KEY.",
      },
      {
        cmd: "Lautsprecher · Vorlesen",
        need: "optional",
        desc: "Grok-Antwort vorlesen (Grok TTS). Button am Nachrichten-Kopf. Stimme wählbar.",
      },
    ],
  },
  {
    group: "Was Grok Build kann",
    items: [
      {
        cmd: "Code & Dateien",
        need: "auto",
        desc: "Lesen, schreiben, refaktorieren im Workspace (ACP-Tools).",
      },
      {
        cmd: "Terminal",
        need: "auto",
        desc: "Shell, Builds, Tests, Git — lokal über den Bridge-Agent.",
      },
      {
        cmd: "Recherche",
        need: "bei Bedarf",
        desc: "Web/Docs; oder Deep Search für strukturierte Multi-Quellen-Recherche.",
      },
      {
        cmd: "Bilder / Video",
        need: "auf Anfrage",
        desc: "Im TUI: /imagine, /imagine-video. Im Chat oft als Freitext möglich.",
      },
      {
        cmd: "Skills · Workflows · Subagents",
        need: "optional",
        desc: "Installierte Skills/Workflows; parallele Agenten bei komplexen Tasks.",
      },
    ],
  },
  {
    group: "Wichtige Slash-Befehle (TUI / Agent)",
    items: [
      {
        cmd: "/new · /clear",
        need: "optional",
        desc: "Neue Session. Hier: Stift / Neuer Chat.",
      },
      {
        cmd: "/resume · /dashboard",
        need: "optional",
        desc: "Sessions laden / Agent-Dashboard. Hier: Lupe (Overview).",
      },
      {
        cmd: "/fork",
        need: "optional",
        desc: "Session branchen. Hier: Aktion „Fork“ im Composer.",
      },
      {
        cmd: "/compact [notiz]",
        need: "bei vollem Kontext",
        desc: "Verlauf komprimieren, Context-Fenster freimachen.",
      },
      {
        cmd: "/context · /session-info",
        need: "optional",
        desc: "Context-Nutzung & Session-Status. Alias: /status, /info.",
      },
      {
        cmd: "/plan [text] · /view-plan",
        need: "optional",
        desc: "Plan-Modus: erst spezifizieren, dann umsetzen.",
      },
      {
        cmd: "/effort low|medium|high|xhigh",
        need: "optional",
        desc: "Reasoning-Aufwand (TUI). Beeinflusst Tiefe/Geschwindigkeit.",
      },
      {
        cmd: "/model <name>",
        need: "optional",
        desc: "Modell wechseln (TUI). Diese UI nutzt typisch Grok Build.",
      },
      {
        cmd: "/deep-research <query>",
        need: "optional",
        desc: "Hintergrund-Recherche mit Quellen. Hier: Aktion Deep Search.",
      },
      {
        cmd: "/workflow · /workflows · /goal",
        need: "optional",
        desc: "Workflows starten/steuern; Goals für längere autonome Aufgaben.",
      },
      {
        cmd: "/imagine · /imagine-video",
        need: "optional",
        desc: "Bild- bzw. Video-Generierung (TUI/Agent).",
      },
      {
        cmd: "/skills · /plugins · /mcps · /hooks",
        need: "optional",
        desc: "Erweiterungen, MCP-Server, Hooks (TUI-Modals).",
      },
      {
        cmd: "/remember · /memory · /flush · /dream",
        need: "optional",
        desc: "Memory notieren/verwalten (teilw. experimentell).",
      },
      {
        cmd: "/copy · /export",
        need: "optional",
        desc: "Letzte Antwort kopieren bzw. Gespräch exportieren.",
      },
      {
        cmd: "/doctor · /docs · /login",
        need: "bei Problemen",
        desc: "Diagnose, Doku, Auth. Alias Docs: /howto, /guides.",
      },
      {
        cmd: "/quit · /exit",
        need: "optional",
        desc: "Agent beenden. Hier: Pill „verbunden“ klicken.",
      },
    ],
  },
  {
    group: "Overview-Tasten",
    items: [
      {
        cmd: "↑ / ↓",
        need: "optional",
        desc: "Session markieren.",
      },
      {
        cmd: "Enter · Doppelklick",
        need: "optional",
        desc: "Session laden / öffnen.",
      },
      {
        cmd: "Esc",
        need: "optional",
        desc: "Panel schließen oder Bestätigung abbrechen.",
      },
    ],
  },
  {
    group: "Hinweis",
    items: [
      {
        cmd: "Slash in dieser UI",
        need: "hilfreich",
        desc: "Viele /Befehle sind TUI-Pager-Builtins. Im Browser oft Freitext an den Agenten; Deep Search/Fork/Sessions sind hier extra verdrahtet.",
      },
      {
        cmd: "Vollständige Liste",
        need: "optional",
        desc: "TUI: /docs · Datei: ~/.grok/docs/user-guide/04-slash-commands.md",
      },
    ],
  },
];

/** Render short handbook lines with optional **bold** spans. */
function HandbookText({ children }) {
  const text = String(children ?? "");
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/**
 * Kurzhandbuch (In-App) — verdichtet aus HANDBUCH.md.
 * Absichtlich kurz: was du im Chatfenster brauchst, ohne Setup-Wall.
 */
const SHORT_HANDBOOK = [
  {
    id: "start",
    title: "Schnellstart",
    body: [
      "Oben rechts **verbunden** (gold) = Agent läuft. Offline? Pill klicken.",
      "Nachricht tippen → **Enter** senden · **Shift+Enter** = neue Zeile.",
      "Ohne Verbindung ist das Eingabefeld deaktiviert.",
      "Sicherheit: Bridge mit vollen Tool-Rechten — **nur localhost**.",
    ],
  },
  {
    id: "layout",
    title: "Oberfläche",
    body: [
      "Links: Sessions, Neuer Chat, Befehle, Kalender, Wiki, Workspace, Theme, Refresh — **Buch** ganz unten.",
      "Mitte: Chat-Verlauf (Markdown). Rechts: Snack-Scrollbar (Schlange / Apfel).",
      "Unten: Composer · Chat | Deep Search | Fork · **Mic** · Stimme · **↵**.",
    ],
  },
  {
    id: "rail",
    title: "Linke Leiste",
    rows: [
      ["Lupe", "Sessions suchen, öffnen, schließen (+ Wiki-Archiv)"],
      ["Stift", "Neuer Chat (frische Session, wie TUI /new)"],
      ["Befehle", "Filterbare Legende (Mitte der Leiste)"],
      ["Buch", "Kurzhandbuch — ganz unten in der Leiste"],
      ["Kalender", "Aktivitäts-Heatmap — Klick → Sessions des Tages"],
      ["Wiki", "Wiki-Index (.md) in Obsidian / Standard-App"],
      ["Ordner", "Aktuellen Workspace (cwd) im Finder öffnen"],
      ["Theme", "Hell / Dunkel"],
      ["↻", "UI neu laden (statt ⌘⇧R)"],
    ],
  },
  {
    id: "composer",
    title: "Schreiben & senden",
    rows: [
      ["Chat", "Normale Nachricht an Grok"],
      ["Deep Search", "Strukturierte Multi-Quellen-Recherche"],
      ["Fork", "Session branchen; Text = optionale Directive"],
      ["Enter", "Senden · während Arbeit → Warteschlange"],
      ["Shift+Enter", "Neue Zeile ohne Senden"],
    ],
  },
  {
    id: "voice",
    title: "Sprache (Mic & Vorlesen)",
    body: [
      "**Mic** im Composer: Diktieren (STT). Klick → sprechen → Stop → Text im Feld.",
      "Dropdown daneben: TTS-Stimme (Eve, Ara, Rex, …).",
      "Lautsprecher an **fertigen** Grok-Antworten: vorlesen / stoppen.",
      "Braucht oft `XAI_API_KEY` (xAI Console). Fallback: Token nach `grok login`.",
    ],
  },
  {
    id: "working",
    title: "Während Grok arbeitet",
    rows: [
      ["Idle", "Button zeigt ↵ → senden"],
      ["Arbeitet", "Snack-Animation (Schlange jagt Apfel)"],
      ["Text + Enter", "Follow-up → Warteschlange (WARTE)"],
      ["Leer / Snack", "Soft-Stop (ACP-Cancel)"],
      ["× / Leeren", "Queue-Eintrag bzw. ganze Queue löschen"],
      ["Neue Ausgabe ↓", "Wieder ans aktuelle Chat-Ende springen"],
    ],
  },
  {
    id: "sessions",
    title: "Sessions & Wiki",
    body: [
      "Sessions liegen unter `~/.grok/sessions`. Lupe → suchen → Öffnen.",
      "Schließen: **Ja + Wiki** (Archiv + löschen) · **Löschen** · Abbrechen.",
      "Aktive Chat-Session ist geschützt. Speicher freigeben = Ordner löschen.",
      "Wiki-Ziel: `…/OpenClaw memory-wiki/sources/grok-sessions/`.",
    ],
  },
  {
    id: "can",
    title: "Was Grok hier kann",
    rows: [
      ["Code & Dateien", "Lesen, schreiben, refaktorieren im Workspace"],
      ["Terminal", "Shell, Builds, Tests, Git"],
      ["Recherche", "Web/Docs; Deep Search für tiefergehend"],
      ["Medien", "Bilder/Video oft als Freitext; TUI: /imagine"],
      ["Erweiterungen", "Skills, Workflows, Subagents, MCPs"],
    ],
  },
  {
    id: "flow",
    title: "Typische Abläufe",
    body: [
      "**Schnell:** verbunden → Aufgabe → Enter → optional Queue.",
      "**Fortsetzen:** Lupe → Session öffnen → weiterchatten.",
      "**Aufräumen:** Session schließen → Ja + Wiki.",
      "**Aktivität:** Kalender → Tag → Sessions.",
      "**Neues Thema:** Stift (clean) oder Fork (Abzweig mit Verlauf).",
    ],
  },
  {
    id: "tips",
    title: "Probleme & Tipps",
    rows: [
      ["offline", "Pill klicken · `grok` im PATH? · `grok login`?"],
      ["Eingabe grau", "Erst verbinden"],
      ["hängt", "Leerer Snack-Klick = Stop · sonst Refresh + reconnect"],
      ["Disk voll", "Sessions schließen mit Löschen/Wiki"],
      ["UI veraltet", "Refresh in der Leiste"],
      ["Slash „tut nichts“", "Viele /Befehle sind TUI-only — Freitext oder Tabs"],
    ],
  },
  {
    id: "check",
    title: "Checkliste",
    body: [
      "✓ `grok` eingeloggt · Status **verbunden**",
      "✓ Workspace passt (Header-Pfad)",
      "✓ Enter = senden · Shift+Enter = Zeile",
      "✓ Arbeit: Text → Queue, leer → Stop",
      "✓ Lupe · Kalender · Wiki · Mic / Lautsprecher",
    ],
  },
];

function CommandLegend({ open, onClose, initialTab = "handbook" }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState(initialTab); // handbook | commands
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTab(initialTab === "commands" ? "commands" : "handbook");
      requestAnimationFrame(() => panelRef.current?.focus());
    }
  }, [open, initialTab]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMAND_LEGEND;
    return COMMAND_LEGEND.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) =>
          it.cmd.toLowerCase().includes(q) ||
          it.desc.toLowerCase().includes(q) ||
          it.need.toLowerCase().includes(q) ||
          g.group.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const filteredHandbook = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORT_HANDBOOK;
    return SHORT_HANDBOOK.filter((sec) => {
      const hay = [
        sec.title,
        ...(sec.body || []),
        ...((sec.rows || []).flatMap((r) => r)),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  if (!open) return null;

  return (
    <div className="overview-scrim" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="overview-panel legend-panel handbook-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Hilfe und Kurzhandbuch"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <header className="overview-head">
          <div>
            <p className="overview-kicker">In der App</p>
            <h2>Kurzhandbuch</h2>
            <p className="overview-meta">
              Überblick · Bedienung · Sprache · Sessions · Tipps
            </p>
          </div>
          <div className="overview-head-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Schließen
            </button>
          </div>
        </header>

        <div className="help-tabs" role="tablist" aria-label="Hilfe-Bereich">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "handbook"}
            className={`help-tab${tab === "handbook" ? " help-tab--active" : ""}`}
            onClick={() => setTab("handbook")}
          >
            Handbuch
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "commands"}
            className={`help-tab${tab === "commands" ? " help-tab--active" : ""}`}
            onClick={() => setTab("commands")}
          >
            Befehle
          </button>
        </div>

        {tab === "handbook" ? (
          <p className="overview-hint">
            Kurzanleitung für dieses Chatfenster. Volltext:{" "}
            <code>HANDBUCH.md</code> im Projekt · TUI: <code>/docs</code>.
          </p>
        ) : (
          <p className="overview-hint">
            <strong>Pflicht:</strong> keine — Freitext reicht.{" "}
            <strong>Empfohlen:</strong> verbunden + klare Aufgabe.{" "}
            <strong>Slash:</strong> im TUI nativ; hier u. a. Deep Search, Fork,
            Sessions.
          </p>
        )}

        <input
          className="overview-search"
          type="search"
          placeholder={
            tab === "handbook"
              ? "Filter: Mic, Queue, Sessions, offline…"
              : "Filter: Lupe, /fork, Deep Search, compact…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        {tab === "handbook" ? (
          <div className="overview-list handbook-list" role="tabpanel">
            {filteredHandbook.length === 0 ? (
              <div className="empty-inline">Kein Treffer.</div>
            ) : (
              filteredHandbook.map((sec) => (
                <section key={sec.id} className="handbook-section">
                  <h3 className="handbook-section-title">{sec.title}</h3>
                  {sec.body?.map((line) => (
                    <p key={line} className="handbook-line">
                      <HandbookText>{line}</HandbookText>
                    </p>
                  ))}
                  {sec.rows?.length > 0 && (
                    <div className="handbook-table" role="list">
                      {sec.rows.map(([k, v]) => (
                        <div key={k} className="handbook-row" role="listitem">
                          <code className="handbook-key">{k}</code>
                          <span className="handbook-val">
                            <HandbookText>{v}</HandbookText>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))
            )}
          </div>
        ) : (
          <div className="overview-list legend-list" role="tabpanel">
            {filteredCommands.length === 0 ? (
              <div className="empty-inline">Kein Treffer.</div>
            ) : (
              filteredCommands.map((g) => (
                <div key={g.group} className="legend-group">
                  <h3 className="legend-group-title">{g.group}</h3>
                  {g.items.map((it) => (
                    <article key={it.cmd} className="legend-row">
                      <div className="legend-cmd">
                        <code>{it.cmd}</code>
                        <span
                          className={`legend-need legend-need--${
                            it.need === "empfohlen" ||
                            it.need === "bei vollem Kontext" ||
                            it.need === "bei Problemen"
                              ? "soft"
                              : it.need === "normal" || it.need === "auto"
                                ? "ok"
                                : "muted"
                          }`}
                        >
                          {it.need}
                        </span>
                      </div>
                      <p className="legend-desc">{it.desc}</p>
                    </article>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function IconSearch({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M16.2 16.2L20.5 20.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconCompose({ size = 20 }) {
  /* Rectangle with pen — neue Session / compose */
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M13.2 8.3l2.5 2.5M8 16l.7-2.6 5.9-5.9a1.2 1.2 0 0 1 1.7 0l.9.9a1.2 1.2 0 0 1 0 1.7L11 15.3 8 16z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCommands({ size = 20 }) {
  /* Command palette / slash — Befehle */
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 7.5V9a2.5 2.5 0 0 1-2.5 2.5H5M15 7.5V9a2.5 2.5 0 0 0 2.5 2.5H19M9 16.5V15a2.5 2.5 0 0 0-2.5-2.5H5M15 16.5V15a2.5 2.5 0 0 1 2.5-2.5H19"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M10 12h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Closed book — Kurzhandbuch (Leiste unten) */
function IconBook({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 4.75h9.25A2.25 2.25 0 0 1 18 7v12.25H8A1.5 1.5 0 0 0 6.5 20.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 4.75A1.75 1.75 0 0 0 4.75 6.5v12.5c0 .97.78 1.75 1.75 1.75H18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 8.5h5.5M9.5 12h5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Activity calendar icon — 4 snack-style cells:
 * red apple (+ light highlight) · dark gold head (eye toward apple) · mid · light
 */
function IconCalendar({ size = 20 }) {
  const gap = 1.5;
  const cell = (24 - gap * 3) / 2; // 2×2 grid with outer padding = gap
  const pad = gap;
  const r = 1.2;
  // positions: [x, y]
  const tl = [pad, pad];
  const tr = [pad + cell + gap, pad];
  const bl = [pad, pad + cell + gap];
  const br = [pad + cell + gap, pad + cell + gap];
  // apple red · peak head · mid · light (matches cal-cell / snack palette)
  const apple = "var(--snack-stop, #d94a4a)";
  // same as snack drawApple stopInner (danger-bright = red + white)
  const appleDot = "var(--snack-stop-inner, #e8a0a0)";
  const head = "var(--gold-deep, #8a6a12)";
  const mid = "var(--gold, #d4af37)";
  const light = "var(--gold-bright, #e8c86a)";
  const eye = "rgba(0,0,0,0.82)";
  // highlight on apple (matches snack PIXEL apple: inset light square)
  const appleDotSz = 2.2;
  const appleDotX = tl[0] + 2.2;
  const appleDotY = tl[1] + 2.2;
  // eye on head (top-right) looking LEFT toward the apple
  const eyeSz = 2.2;
  const eyeX = tr[0] + 1.4;
  const eyeY = tr[1] + (cell - eyeSz) / 2;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* top-left: Apfel (rot) + heller Punkt wie Snack-Apfel */}
      <rect x={tl[0]} y={tl[1]} width={cell} height={cell} rx={r} fill={apple} />
      <rect
        x={appleDotX}
        y={appleDotY}
        width={appleDotSz}
        height={appleDotSz}
        fill={appleDot}
      />
      {/* top-right: Kopf / Peak — Auge schaut zum Apfel (links) */}
      <rect x={tr[0]} y={tr[1]} width={cell} height={cell} rx={r} fill={head} />
      <rect x={eyeX} y={eyeY} width={eyeSz} height={eyeSz} fill={eye} />
      {/* bottom-left: mittel */}
      <rect x={bl[0]} y={bl[1]} width={cell} height={cell} rx={r} fill={mid} />
      {/* bottom-right: hell */}
      <rect x={br[0]} y={br[1]} width={cell} height={cell} rx={r} fill={light} />
    </svg>
  );
}

/**
 * Activity calendar (Claude-Code style):
 * gold cells = active days; brighter = less, darker = more;
 * darkest + eye = peak frequency.
 */
function ActivityCalendar({ open, onClose, onOpenSession }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setSelected(null);
    setError("");
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/activity?weeks=20");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Aktivität laden fehlgeschlagen");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const dayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const formatDay = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="overview-scrim" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="overview-panel cal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Aktivitäts-Kalender"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <header className="overview-head">
          <div>
            <p className="overview-kicker">Aktivität</p>
            <h2>Kalender</h2>
            <p className="overview-meta">
              {data
                ? `${data.activeDays} aktive Tage · ${data.totalEvents} Events · Peak ${data.peakDate || "—"}`
                : "Wann du gearbeitet hast — und woran"}
            </p>
          </div>
          <div className="overview-head-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Schließen
            </button>
          </div>
        </header>

        <p className="overview-hint">
          <strong>Gelb</strong> = aktiv.{" "}
          <strong>Heller</strong> = weniger · <strong>Dunkler</strong> = häufiger.{" "}
          <strong>Peak</strong> = dunkelstes Kästchen mit Auge. Klick = Sessions des Tages.
        </p>

        {error ? <div className="banner">{error}</div> : null}
        {loading ? (
          <div className="empty-inline">Lade Aktivität…</div>
        ) : data ? (
          <div className="cal-body">
            <div className="cal-chart" role="img" aria-label="Aktivitäts-Heatmap">
              <div className="cal-day-labels" aria-hidden="true">
                {dayLabels.map((lab, i) => (
                  <span key={lab} className={i % 2 === 1 ? "cal-day-label" : "cal-day-label cal-day-label--dim"}>
                    {i % 2 === 1 ? lab : ""}
                  </span>
                ))}
              </div>
              <div className="cal-grid-wrap">
                <div className="cal-grid">
                  {(data.weeks || []).map((week, wi) => (
                    <div className="cal-week" key={`w-${wi}`}>
                      {week.map((cell) => {
                        if (cell.empty) {
                          return (
                            <span
                              key={cell.date}
                              className="cal-cell cal-cell--pad"
                              aria-hidden="true"
                            />
                          );
                        }
                        const isSel = selected?.date === cell.date;
                        return (
                          <button
                            key={cell.date}
                            type="button"
                            className={[
                              "cal-cell",
                              `cal-cell--l${cell.level}`,
                              cell.peak ? "cal-cell--peak" : "",
                              isSel ? "cal-cell--selected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            title={`${cell.date}: ${cell.count} Events${cell.peak ? " · Peak" : ""}`}
                            aria-label={`${cell.date}, ${cell.count} Events${cell.peak ? ", Peak" : ""}`}
                            aria-pressed={isSel}
                            onClick={() => setSelected(cell)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="cal-legend" aria-hidden="true">
              <span className="cal-legend-label">weniger</span>
              {[0, 1, 2, 3, 4].map((lv) => (
                <span
                  key={lv}
                  className={`cal-cell cal-cell--l${lv}${lv === 4 ? " cal-cell--peak" : ""}`}
                />
              ))}
              <span className="cal-legend-label">mehr · Peak</span>
            </div>

            <div className="cal-detail">
              {selected ? (
                <>
                  <h3 className="cal-detail-title">
                    {formatDay(selected.date)}
                    {selected.peak ? (
                      <span className="cal-peak-badge" title="Peak-Tag">
                        Peak
                      </span>
                    ) : null}
                  </h3>
                  <p className="cal-detail-meta">
                    {selected.count} Events · {selected.sessions?.length || 0} Session
                    {(selected.sessions?.length || 0) === 1 ? "" : "s"}
                  </p>
                  {selected.sessions?.length ? (
                    <ul className="cal-session-list">
                      {selected.sessions.map((s) => (
                        <li key={s.id} className="cal-session-row">
                          <div className="cal-session-main">
                            <span className="cal-session-title">{s.title}</span>
                            <span className="cal-session-count">{s.count}</span>
                          </div>
                          <button
                            type="button"
                            className="ghost cal-session-open"
                            onClick={async () => {
                              try {
                                const res = await fetch(
                                  `/api/sessions/${s.id}/open`,
                                  { method: "POST" },
                                );
                                const json = await res.json();
                                if (!res.ok) {
                                  throw new Error(
                                    json.error || "Session nicht öffnenbar",
                                  );
                                }
                                onOpenSession?.(json);
                                onClose?.();
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : String(err),
                                );
                              }
                            }}
                            title="Session öffnen (falls noch auf Disk)"
                          >
                            Öffnen
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="cal-detail-empty">Keine Session-Details für diesen Tag.</p>
                  )}
                </>
              ) : (
                <p className="cal-detail-empty">
                  Wähle ein Kästchen — dann siehst du, woran du an dem Tag gearbeitet hast.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function IconFolder({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6H10l1.8 1.8H17.5A2.5 2.5 0 0 1 20 10.3v5.2A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5v-7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wiki / Info — circle with “i” (clearer than book/cabinet). */
function IconWiki({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="8.2" r="1.15" fill="currentColor" />
      <path
        d="M12 11.2v5.6"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconWorkspace({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-5v-5H10v5H5a1 1 0 0 1-1-1v-8.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTheme({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 4v16c4 0 7.5-3.6 7.5-8S16 4 12 4z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function IconMic({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3.5" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.5M9 20.5h6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSpeaker({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9.5v5h3.2L12 18.5V5.5L7.2 9.5H4z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M15.2 9.2a3.2 3.2 0 0 1 0 5.6M17.6 7a5.6 5.6 0 0 1 0 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSpeakerOff({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9.5v5h3.2L12 18.5V5.5L7.2 9.5H4z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Prefer browser-native MediaRecorder mime types that xAI STT accepts. */
function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* skip */
    }
  }
  return "";
}

/** Strip markdown-ish noise so TTS reads more naturally. */
function textForSpeech(raw) {
  let t = String(raw || "");
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/!\[[^\]]*]\([^)]+\)/g, " ");
  t = t.replace(/\[([^\]]+)]\([^)]+\)/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");
  t = t.replace(/(\*|_)(.*?)\1/g, "$2");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+\.\s+/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function IconRefresh({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M19.5 5v4.5H15"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStop({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

function CommandOverview({ open, onClose, onOpenSession }) {
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [closingId, setClosingId] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  /** Cursor in the list — NOT the live agent session. */
  const [selectedIndex, setSelectedIndex] = useState(0);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const rowRefs = useRef(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sessions");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setLastResult(null);
      setConfirmId(null);
      setSelectedIndex(0);
      void load();
      // Lupe opens sessions + search together — focus filter field
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, load]);

  const filtered = useMemo(() => {
    const list = data?.sessions || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      [s.title, s.summary, s.cwd, s.model, s.agent, s.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, query]);

  // Keep selection in range when filter/list changes
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((i) => Math.min(Math.max(0, i), filtered.length - 1));
  }, [filtered.length, query]);

  // Scroll selected row into view
  useEffect(() => {
    const id = filtered[selectedIndex]?.id;
    if (!id) return;
    const el = rowRefs.current.get(id);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, filtered]);

  const closeSession = useCallback(
    async (id, { writeWiki = true, deleteDisk = true } = {}) => {
      setClosingId(id);
      setError("");
      setLastResult(null);
      try {
        const res = await fetch(`/api/sessions/${id}/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ writeWiki, deleteDisk }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Schließen fehlgeschlagen");
        setLastResult(json);
        setConfirmId(null);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setClosingId(null);
      }
    },
    [load],
  );

  const openSessionById = useCallback(
    async (id) => {
      if (!id || opening) return;
      setOpening(true);
      setError("");
      try {
        const res = await fetch(`/api/sessions/${id}/open`, { method: "POST" });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Session konnte nicht geladen werden");
        }
        onOpenSession?.(json);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setOpening(false);
      }
    },
    [opening, onOpenSession, onClose],
  );

  const openSelected = useCallback(async () => {
    const s = filtered[selectedIndex];
    if (!s) return;
    await openSessionById(s.id);
  }, [filtered, selectedIndex, openSessionById]);

  const onPanelKeyDown = useCallback(
    (e) => {
      // Don't steal keys while typing in search or confirming close buttons
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          // leave search and navigate list
          e.preventDefault();
          panelRef.current?.focus();
          if (e.key === "ArrowDown") {
            setSelectedIndex((i) =>
              Math.min(filtered.length - 1, Math.max(0, i) + 1),
            );
          } else {
            setSelectedIndex((i) => Math.max(0, i - 1));
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) =>
          Math.min(filtered.length - 1, Math.max(0, i) + 1),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void openSelected();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (confirmId) setConfirmId(null);
        else onClose();
      }
    },
    [filtered.length, openSelected, onClose, confirmId],
  );

  if (!open) return null;

  return (
    <div className="overview-scrim" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="overview-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command Overview"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
      >
        <header className="overview-head">
          <div>
            <p className="overview-kicker">Suche &amp; Sessions</p>
            <h2>Sessions</h2>
            <p className="overview-meta">
              {data
                ? `${data.count} on record · ${data.totalLabel} lokal`
                : "…"}
              {data?.wikiRoot ? (
                <>
                  <br />
                  <span className="muted-path">Wiki → sources/grok-sessions</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="overview-head-actions">
            <button type="button" onClick={() => void load()} disabled={loading}>
              {loading ? "…" : "Aktualisieren"}
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              Schließen
            </button>
          </div>
        </header>

        <p className="overview-hint">
          <strong>Auswählen:</strong> Klick oder ↑↓ — Markierung (nicht „aktiv“).{" "}
          <strong>Laden:</strong> Enter oder Doppelklick (Verlauf öffnen).{" "}
          <strong>Schließen:</strong> Ja + Wiki / Löschen / Abbrechen. Disk:{" "}
          <code>~/.grok/sessions</code>.
        </p>

        <input
          ref={searchRef}
          className="overview-search"
          type="search"
          placeholder="Sessions suchen: Titel, Workspace, Model…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
        />

        {error ? <div className="banner">{error}</div> : null}
        {opening ? (
          <div className="banner ok-banner">Session wird geladen…</div>
        ) : null}
        {lastResult ? (
          <div className="banner ok-banner">
            {lastResult.wikiWritten
              ? "Wiki + gelöscht: "
              : lastResult.diskDeleted
                ? "Gelöscht: "
                : "Geschlossen: "}
            {lastResult.session?.title || lastResult.session?.id}
            {lastResult.freedLabel ? ` · freigegeben ${lastResult.freedLabel}` : ""}
            {lastResult.wikiPath ? (
              <>
                <br />
                <code>{lastResult.wikiPath}</code>
              </>
            ) : null}
          </div>
        ) : null}
        {data?.cleaned?.removed > 0 ? (
          <div className="banner ok-banner">
            Leere Chats bereinigt: {data.cleaned.removed}
            {data.cleaned.freedLabel
              ? ` · freigegeben ${data.cleaned.freedLabel}`
              : ""}
          </div>
        ) : null}

        <div className="overview-list" ref={listRef} role="listbox" aria-label="Sessions">
          {loading && !data ? (
            <div className="empty-inline">Lade Sessions…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-inline">Keine Sessions.</div>
          ) : (
            filtered.map((s, index) => {
              const isActive = data?.activeSessionId === s.id;
              const isSelected = index === selectedIndex;
              const confirming = confirmId === s.id;
              return (
                <article
                  key={s.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(s.id, el);
                    else rowRefs.current.delete(s.id);
                  }}
                  role="option"
                  aria-selected={isSelected}
                  className={[
                    "session-row",
                    isSelected ? "is-selected" : "",
                    isActive ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedIndex(index)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    setSelectedIndex(index);
                    void openSessionById(s.id);
                  }}
                >
                  <div className="session-main">
                    <div className="session-title-row">
                      <strong>{s.title}</strong>
                      {isActive ? <span className="tag">aktiv</span> : null}
                      {isSelected && !isActive ? (
                        <span className="tag muted">markiert</span>
                      ) : null}
                      {s.kind === "subagent" ? (
                        <span className="tag muted">subagent</span>
                      ) : null}
                      {s.empty ? (
                        <span className="tag muted">leer</span>
                      ) : null}
                    </div>
                    <div className="session-sub">
                      {s.diskLabel} · {s.chatMessages ?? "?"} msgs ·{" "}
                      {formatWhen(s.updatedAt)}
                      {s.model ? ` · ${s.model}` : ""}
                    </div>
                    <div className="session-id">{s.id}</div>
                  </div>
                  <div
                    className="session-actions"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    {confirming ? (
                      <>
                        <button
                          type="button"
                          className="primary"
                          disabled={closingId === s.id || isActive || opening}
                          title="Zusammenfassen → Wiki → Disk löschen"
                          onClick={() =>
                            void closeSession(s.id, {
                              writeWiki: true,
                              deleteDisk: true,
                            })
                          }
                        >
                          {closingId === s.id ? "…" : "Ja + Wiki"}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={closingId === s.id || isActive || opening}
                          title="Nur löschen, ohne Wiki-Archiv"
                          onClick={() =>
                            void closeSession(s.id, {
                              writeWiki: false,
                              deleteDisk: true,
                            })
                          }
                        >
                          {closingId === s.id ? "…" : "Löschen"}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={closingId === s.id}
                          onClick={() => setConfirmId(null)}
                        >
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="primary"
                          disabled={opening}
                          title="Verlauf laden (Enter / Doppelklick)"
                          onClick={() => {
                            setSelectedIndex(index);
                            void openSessionById(s.id);
                          }}
                        >
                          Öffnen
                        </button>
                        <button
                          type="button"
                          disabled={closingId === s.id || isActive || opening}
                          title={
                            isActive
                              ? "Aktive Chat-Session geschützt"
                              : "Ja + Wiki · Löschen · Abbrechen"
                          }
                          onClick={() => setConfirmId(s.id)}
                        >
                          Schließen
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

const QUEUE_STORAGE_KEY = "gbt-queue";
const QUEUE_MAX = 40;

/** Load parked follow-ups so refresh does not wipe the Warteschlange. */
function loadPersistedQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) return [];
    return items
      .filter(
        (q) =>
          q &&
          typeof q.id === "string" &&
          typeof q.text === "string" &&
          q.text.trim(),
      )
      .map((q) => ({
        id: q.id,
        text: q.text,
        action:
          q.action === "deep-search" || q.action === "fork" ? q.action : "chat",
        displayText:
          typeof q.displayText === "string" && q.displayText
            ? q.displayText
            : q.text,
      }))
      .slice(0, QUEUE_MAX);
  } catch {
    return [];
  }
}

function persistQueue(items) {
  try {
    if (!items?.length) {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      QUEUE_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        items: items.slice(0, QUEUE_MAX),
      }),
    );
  } catch {
    /* private mode / quota */
  }
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Follow-up messages parked while Grok is working (TUI-style queue). */
  const [queue, setQueue] = useState(() => loadPersistedQueue());
  const queueRef = useRef(null);
  if (queueRef.current === null) {
    queueRef.current = queue;
  }
  /** Mirror busy/streaming so drain logic does not rely on stale closures. */
  const busyRef = useRef(false);
  const streamingRef = useRef(false);
  const drainTimerRef = useRef(null);
  const drainingRef = useRef(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [cwd, setCwd] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  /** Composer action: chat | deep-search | fork (TUI-aligned, not thinking toggle). */
  const [sendAction, setSendAction] = useState(() => {
    try {
      const v = localStorage.getItem("gbt-action");
      if (v === "deep-search" || v === "fork" || v === "chat") return v;
    } catch {
      /* ignore */
    }
    return "chat";
  });
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("gbt-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [wikiRoot, setWikiRoot] = useState("");
  const [showOverview, setShowOverview] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [legendTab, setLegendTab] = useState("handbook");
  const [showCalendar, setShowCalendar] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // —— Grok Voice (xAI STT / TTS) ——
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceHint, setVoiceHint] = useState("");
  const [voiceId, setVoiceId] = useState(() => {
    try {
      return localStorage.getItem("gbt-voice-id") || "eve";
    } catch {
      return "eve";
    }
  });
  const [voiceList, setVoiceList] = useState([
    { voice_id: "eve", name: "Eve" },
    { voice_id: "ara", name: "Ara" },
    { voice_id: "rex", name: "Rex" },
    { voice_id: "sal", name: "Sal" },
    { voice_id: "leo", name: "Leo" },
  ]);
  const [sttLanguage] = useState(() => {
    try {
      return localStorage.getItem("gbt-stt-lang") || "de";
    } catch {
      return "de";
    }
  });
  const [ttsLanguage] = useState(() => {
    try {
      return localStorage.getItem("gbt-tts-lang") || "de";
    } catch {
      return "de";
    }
  });
  const [recording, setRecording] = useState(false);
  const [sttBusy, setSttBusy] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [ttsBusyId, setTtsBusyId] = useState(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const ttsAudioRef = useRef(null);
  const ttsUrlRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("gbt-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("gbt-action", sendAction);
    } catch {
      /* ignore */
    }
  }, [sendAction]);

  // Survive window refresh: keep Warteschlange in localStorage
  useEffect(() => {
    persistQueue(queue);
  }, [queue]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => {
        if (j.wikiRoot) setWikiRoot(j.wikiRoot);
        if (j.cwd) setCwd(j.cwd);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/voice/status");
        const j = await res.json();
        if (cancelled) return;
        setVoiceAvailable(Boolean(j.available));
        setVoiceHint(j.hint || "");
        if (j.defaults?.voiceId && !localStorage.getItem("gbt-voice-id")) {
          setVoiceId(j.defaults.voiceId);
        }
        if (j.available) {
          try {
            const vr = await fetch("/api/tts/voices");
            const vj = await vr.json();
            if (!cancelled && Array.isArray(vj.voices) && vj.voices.length) {
              setVoiceList(vj.voices);
            }
          } catch {
            /* keep defaults */
          }
        }
      } catch {
        if (!cancelled) {
          setVoiceAvailable(false);
          setVoiceHint("Voice-Status nicht erreichbar.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("gbt-voice-id", voiceId);
    } catch {
      /* ignore */
    }
  }, [voiceId]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      mediaStreamRef.current?.getTracks?.().forEach((t) => t.stop());
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if (ttsUrlRef.current) {
        URL.revokeObjectURL(ttsUrlRef.current);
        ttsUrlRef.current = null;
      }
    };
  }, []);

  const stopTts = useCallback(() => {
    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.pause();
      } catch {
        /* ignore */
      }
      ttsAudioRef.current = null;
    }
    if (ttsUrlRef.current) {
      URL.revokeObjectURL(ttsUrlRef.current);
      ttsUrlRef.current = null;
    }
    setSpeakingId(null);
    setTtsBusyId(null);
  }, []);

  const speakText = useCallback(
    async (id, rawText) => {
      if (speakingId === id) {
        stopTts();
        return;
      }
      stopTts();
      const spoken = textForSpeech(rawText);
      if (!spoken) {
        setError("Nichts zum Vorlesen.");
        return;
      }
      setTtsBusyId(id);
      setError("");
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: spoken,
            voice_id: voiceId,
            language: ttsLanguage,
          }),
        });
        if (!res.ok) {
          let msg = `TTS ${res.status}`;
          try {
            const j = await res.json();
            if (j.error) msg = j.error;
          } catch {
            /* binary error body unlikely */
          }
          throw new Error(msg);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        ttsUrlRef.current = url;
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        audio.onended = () => {
          stopTts();
        };
        audio.onerror = () => {
          setError("Audio-Wiedergabe fehlgeschlagen.");
          stopTts();
        };
        setSpeakingId(id);
        setTtsBusyId(null);
        await audio.play();
      } catch (err) {
        setTtsBusyId(null);
        setSpeakingId(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [speakingId, stopTts, voiceId, ttsLanguage],
  );

  const blobToBase64 = useCallback((blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const i = dataUrl.indexOf(",");
        resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
      };
      reader.onerror = () => reject(new Error("Audio lesen fehlgeschlagen"));
      reader.readAsDataURL(blob);
    });
  }, []);

  const finishRecording = useCallback(
    async (blob, mimeType) => {
      setSttBusy(true);
      setError("");
      try {
        const audioBase64 = await blobToBase64(blob);
        const res = await fetch("/api/stt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64,
            mimeType: mimeType || blob.type || "audio/webm",
            language: sttLanguage,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(j.error || `STT ${res.status}`);
        }
        const text = String(j.text || "").trim();
        if (!text) {
          setError("Keine Sprache erkannt.");
          return;
        }
        setInput((prev) => {
          const base = prev.trimEnd();
          if (!base) return text;
          const needSpace = !/[\s\n]$/.test(base);
          return `${base}${needSpace ? " " : ""}${text}`;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSttBusy(false);
      }
    },
    [blobToBase64, sttLanguage],
  );

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (sttBusy || recording) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Mikrofon wird von diesem Browser nicht unterstützt.");
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const mime = pickRecorderMime();
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      rec.onerror = () => {
        setError("Aufnahme-Fehler.");
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type });
        audioChunksRef.current = [];
        if (blob.size < 200) {
          setError("Aufnahme zu kurz — bitte länger sprechen.");
          return;
        }
        void finishRecording(blob, type);
      };
      rec.start(200);
      setRecording(true);
    } catch (err) {
      const name = err && typeof err === "object" ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Mikrofon-Zugriff verweigert. In den Browser-/Systemeinstellungen erlauben.",
        );
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setRecording(false);
    }
  }, [finishRecording, recording, sttBusy]);

  const toggleRecording = useCallback(() => {
    if (recording) stopRecording();
    else void startRecording();
  }, [recording, startRecording, stopRecording]);

  const wsRef = useRef(null);
  const listRef = useRef(null);
  /** Inner content wrapper — ResizeObserver keeps stick-to-bottom while streaming grows. */
  const messagesContentRef = useRef(null);
  const assistantBuf = useRef("");
  const thoughtBuf = useRef("");
  /**
   * Sticky bottom:
   * 1) While pinned → every update/size change scrolls to latest output.
   * 2) Scroll up (wheel / snack / keys) → unpin, stay put, show "Neue Ausgabe".
   * 3) Click "Neue Ausgabe" (or scroll back to end) → re-pin and follow again.
   */
  const stickToBottomRef = useRef(true);
  /** Ignore programmatic scrollTop writes so they don't flip pin state. */
  const programmaticScrollRef = useRef(false);
  const SCROLL_PIN_PX = 64;
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  const isNearBottom = useCallback((el) => {
    if (!el) return true;
    // No overflow → treat as bottom (nothing to fight over)
    if (el.scrollHeight <= el.clientHeight + 4) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_PIN_PX;
  }, []);

  const setPinned = useCallback((pinned) => {
    stickToBottomRef.current = pinned;
    setPinnedToBottom(pinned);
    if (pinned) setHasNewBelow(false);
  }, []);

  /** Jump viewport to end (used when pinned or force). */
  const jumpToEnd = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    // Clear flag after scroll events from this write have flushed
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, []);

  /**
   * @param {boolean | { force?: boolean }} [opts]
   * force=true: re-pin + follow (send / session open / "Neue Ausgabe").
   * otherwise: only scroll if currently pinned; else flag "Neue Ausgabe".
   */
  const scrollToBottom = useCallback(
    (opts = false) => {
      const force = opts === true || opts?.force === true;
      const run = () => {
        const el = listRef.current;
        if (!el) return;
        if (force) {
          setPinned(true);
          jumpToEnd();
          return;
        }
        if (!stickToBottomRef.current) {
          // Reading older content — leave viewport, offer jump
          if (!isNearBottom(el)) setHasNewBelow(true);
          return;
        }
        jumpToEnd();
      };
      // Double rAF: after React paint so scrollHeight includes new nodes
      requestAnimationFrame(() => {
        run();
        requestAnimationFrame(run);
      });
    },
    [isNearBottom, setPinned, jumpToEnd],
  );

  // Track pin from user scroll (SnackScrollbar also drives scrollTop)
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;

    const onScroll = () => {
      // Don't treat our own stick-scroll as "user left the bottom"
      if (programmaticScrollRef.current) return;
      const near = isNearBottom(el);
      if (near) {
        setPinned(true);
      } else {
        setPinned(false);
      }
    };

    // Wheel / touch / keys: unpin immediately on upward intent
    const onWheel = (e) => {
      if (e.deltaY < 0) setPinned(false);
    };
    const onKeyDown = (e) => {
      if (
        e.key === "PageUp" ||
        e.key === "Home" ||
        (e.key === "ArrowUp" && !e.altKey)
      ) {
        setPinned(false);
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("keydown", onKeyDown);
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("keydown", onKeyDown);
    };
  }, [isNearBottom, setPinned]);

  // While pinned: keep glued when content height grows (streaming markdown, tools)
  useEffect(() => {
    const el = listRef.current;
    const content = messagesContentRef.current;
    if (!el || !content) return undefined;

    const onGrow = () => {
      if (stickToBottomRef.current) {
        jumpToEnd();
      } else if (!isNearBottom(el)) {
        setHasNewBelow(true);
      }
    };

    const ro = new ResizeObserver(onGrow);
    ro.observe(content);
    return () => ro.disconnect();
  }, [isNearBottom, jumpToEnd]);

  const upsertStreaming = useCallback(
    (role, text, { replaceLast = false } = {}) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (replaceLast && last && last.role === role && last.streaming) {
          next[next.length - 1] = { ...last, text };
          return next;
        }
        next.push({
          id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role,
          text,
          streaming: true,
        });
        return next;
      });
      // Soft: only if still pinned to bottom
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const finalizeStreaming = useCallback(() => {
    streamingRef.current = false;
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
    assistantBuf.current = "";
    thoughtBuf.current = "";
  }, []);

  /**
   * Pop the next parked follow-up and send it once the agent is idle.
   * Safe to call multiple times; no-ops while a turn is still in flight.
   */
  const tryDrainQueue = useCallback(() => {
    if (drainingRef.current) return;
    if (busyRef.current || streamingRef.current) return;
    const next = queueRef.current[0];
    if (!next) return;
    if (!wsRef.current || wsRef.current.readyState !== 1) return;

    drainingRef.current = true;
    // Mark busy immediately so a second drain cannot double-send
    busyRef.current = true;
    queueRef.current = queueRef.current.slice(1);
    setQueue([...queueRef.current]);
    try {
      dispatchQueuedRef.current?.(next);
    } catch (err) {
      // Put the item back if dispatch exploded before send
      queueRef.current = [next, ...queueRef.current];
      setQueue([...queueRef.current]);
      busyRef.current = false;
      setBusy(false);
      console.error("[queue drain]", err);
    } finally {
      // Allow the next drain after this turn ends
      window.setTimeout(() => {
        drainingRef.current = false;
      }, 100);
    }
  }, []);

  const scheduleDrainQueue = useCallback(() => {
    if (drainTimerRef.current) {
      window.clearTimeout(drainTimerRef.current);
    }
    // Short delay so status/turn_done state settles and server busy clears
    drainTimerRef.current = window.setTimeout(() => {
      drainTimerRef.current = null;
      tryDrainQueue();
    }, 80);
  }, [tryDrainQueue]);

  useEffect(() => {
    let closed = false;
    let retryTimer;
    let ws;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setError("");
      };
      ws.onclose = () => {
        setConnected(false);
        busyRef.current = false;
        setBusy(false);
        setReconnecting(false);
        if (!closed) {
          retryTimer = setTimeout(connect, 1500);
        }
      };
      ws.onerror = () => setError("WebSocket-Verbindung fehlgeschlagen");

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }

        if (msg.type === "status") {
          setConnected(Boolean(msg.connected));
          const nextBusy = Boolean(msg.busy);
          const wasBusy = busyRef.current;
          busyRef.current = nextBusy;
          // Keep working UI sticky while a turn is in flight:
          // only clear busy when server says false (or on turn_done / error).
          setBusy(nextBusy);
          if (typeof msg.cancelling === "boolean") {
            setCancelling(msg.cancelling);
          }
          setReconnecting(Boolean(msg.reconnecting));
          setSessionId(msg.sessionId || null);
          if (msg.cwd) setCwd(msg.cwd);
          if (msg.connected) setError("");
          // "opened" reset is handled by onOpenSession with transcript;
          // only clear on plain Neue-Session reset.
          if (msg.reset && !msg.opened) {
            setMessages([]);
            assistantBuf.current = "";
            thoughtBuf.current = "";
            busyRef.current = false;
            setBusy(false);
            setCancelling(false);
            queueRef.current = [];
            setQueue([]);
            return;
          }
          // Server became idle without turn_done (or after it) → drain queue
          // Never drain while cancelling is still true (busy should stay true).
          if (wasBusy && !nextBusy && !msg.cancelling) {
            setCancelling(false);
            scheduleDrainQueue();
          }
          return;
        }

        if (msg.type === "assistant_chunk") {
          busyRef.current = true;
          streamingRef.current = true;
          setBusy(true);
          assistantBuf.current += msg.text || "";
          upsertStreaming("assistant", assistantBuf.current, {
            replaceLast: true,
          });
          return;
        }

        if (msg.type === "thought_chunk") {
          busyRef.current = true;
          streamingRef.current = true;
          setBusy(true);
          thoughtBuf.current += msg.text || "";
          upsertStreaming("thought", thoughtBuf.current, { replaceLast: true });
          return;
        }

        if (msg.type === "system") {
          setMessages((prev) => [
            ...prev,
            {
              id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: "system",
              text: msg.text || "",
              streaming: false,
            },
          ]);
          scrollToBottom();
          return;
        }

        if (msg.type === "tool") {
          busyRef.current = true;
          setBusy(true);
          setMessages((prev) => [
            ...prev,
            {
              id: `tool-${msg.toolCallId || Date.now()}`,
              role: "tool",
              text: `${msg.title}${msg.status ? ` · ${msg.status}` : ""}`,
              streaming: false,
            },
          ]);
          scrollToBottom();
          return;
        }

        if (msg.type === "turn_done") {
          finalizeStreaming();
          busyRef.current = false;
          setBusy(false);
          setCancelling(false);
          // Auto-send next parked follow-up only after the turn truly ended
          scheduleDrainQueue();
          return;
        }

        if (msg.type === "error") {
          setError(msg.message || "Unbekannter Fehler");
          finalizeStreaming();
          busyRef.current = false;
          setBusy(false);
          setCancelling(false);
          // Still drain so the queue does not stall after a failed turn
          scheduleDrainQueue();
        }
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      if (drainTimerRef.current) {
        window.clearTimeout(drainTimerRef.current);
        drainTimerRef.current = null;
      }
      ws?.close();
    };
  }, [finalizeStreaming, scheduleDrainQueue, scrollToBottom, upsertStreaming]);

  /** Send a prepared payload to the agent (live turn). */
  const dispatchPayload = useCallback(
    ({ text, action, displayText }) => {
      if (!wsRef.current || wsRef.current.readyState !== 1) return;

      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: "user",
          text: displayText,
          streaming: false,
        },
      ]);
      assistantBuf.current = "";
      thoughtBuf.current = "";
      setError("");
      busyRef.current = true;
      streamingRef.current = false;
      setBusy(true);
      setCancelling(false);
      // User just sent — pin and follow the new turn
      scrollToBottom({ force: true });

      if (action === "deep-search") {
        wsRef.current.send(JSON.stringify({ type: "deep_search", text }));
      } else if (action === "fork") {
        wsRef.current.send(JSON.stringify({ type: "fork", text }));
      } else {
        wsRef.current.send(JSON.stringify({ type: "chat", text }));
      }
    },
    [scrollToBottom],
  );

  const dispatchQueuedRef = useRef(dispatchPayload);
  dispatchQueuedRef.current = dispatchPayload;

  const buildDisplayText = useCallback((action, text) => {
    if (action === "deep-search") return `🔍 Deep Search: ${text}`;
    if (action === "fork") {
      return text ? `⑂ Fork: ${text}` : "⑂ Fork (Session branchen)";
    }
    return text;
  }, []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!connected || !wsRef.current) return;

    // Fork may run without a directive; chat & deep-search need text.
    if (sendAction !== "fork" && !text) return;

    const displayText = buildDisplayText(sendAction, text);
    const payload = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      action: sendAction,
      displayText,
    };

    // While Grok is working: park in queue (TUI-style wait area)
    if (busy || messages.some((m) => m.streaming)) {
      queueRef.current = [...queueRef.current, payload];
      setQueue([...queueRef.current]);
      setInput("");
      requestAnimationFrame(() => scrollToBottom());
      return;
    }

    setInput("");
    dispatchPayload(payload);
  }, [
    busy,
    connected,
    input,
    messages,
    scrollToBottom,
    sendAction,
    buildDisplayText,
    dispatchPayload,
  ]);

  const removeQueued = useCallback((id) => {
    queueRef.current = queueRef.current.filter((q) => q.id !== id);
    setQueue([...queueRef.current]);
  }, []);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    setQueue([]);
  }, []);

  /**
   * Soft-cancel the live turn via ACP session/cancel.
   * UI stays in "cancelling" until the server emits turn_done — never fake idle
   * while the agent is still working in the background.
   */
  const cancelTurn = useCallback(async () => {
    if (cancelling) return;
    // Allow stop while streaming even if busy flag lagged
    if (!busy && !streamingRef.current && !busyRef.current) return;

    setCancelling(true);
    setError("");
    // Keep working chrome until server confirms turn end
    busyRef.current = true;
    setBusy(true);
    // ACP: client SHOULD mark non-finished tools as cancelled when stopping
    setMessages((prev) =>
      prev.map((m) => {
        if (m.role !== "tool" || m.streaming) return m;
        const t = m.text || "";
        if (/·\s*(completed|failed|cancelled)\s*$/i.test(t)) return m;
        if (/·\s*(pending|in_progress|running)\s*$/i.test(t)) {
          return {
            ...m,
            text: t.replace(
              /·\s*(pending|in_progress|running)\s*$/i,
              "· cancelled",
            ),
          };
        }
        return m;
      }),
    );

    try {
      // Prefer HTTP so cancel is reliable even if WS message handler is blocked
      // on an in-flight chat await (server still accepts cancel in parallel).
      const res = await fetch("/api/bridge/cancel", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Abbruch fehlgeschlagen");
      }
      if (json.cancelled === false && json.reason === "not_busy") {
        // Server already idle — clean local stream state
        busyRef.current = false;
        setBusy(false);
        setCancelling(false);
        finalizeStreaming();
        scheduleDrainQueue();
        return;
      }
      // Stay in cancelling/busy until turn_done / status.busy=false.
      // Server sends system messages for deferred (critical tool) cancels.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Cancel request failed — do NOT pretend work stopped; leave busy if server still works
      setCancelling(false);
      // Fall back: try WS cancel once more without clearing busy
      try {
        if (wsRef.current?.readyState === 1) {
          wsRef.current.send(JSON.stringify({ type: "cancel" }));
          setCancelling(true);
        }
      } catch {
        /* ignore */
      }
    }
  }, [busy, cancelling, finalizeStreaming, scheduleDrainQueue]);

  const openWiki = useCallback(async () => {
    setError("");
    try {
      // Relative URL — works for localhost:5173 and :5174 Safari Web App
      const res = await fetch("/api/wiki/open", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(
          json.error ||
            `Wiki konnte nicht geöffnet werden (HTTP ${res.status})`,
        );
      }
      // Soft confirmation in sub line via temporary banner only on note
      if (json.note) {
        setError(""); // success with reveal fallback — no red error
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const openWorkspace = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/workspace/open", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(
          json.error ||
            `Workspace konnte nicht geöffnet werden (HTTP ${res.status})`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const reset = useCallback(() => {
    if (!wsRef.current || busy) return;
    wsRef.current.send(JSON.stringify({ type: "reset" }));
    setMessages([]);
    setError("");
    setBusy(false);
    queueRef.current = [];
    setQueue([]);
  }, [busy]);

  /**
   * Start local `grok agent` via bridge (HTTP — works even if agent is dead).
   * No terminal command needed. Status updates also arrive over WebSocket.
   */
  const reconnectGrok = useCallback(async () => {
    if (reconnecting) return;
    setReconnecting(true);
    setError("");
    try {
      const res = await fetch("/api/bridge/reconnect", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Grok konnte nicht gestartet werden");
      }
      if (json.connected) {
        setConnected(true);
        setSessionId(json.sessionId || null);
        setError("");
      } else {
        throw new Error(json.error || "Grok ist nach dem Start noch offline");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConnected(false);
    } finally {
      setReconnecting(false);
    }
  }, [reconnecting]);

  /**
   * Quit local `grok agent` (like TUI /quit). Bridge stays up; status → offline.
   */
  const disconnectGrok = useCallback(async () => {
    if (reconnecting || !connected) return;
    setReconnecting(true);
    setError("");
    try {
      const res = await fetch("/api/bridge/disconnect", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Grok konnte nicht beendet werden");
      }
      setConnected(false);
      setBusy(false);
      setSessionId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconnecting(false);
    }
  }, [connected, reconnecting]);

  /** Offline → connect; verbunden → /quit (offline). */
  const toggleGrokConnection = useCallback(() => {
    if (connected) return disconnectGrok();
    return reconnectGrok();
  }, [connected, disconnectGrok, reconnectGrok]);

  /**
   * After Overview confirm (Enter / double-click / Öffnen):
   * show disk transcript; adopt sessionId when live resume worked.
   */
  const handleOpenSession = useCallback((payload) => {
    const list = Array.isArray(payload?.messages) ? payload.messages : [];
    setMessages(
      list.map((m, i) => ({
        id: m.id || `hist-${i}`,
        role: m.role === "user" ? "user" : "assistant",
        text: m.text || "",
        streaming: false,
      })),
    );
    assistantBuf.current = "";
    thoughtBuf.current = "";
    if (payload?.sessionId) setSessionId(payload.sessionId);
    if (payload?.session?.cwd) setCwd(payload.session.cwd);
    if (payload?.liveError) {
      setError(payload.liveError);
    } else {
      setError("");
    }
    scrollToBottom({ force: true });
  }, [scrollToBottom]);

  const visibleMessages = messages;

  // Working UI: server busy OR any in-flight stream (thought / answer / tools)
  const isWorking = useMemo(
    () => busy || messages.some((m) => m.streaming),
    [busy, messages],
  );

  // Keep streaming mirror in sync (e.g. after history load / finalize)
  useEffect(() => {
    streamingRef.current = messages.some((m) => m.streaming);
  }, [messages]);

  // Safety net: if idle with parked items, drain (covers missed turn_done)
  useEffect(() => {
    if (!isWorking && queue.length > 0 && connected) {
      scheduleDrainQueue();
    }
  }, [isWorking, queue.length, connected, scheduleDrainQueue]);
  const workingSeconds = useWorkingSeconds(isWorking);

  const composerPlaceholder = useMemo(() => {
    if (!connected) return "Warte auf Grok-Verbindung…";
    if (cancelling) {
      return `Abbruch… ${workingSeconds}s — warte auf sicheres Turn-Ende`;
    }
    if (isWorking) {
      return `Grok arbeitet… ${workingSeconds}s — Enter → Warteschlange · Snack = Stopp`;
    }
    if (sendAction === "deep-search") {
      return "Deep Search Query… z. B. Compare Postgres 17 vs MySQL 9";
    }
    if (sendAction === "fork") {
      return "Optional: Directive für den Fork… (leer = nur Session branchen)";
    }
    return "Nachricht an Grok…";
  }, [connected, isWorking, cancelling, sendAction, workingSeconds]);

  // Keep Snack mounted briefly after work ends so ↵←Snack morph can play
  const [snackAlive, setSnackAlive] = useState(false);
  useEffect(() => {
    if (isWorking) {
      setSnackAlive(true);
      return undefined;
    }
    if (!snackAlive) return undefined;
    const t = setTimeout(() => setSnackAlive(false), 520);
    return () => clearTimeout(t);
  }, [isWorking, snackAlive]);

  return (
    <div className="app">
      <aside className="side-rail" aria-label="Hauptaktionen">
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => setShowOverview(true)}
          title="Suche & Sessions"
          aria-label="Suche und Sessions"
        >
          <IconSearch />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={reset}
          disabled={!connected || busy}
          title="Neuer Chat"
          aria-label="Neuer Chat"
        >
          <IconCompose />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => {
            setLegendTab("commands");
            setShowLegend(true);
          }}
          title="Befehle"
          aria-label="Befehle"
        >
          <IconCommands />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => setShowCalendar(true)}
          title="Aktivitäts-Kalender"
          aria-label="Kalender"
        >
          <IconCalendar />
        </button>
        <span className="side-rail-sep" aria-hidden="true" />
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => void openWiki()}
          title={
            wikiRoot
              ? `Wiki · Index (.md)\n${wikiRoot}`
              : "Wiki · Index (.md) öffnen"
          }
          aria-label="Wiki Index öffnen"
        >
          <IconWiki />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => void openWorkspace()}
          title={cwd ? `Workspace\n${cwd}` : "Workspace"}
          aria-label="Workspace"
        >
          <IconWorkspace />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={toggleTheme}
          title={theme === "dark" ? "Theme: Hell" : "Theme: Dunkel"}
          aria-label="Theme umschalten"
        >
          <IconTheme />
        </button>
        <button
          type="button"
          className="side-rail-btn"
          onClick={() => {
            // Cache-bust reload (ersetzt ⌘⇧R im Alltag)
            const url = new URL(window.location.href);
            url.searchParams.set("_r", String(Date.now()));
            window.location.replace(url.toString());
          }}
          title="UI neu laden (statt ⌘⇧R)"
          aria-label="Refresh"
        >
          <IconRefresh />
        </button>
        <span className="side-rail-spacer" aria-hidden="true" />
        <button
          type="button"
          className="side-rail-btn side-rail-btn--book"
          onClick={() => {
            setLegendTab("handbook");
            setShowLegend(true);
          }}
          title="Kurzhandbuch"
          aria-label="Kurzhandbuch öffnen"
        >
          <IconBook />
        </button>
      </aside>

      <div className="app-main">
        <header className="top">
          <div>
            <h1>Grok Build Terminal</h1>
            <p className="sub">
              Grok Build · ACP · {cwd || "…"}
              {sessionId ? ` · ${sessionId.slice(0, 8)}…` : ""}
            </p>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className={`pill pill-btn ${
                reconnecting ? "pending" : connected ? "ok" : "bad"
              }`}
              disabled={reconnecting}
              title={
                reconnecting
                  ? connected
                    ? "Grok-Agent wird beendet…"
                    : "Grok-Agent wird gestartet…"
                  : connected
                    ? "Grok läuft — klicken zum Beenden (/quit)"
                    : "Grok offline — klicken zum Verbinden"
              }
              onClick={() => void toggleGrokConnection()}
            >
              {reconnecting
                ? connected
                  ? "trennt…"
                  : "verbindet…"
                : connected
                  ? "verbunden"
                  : "offline"}
            </button>
          </div>
        </header>

        {error ? <div className="banner">{error}</div> : null}

        <div className="messages-shell">
          <main
            className="messages messages--borderless messages--snack-scroll"
            ref={listRef}
            tabIndex={-1}
          >
            <div className="messages-content" ref={messagesContentRef}>
              {visibleMessages.length === 0 ? (
                <div className="empty">
                  Schreib eine Nachricht — Grok Build Terminal läuft lokal über ACP.
                  <br />
                  <span className="empty-soft">
                    Sessions: <strong>Lupe</strong> · Wiki &amp; Workspace links
                  </span>
                </div>
              ) : (
                visibleMessages.map((m) => (
                  <article key={m.id} className={`msg msg-${m.role}`}>
                    <div className="role role-row">
                      <span>
                        {m.role === "user"
                          ? "Du"
                          : m.role === "assistant"
                            ? "Grok"
                            : m.role === "thought"
                              ? "Thinking"
                              : m.role === "system"
                                ? "System"
                                : "Tool"}
                        {m.streaming ? " …" : ""}
                      </span>
                      {m.role === "assistant" && !m.streaming && m.text?.trim() ? (
                        <button
                          type="button"
                          className={`msg-speak-btn${
                            speakingId === m.id ? " is-speaking" : ""
                          }${ttsBusyId === m.id ? " is-busy" : ""}`}
                          title={
                            speakingId === m.id
                              ? "Vorlesen stoppen"
                              : ttsBusyId === m.id
                                ? "Erzeuge Sprache…"
                                : voiceAvailable
                                  ? "Mit Grok TTS vorlesen"
                                  : voiceHint || "TTS: XAI_API_KEY setzen"
                          }
                          aria-label={
                            speakingId === m.id
                              ? "Vorlesen stoppen"
                              : "Antwort vorlesen"
                          }
                          disabled={Boolean(ttsBusyId && ttsBusyId !== m.id)}
                          onClick={() => void speakText(m.id, m.text)}
                        >
                          {speakingId === m.id ? (
                            <IconSpeakerOff size={14} />
                          ) : (
                            <IconSpeaker size={14} />
                          )}
                        </button>
                      ) : null}
                    </div>
                    <MarkdownBody text={m.text} />
                  </article>
                ))
              )}
            </div>
          </main>
          <SnackScrollbar
            scrollRef={listRef}
            deps={[visibleMessages.length, isWorking]}
          />
          {/* Unpinned + new chunks below → jump re-enables sticky follow */}
          {!pinnedToBottom && hasNewBelow ? (
            <button
              type="button"
              className="jump-latest"
              onClick={() => scrollToBottom({ force: true })}
              title="Zum aktuellen Stand — Chat klebt wieder an neuen Ausgaben"
            >
              Neue Ausgabe ↓
            </button>
          ) : null}
        </div>

        <footer className="composer composer--grok">
          {queue.length > 0 ? (
            <div className="msg-queue" role="list" aria-label="Warteschlange">
              <div className="msg-queue-head">
                <span className="msg-queue-title">
                  WARTE
                  <span className="msg-queue-pixels" aria-hidden="true">
                    <span className="msg-queue-pixel" />
                    <span className="msg-queue-pixel" />
                    <span className="msg-queue-pixel" />
                  </span>
                  <span className="msg-queue-count" aria-label={`${queue.length} in Warteschlange`}>
                    {queue.length}
                  </span>
                </span>
                <button
                  type="button"
                  className="msg-queue-clear"
                  onClick={clearQueue}
                  title="Warteschlange leeren"
                >
                  Leeren
                </button>
              </div>
              <ol className="msg-queue-list">
                {queue.map((q, i) => (
                  <li key={q.id} className="msg-queue-item" role="listitem">
                    <span className="msg-queue-idx">{i + 1}</span>
                    <span className="msg-queue-text" title={q.displayText}>
                      {q.displayText}
                    </span>
                    <button
                      type="button"
                      className="msg-queue-remove"
                      onClick={() => removeQueued(q.id)}
                      title="Aus Warteschlange entfernen"
                      aria-label="Entfernen"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="composer-box">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={composerPlaceholder}
              rows={3}
              disabled={!connected}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="composer-toolbar">
              <div className="composer-tools">
                <div
                  className="action-picker"
                  role="radiogroup"
                  aria-label="Aktion"
                >
                  {[
                    {
                      id: "chat",
                      label: "Chat",
                      title: "Normale Nachricht an Grok",
                    },
                    {
                      id: "deep-search",
                      label: "Deep Search",
                      title:
                        "TUI /deep-research — Hintergrund-Recherche mit Quellen",
                    },
                    {
                      id: "fork",
                      label: "Fork",
                      title:
                        "Session branchen (TUI /fork). Text = optionale Directive",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={sendAction === opt.id}
                      className={`action-picker-btn${
                        sendAction === opt.id ? " action-picker-btn--active" : ""
                      }`}
                      title={opt.title}
                      disabled={!connected}
                      onClick={() => setSendAction(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="voice-controls" aria-label="Sprache">
                  <button
                    type="button"
                    className={`voice-mic-btn${recording ? " is-recording" : ""}${
                      sttBusy ? " is-busy" : ""
                    }`}
                    title={
                      recording
                        ? "Aufnahme stoppen (Grok STT)"
                        : sttBusy
                          ? "Transkript wird erstellt…"
                          : voiceAvailable
                            ? "Diktieren mit Grok STT"
                            : voiceHint || "STT: XAI_API_KEY setzen"
                    }
                    aria-label={recording ? "Aufnahme stoppen" : "Diktieren"}
                    aria-pressed={recording}
                    disabled={sttBusy}
                    onClick={toggleRecording}
                  >
                    <IconMic size={18} />
                    <span className="voice-mic-label">
                      {recording ? "Stop" : sttBusy ? "…" : "Mic"}
                    </span>
                  </button>
                  <label className="voice-select-wrap" title="TTS-Stimme">
                    <span className="sr-only">Stimme</span>
                    <select
                      className="voice-select"
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      disabled={Boolean(ttsBusyId) || Boolean(speakingId)}
                      aria-label="TTS-Stimme"
                    >
                      {voiceList.map((v) => {
                        const id = v.voice_id || v.id || v.name;
                        const label = v.name || id;
                        return (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              </div>
              <button
                type="button"
                className={`send${isWorking ? " send--working" : " send--idle"}${
                  snackAlive && !isWorking ? " send--morph-out" : ""
                }`}
                onClick={() => {
                  // While working: text → queue; empty → stop (Snack)
                  if (isWorking) {
                    if (input.trim() || sendAction === "fork") {
                      send();
                      return;
                    }
                    if (!cancelling) void cancelTurn();
                    return;
                  }
                  send();
                }}
                disabled={
                  !connected ||
                  cancelling ||
                  (sendAction !== "fork" && !input.trim() && !isWorking)
                }
                title={
                  isWorking
                    ? input.trim()
                      ? "In Warteschlange (Enter)"
                      : cancelling
                        ? "Bricht ab…"
                        : "Stopp: Snack / leerer Klick — Abbrechen"
                    : sendAction === "deep-search"
                      ? "Deep Search starten (Enter)"
                      : sendAction === "fork"
                        ? "Session forken (Enter)"
                        : "Senden (Enter)"
                }
                aria-label={
                  isWorking
                    ? input.trim()
                      ? "In Warteschlange"
                      : "Antwort stoppen"
                    : sendAction === "deep-search"
                      ? "Deep Search starten"
                      : sendAction === "fork"
                        ? "Fork starten"
                        : "Senden"
                }
                aria-live={isWorking ? "polite" : undefined}
              >
                <span className="send-face send-face--enter" aria-hidden="true">
                  <span className="send-icon">↵</span>
                </span>
                <span className="send-face send-face--snack" aria-hidden="true">
                  {(isWorking || snackAlive) && (
                    <span className="send-snack">
                      <SnackBoard
                        running={isWorking || snackAlive}
                        onStopClick={() => {
                          if (!cancelling) void cancelTurn();
                        }}
                      />
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>
        </footer>
      </div>

      <CommandLegend
        open={showLegend}
        onClose={() => setShowLegend(false)}
        initialTab={legendTab}
      />
      <CommandOverview
        open={showOverview}
        onClose={() => setShowOverview(false)}
        onOpenSession={handleOpenSession}
      />
      <ActivityCalendar
        open={showCalendar}
        onClose={() => setShowCalendar(false)}
        onOpenSession={handleOpenSession}
      />
    </div>
  );
}
