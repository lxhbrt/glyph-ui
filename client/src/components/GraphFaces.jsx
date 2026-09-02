/**
 * Snack heads: gold stone, dark ink face — soft-pixel painterly Raupe 🐛.
 * Coarse grid, each cell a soft brush dab (watercolor/marker bleed),
 * not hard flat pixels. Organic texture within squares.
 * Grok = Boss · Agent = Arbeiter · Code = Hacker
 * Glyph = dark medal. Vaults / roots are CSS dots in the graph.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { FolderMark, GlyphMedal } from "./EgyptMarks.jsx";

export function TabletPhoto({ size = 16 }) {
  return <FolderMark size={size} />;
}

const S = 24;

/** Soft brush dab — rounded cell with slight bleed past the logical square. */
function Dab({
  x,
  y,
  w,
  h,
  width,
  height,
  rx = 0.55,
  className,
  fill,
  opacity,
  bleed = 0.18,
}) {
  const ww = w ?? width;
  const hh = h ?? height;
  const bx = Number(x) - bleed * 0.35;
  const by = Number(y) - bleed * 0.4;
  const bw = Number(ww) + bleed;
  const bh = Number(hh) + bleed * 0.9;
  return (
    <rect
      className={className}
      x={bx}
      y={by}
      width={bw}
      height={bh}
      rx={rx}
      ry={rx}
      fill={fill}
      opacity={opacity}
    />
  );
}

function Ink(props) {
  return <Dab className="graph-ink" {...props} />;
}

/** Second translucent pass for watercolor density / imperfect coverage. */
function InkWash({ x, y, w, h, rx = 0.7, opacity = 0.38, bleed = 0.45 }) {
  return (
    <Dab
      className="graph-ink"
      x={x}
      y={y}
      w={w}
      h={h}
      rx={rx}
      opacity={opacity}
      bleed={bleed}
    />
  );
}

function Sparkle({ x, y, w = 1.1, h = 1.1 }) {
  return (
    <rect
      className="graph-sparkle"
      x={x}
      y={y}
      width={w}
      height={h}
      rx={0.45}
      ry="0.45"
    />
  );
}

/**
 * Soft caterpillar antennae — the Raupe tell (not snake).
 * mood: "up" | "droop" | "wink" (asymmetric)
 */
function Antennae({ mood = "up" }) {
  if (mood === "droop") {
    return (
      <g className="graph-antennae" aria-hidden="true">
        <Ink x="4.2" y="0.15" width="1.35" height="2.6" rx="0.65" bleed={0.2} />
        <Ink x="3.1" y="-0.15" width="2.2" height="1.55" rx="0.75" bleed={0.25} />
        <Ink x="18.4" y="0.15" width="1.35" height="2.6" rx="0.65" bleed={0.2} />
        <Ink x="18.6" y="-0.15" width="2.2" height="1.55" rx="0.75" bleed={0.25} />
      </g>
    );
  }
  if (mood === "wink") {
    return (
      <g className="graph-antennae" aria-hidden="true">
        {/* Left droops with the wink */}
        <Ink x="4.0" y="0.35" width="1.3" height="2.4" rx="0.65" bleed={0.2} />
        <Ink x="2.9" y="0.05" width="2.0" height="1.45" rx="0.7" bleed={0.25} />
        {/* Right perks */}
        <Ink x="18.5" y="-0.55" width="1.35" height="3.1" rx="0.65" bleed={0.2} />
        <Ink x="17.85" y="-0.85" width="2.35" height="1.7" rx="0.8" bleed={0.25} />
      </g>
    );
  }
  // Boss / default — upright soft stubs
  return (
    <g className="graph-antennae" aria-hidden="true">
      <Ink x="5.1" y="-0.55" width="1.4" height="3.0" rx="0.7" bleed={0.2} />
      <Ink x="4.55" y="-0.85" width="2.35" height="1.7" rx="0.85" bleed={0.25} />
      <Ink x="17.5" y="-0.55" width="1.4" height="3.0" rx="0.7" bleed={0.2} />
      <Ink x="17.05" y="-0.85" width="2.35" height="1.7" rx="0.85" bleed={0.25} />
    </g>
  );
}

