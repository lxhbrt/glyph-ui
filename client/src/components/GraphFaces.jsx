/**
 * Snack heads: gold stone, dark ink face — soft-pixel painterly.
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

function Stone({ size, face, children }) {
  return (
    <svg
      className={`graph-face graph-face--${face} graph-face--soft`}
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

/** Boss — sunglasses, no brow, sideways smirk. Highlights glance; glasses don't blink. */
function GrokFace({ size }) {
  return (
    <Stone size={size} face="grok">
      {/* Soft lenses */}
      <Ink x="1.1" y="5.6" width="9.8" height="8.1" rx="1.15" />
      <InkWash x="1.4" y="5.9" w="9.2" h="7.4" />
      <Ink x="13.1" y="5.6" width="9.8" height="8.1" rx="1.15" />
      <InkWash x="13.4" y="5.9" w="9.2" h="7.4" />
      {/* Bridge */}
      <Ink x="9.7" y="7.9" width="4.6" height="2.7" rx="0.7" bleed={0.25} />
      <g className="graph-pupils">
        {/* Glints that glance */}
        <Sparkle x="3.05" y="7.55" w="2.6" h="1.85" />
        <Sparkle x="15.05" y="7.55" w="2.6" h="1.85" />
      </g>
      {/* Sideways smirk */}
      <Ink x="10.6" y="19.1" width="11.2" height="2.85" rx="1.05" />
      <InkWash x="18.8" y="16.9" w="3.2" h="4.1" rx="0.9" opacity={0.5} />
      <Ink x="19.2" y="17.0" width="2.95" height="4.0" rx="0.85" bleed={0.3} />
    </Stone>
  );
}

/** Arbeiter — two uneven tired eyes, still on the job. */
function AgentFace({ size }) {
  return (
    <Stone size={size} face="agent">
      <g className="graph-lids">
        {/* Left eye — heavier / droopier */}
        <Ink x="1.2" y="5.6" width="8.7" height="9.2" rx="1.25" />
        <InkWash x="1.5" y="5.9" w="8.1" h="8.5" opacity={0.42} />
        {/* Right eye — smaller, higher */}
        <Ink x="13.8" y="7.0" width="7.1" height="6.3" rx="1.15" />
        <InkWash x="14.1" y="7.3" w="6.5" h="5.6" opacity={0.4} />
        <g className="graph-pupils">
          <rect
            className="graph-pupil-core"
            x="3.15"
            y="8.0"
            width="2.7"
            height="2.7"
            rx="0.7"
            ry="0.7"
            fill="currentColor"
          />
          <Sparkle x="3.55" y="8.25" w="1.05" h="1.05" />
          <rect
            className="graph-pupil-core"
            x="15.7"
            y="8.55"
            width="2.15"
            height="2.15"
            rx="0.6"
            ry="0.6"
            fill="currentColor"
          />
          <Sparkle x="16.0" y="8.75" w="0.9" h="0.9" />
        </g>
      </g>
      {/* Tired flat mouth */}
      <Ink x="4.4" y="18.85" width="13.2" height="2.25" rx="0.95" />
      <InkWash x="5.0" y="19.0" w="11.8" h="1.8" opacity={0.35} />
    </Stone>
  );
}

/** Hacker — wink, one wide eye, toothy grin. Wink stays; open eye blinks. */
function CodeFace({ size }) {
  return (
    <Stone size={size} face="code">
      {/* Wink — soft dash */}
      <Ink x="1.6" y="6.85" width="7.1" height="2.35" rx="1.0" bleed={0.35} />
      <InkWash x="1.9" y="7.0" w="6.5" h="1.9" opacity={0.4} />
      <g className="graph-lids">
        <Ink x="12.0" y="5.55" width="10.0" height="9.4" rx="1.3" />
        <InkWash x="12.35" y="5.9" w="9.3" h="8.6" opacity={0.42} />
        <g className="graph-pupils">
          <rect
            className="graph-pupil-core"
            x="13.95"
            y="7.75"
            width="2.75"
            height="2.75"
            rx="0.7"
            ry="0.7"
            fill="currentColor"
          />
          <Sparkle x="14.4" y="8.05" w="1.15" h="1.15" />
        </g>
      </g>
      {/* Toothy grin — soft bar + gold “gaps” */}
      <Ink x="3.8" y="19.35" width="16.4" height="3.0" rx="1.05" />
      <InkWash x="4.3" y="19.5" w="15.2" h="2.5" opacity={0.35} />
      <rect
        className="graph-tooth-gap"
        x="8.0"
        y="19.45"
        width="2.0"
        height="2.7"
        rx="0.45"
        ry="0.45"
        fill="currentColor"
      />
      <rect
        className="graph-tooth-gap"
        x="12.85"
        y="19.45"
        width="2.0"
        height="2.7"
        rx="0.45"
        ry="0.45"
        fill="currentColor"
      />
    </Stone>
  );
}

export function SnakeHead({ size = 28, face = "grok" }) {
  if (face === "agent") return <AgentFace size={size} />;
  if (face === "code") return <CodeFace size={size} />;
  return <GrokFace size={size} />;
}

/** Idle send button: Graph face + short snack-stone tail. Graph itself stays head-only. */
export function SendSnake({ size = 28, face = "grok" }) {
  return (
    <span className="send-snake">
      <span className="send-snake-head">
        <SnakeHead size={size} face={face} />
      </span>
      <span className="send-tail" aria-hidden="true">
        <span className="send-tail-stone send-tail-stone--a" />
        <span className="send-tail-stone send-tail-stone--b" />
        <span className="send-tail-stone send-tail-stone--c" />
      </span>
    </span>
  );
}

/** Idle: coin. Absorb: the arriving head. */
export function GlyphVessel({ face = null, size = 36 }) {
  if (face) return <SnakeHead size={size} face={face} />;
  return <GlyphMedal size={size} />;
}

export function VaultStele({ size = 16 }) {
  return <TabletPhoto size={size} />;
}

export function RootStone({ size = 16 }) {
  return <TabletPhoto size={size} />;
}
