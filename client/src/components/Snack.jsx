/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useCallback, useEffect, useRef, useState } from "react";

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
 * Snack while Grok works: chases a coral STOP target on a dark arena.
 * Gold snake (accent family) stays visible in light + dark theme.
 * Board is square so it fills the round send/stop control cleanly.
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
    // Round send button → square board that fits the circle
    const avail = Math.max(28, Math.floor(Math.min(rect.width, rect.height)));

    const cols = 4;
    const rows = 4; // square grid matches circular clip
    let cell = Math.floor(avail / cols);
    // Floor matches side scrollbar / WARTE stones (SNACK_CELL)
    cell = Math.max(SNACK_CELL, cell);
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

    /** Coral stop disc — round target, matches circular send/stop control */
    const drawStop = (x, y) => {
      const pad = Math.max(1, Math.floor(cell * 0.12));
      const s = cell - pad * 2;
      const cx = x * cell + pad + s / 2;
      const cy = y * cell + pad + s / 2;
      const r = s / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = palette.stop;
      ctx.fill();
      const inn = Math.max(1.5, s * 0.22);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r - inn), 0, Math.PI * 2);
      ctx.fillStyle = palette.stopInner;
      ctx.fill();
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
        // Hit stop disc in-game — just relocate; real stop is click
        s.snake = next.slice(0, maxLen);
        s.food = placeFood(s.snake);
      } else {
        s.snake = next.slice(0, -1);
      }
      draw();
    };

    // Any click on the snack board while working = stop (red disc is the cue)
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
      title="Roter Punkt = Stopp (klicken)"
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


export { SNACK_CELL, SNACK_GAP, SNACK_PIXEL, SNACK_STEP, SnackBoard, SnackScrollbar };
