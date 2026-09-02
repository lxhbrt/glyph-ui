/**
 * Snack heads: gold/brown stone, dark ink face — soft-pixel painterly Raupe 🐛.
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
 * Drawn INSIDE the top of the 24×24 stone (not negative-y) so overflow:hidden
 * parents / viewBox clip cannot hide them. Theme via .graph-antennae currentColor.
 * mood: "up" | "droop" | "wink" (asymmetric)
 */
function Antennae({ mood = "up" }) {
  // Antennae use dedicated class (not graph-ink) so theme can flip light↔dark
  const Stem = (props) => (
    <Dab className="graph-antenna-stem" rx={0.75} bleed={0.22} {...props} />
  );
  const Tip = (props) => (
    <Dab className="graph-antenna-tip" rx={0.9} bleed={0.28} {...props} />
  );
  if (mood === "droop") {
    return (
      <g className="graph-antennae" aria-hidden="true">
        <Stem x="4.0" y="0.55" width="1.55" height="3.1" />
        <Tip x="2.7" y="0.2" width="2.55" height="1.85" />
        <Stem x="18.45" y="0.55" width="1.55" height="3.1" />
        <Tip x="18.75" y="0.2" width="2.55" height="1.85" />
      </g>
    );
  }
  if (mood === "wink") {
    return (
      <g className="graph-antennae" aria-hidden="true">
        {/* Left droops with the wink */}
        <Stem x="3.85" y="0.85" width="1.5" height="2.7" />
        <Tip x="2.55" y="0.45" width="2.4" height="1.7" />
        {/* Right perks */}
        <Stem x="18.5" y="0.15" width="1.55" height="3.5" />
        <Tip x="17.7" y="-0.15" width="2.7" height="1.95" />
      </g>
    );
  }
  // Boss / default — upright soft stubs, clearly above the eyes
  return (
    <g className="graph-antennae" aria-hidden="true">
      <Stem x="4.85" y="0.2" width="1.6" height="3.35" />
      <Tip x="4.15" y="-0.15" width="2.7" height="1.95" />
      <Stem x="17.55" y="0.2" width="1.6" height="3.35" />
      <Tip x="17.0" y="-0.15" width="2.7" height="1.95" />
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
      viewBox={`0 -1.25 ${S} ${S + 1.25}`}
      aria-hidden="true"
      overflow="visible"
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
 * Boss Raupe — sunglasses OK (CEO), sideways smirk, blush, upright antennae.
 * Still clearly caterpillar head (antennae + stone), not snake.
 */
function GrokFace({ size }) {
  return (
    <Stone size={size} face="grok">
      <Antennae mood="up" />
      {/* Sunglasses — opaque soft shades + bridge */}
      <Ink x="1.55" y="6.15" width="9.1" height="6.0" rx="1.45" />
      <InkWash x="1.9" y="6.45" w="8.4" h="5.3" opacity={0.5} />
      <Ink x="13.35" y="6.15" width="9.1" height="6.0" rx="1.45" />
      <InkWash x="13.7" y="6.45" w="8.4" h="5.3" opacity={0.5} />
      <Ink x="9.35" y="7.55" width="5.3" height="2.15" rx="0.75" bleed={0.25} />
      {/* Lens glints (not pupils through the shades) */}
      <g className="graph-pupils">
        <Sparkle x="3.9" y="7.55" w="1.35" h="1.2" />
        <Sparkle x="15.7" y="7.55" w="1.35" h="1.2" />
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
  // Idle: head + 3 body stones (CEO: „3ten Stein an den Kopf“). One couple of
  // feet under each body seg — not duplicated per side.
  return (
    <span className="send-caterpillar send-snake">
      <span className="send-caterpillar-head send-snake-head">
        <CaterpillarHead size={size} face={face} />
      </span>
      <span className="send-segs send-tail" aria-hidden="true">
        <span className="send-seg send-seg--a send-tail-stone send-tail-stone--a">
          <span className="send-feet" aria-hidden="true">
            <i />
            <i />
          </span>
        </span>
        <span className="send-seg send-seg--b send-tail-stone send-tail-stone--b">
          <span className="send-feet" aria-hidden="true">
            <i />
            <i />
          </span>
        </span>
        <span className="send-seg send-seg--c send-tail-stone send-tail-stone--c">
          <span className="send-feet" aria-hidden="true">
            <i />
            <i />
          </span>
        </span>
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