/** Soft cheek blush — cuteness without a second brand hue (ink wash only). */
function Blush() {
  return (
    <g className="graph-blush" aria-hidden="true">
      <InkWash x="1.2" y="14.2" w="3.4" h="2.0" rx={1.0} opacity={0.16} bleed={0.5} />
      <InkWash x="19.4" y="14.2" w="3.4" h="2.0" rx={1.0} opacity={0.16} bleed={0.5} />
    </g>
  );
}

function Stone({ size, face, children }) {
  return (
    <svg
      className={`graph-face graph-face--${face} graph-face--soft graph-face--raupe`}
      width={size}
      height={size}
      viewBox={`0 0 ${S} ${S}`}
      aria-hidden="true"
    >
      {/* Layered soft stone — imperfect square coverage, slight bleed.
          Texture via overlapping translucent washes (no feTurbulence — graph may
          host many heads; keep it cheap). */}
      <rect
        className="graph-stone-base"
        x="0.35"
        y="0.4"
        width="23.3"
        height="23.2"
        rx="1.35"
        ry="1.35"
        fill="currentColor"
      />
      <rect
        className="graph-stone-wash"
        x="0.9"
        y="0.85"
        width="22.1"
        height="21.9"
        rx="1.1"
        ry="1.1"
        fill="currentColor"
        opacity="0.55"
      />
      <rect
        className="graph-stone-wash graph-stone-wash--edge"
        x="0.15"
        y="0.2"
        width="23.7"
        height="23.6"
        rx="1.55"
        ry="1.55"
        fill="currentColor"
        opacity="0.22"
      />
      {children}
    </svg>
  );
}

/**
 * Boss Raupe — soft confident lids (not heavy snake sunglasses),
 * sideways smirk, upright antennae. Cool without fighting cuteness.
 */
function GrokFace({ size }) {
  return (
    <Stone size={size} face="grok">
      <Antennae mood="up" />
      {/* Soft half-lids — cool, not opaque shades */}
      <Ink x="2.0" y="6.4" width="8.4" height="5.6" rx="1.35" />
      <InkWash x="2.3" y="6.7" w="7.8" h="4.9" opacity={0.4} />
      <Ink x="13.6" y="6.4" width="8.4" height="5.6" rx="1.35" />
      <InkWash x="13.9" y="6.7" w="7.8" h="4.9" opacity={0.4} />
      {/* Soft brow bridge */}
      <Ink x="9.6" y="7.5" width="4.8" height="1.8" rx="0.7" bleed={0.25} />
      <g className="graph-pupils">
        <rect
          className="graph-pupil-core"
          x="4.15"
          y="8.35"
          width="2.45"
          height="2.45"
          rx="0.7"
          ry="0.7"
          fill="currentColor"
        />
        <Sparkle x="4.55" y="8.55" w="1.05" h="1.05" />
        <rect
          className="graph-pupil-core"
          x="15.75"
          y="8.35"
          width="2.45"
          height="2.45"
          rx="0.7"
          ry="0.7"
          fill="currentColor"
        />
        <Sparkle x="16.15" y="8.55" w="1.05" h="1.05" />
      </g>
      <Blush />
      {/* Sideways smirk */}
      <Ink x="10.4" y="18.7" width="10.6" height="2.55" rx="1.05" />
      <InkWash x="18.2" y="16.7" w="3.0" h="3.8" rx={0.9} opacity={0.45} />
      <Ink x="18.55" y="16.85" width="2.7" height="3.6" rx="0.85" bleed={0.3} />
    </Stone>
  );
}

/** Arbeiter Raupe — uneven tired eyes, droopy antennae, still on the job. */
function AgentFace({ size }) {
  return (
    <Stone size={size} face="agent">
      <Antennae mood="droop" />
      <g className="graph-lids">
        {/* Left eye — heavier / droopier */}
        <Ink x="1.4" y="6.2" width="8.4" height="8.4" rx="1.35" />
        <InkWash x="1.7" y="6.5" w="7.8" h="7.6" opacity={0.42} />
        {/* Right eye — smaller, higher */}
        <Ink x="13.9" y="7.4" width="6.9" height="5.9" rx="1.2" />
        <InkWash x="14.2" y="7.7" w="6.3" h="5.2" opacity={0.4} />
        <g className="graph-pupils">
          <rect
            className="graph-pupil-core"
            x="3.25"
            y="8.55"
            width="2.55"
            height="2.55"
            rx="0.7"
            ry="0.7"
            fill="currentColor"
          />
          <Sparkle x="3.6" y="8.8" w="1.0" h="1.0" />
          <rect
            className="graph-pupil-core"
            x="15.7"
            y="8.95"
            width="2.05"
            height="2.05"
            rx="0.6"
            ry="0.6"
            fill="currentColor"
          />
          <Sparkle x="16.0" y="9.15" w="0.85" h="0.85" />
        </g>
      </g>
      <Blush />
      {/* Tired flat mouth */}
      <Ink x="4.6" y="18.95" width="12.8" height="2.15" rx="0.95" />
      <InkWash x="5.2" y="19.1" w="11.4" h="1.7" opacity={0.35} />
    </Stone>
  );
}

/** Hacker Raupe — wink, one wide eye, toothy grin, asymmetric antennae. */
function CodeFace({ size }) {
  return (
    <Stone size={size} face="code">
      <Antennae mood="wink" />
      {/* Wink — soft dash */}
      <Ink x="1.8" y="7.15" width="7.0" height="2.25" rx="1.0" bleed={0.35} />
      <InkWash x="2.1" y="7.3" w="6.4" h="1.8" opacity={0.4} />
      <g className="graph-lids">
        <Ink x="12.1" y="5.85" width="9.7" height="8.9" rx="1.35" />
        <InkWash x="12.45" y="6.2" w="9.0" h="8.1" opacity={0.42} />
        <g className="graph-pupils">
          <rect
            className="graph-pupil-core"
            x="14.0"
            y="8.0"
            width="2.65"
            height="2.65"
            rx="0.7"
            ry="0.7"
            fill="currentColor"
          />
          <Sparkle x="14.4" y="8.3" w="1.1" h="1.1" />
        </g>
      </g>
      <Blush />
      {/* Toothy grin — soft bar + gold “gaps” */}
      <Ink x="3.9" y="19.35" width="16.2" height="2.9" rx="1.05" />
      <InkWash x="4.4" y="19.5" w="15.0" h="2.4" opacity={0.35} />
      <rect
        className="graph-tooth-gap"
        x="8.05"
        y="19.45"
        width="1.95"
        height="2.6"
        rx="0.45"
        ry="0.45"
        fill="currentColor"
      />
      <rect
        className="graph-tooth-gap"
        x="12.9"
        y="19.45"
        width="1.95"
        height="2.6"
        rx="0.45"
        ry="0.45"
        fill="currentColor"
      />
    </Stone>
  );
}

/** Caterpillar head (Raupe) — primary name. */
export function CaterpillarHead({ size = 28, face = "grok" }) {
  if (face === "agent") return <AgentFace size={size} />;
  if (face === "code") return <CodeFace size={size} />;
  return <GrokFace size={size} />;
}

/** @deprecated Alias — call sites / graph still import SnakeHead. */
export function SnakeHead(props) {
  return <CaterpillarHead {...props} />;
}

/**
 * Idle send button: Raupe head + soft body segments.
 * Graph itself stays head-only.
 */
export function SendCaterpillar({ size = 28, face = "grok" }) {
  // Head + 2 body stones = 3 total (aligned with busy 3–4, not 4–5)
  return (
    <span className="send-caterpillar send-snake">
      <span className="send-caterpillar-head send-snake-head">
        <CaterpillarHead size={size} face={face} />
      </span>
      <span className="send-segs send-tail" aria-hidden="true">
        <span className="send-seg send-seg--a send-tail-stone send-tail-stone--a" />
        <span className="send-seg send-seg--b send-tail-stone send-tail-stone--b" />
      </span>
    </span>
  );
}

/** @deprecated Alias — App still imports SendSnake. */
export function SendSnake(props) {
  return <SendCaterpillar {...props} />;
}

/** Idle: coin. Absorb: the arriving head. */
export function GlyphVessel({ face = null, size = 36 }) {
  if (face) return <CaterpillarHead size={size} face={face} />;
  return <GlyphMedal size={size} />;
}

export function VaultStele({ size = 16 }) {
  return <TabletPhoto size={size} />;
}

export function RootStone({ size = 16 }) {
  return <TabletPhoto size={size} />;
}
