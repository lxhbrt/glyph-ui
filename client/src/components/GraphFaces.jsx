/**
 * Snack heads: gold stone, dark ink face.
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

function Stone({ size, face, children }) {
  return (
    <svg
      className={`graph-face graph-face--${face}`}
      width={size}
      height={size}
      viewBox={`0 0 ${S} ${S}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect width={S} height={S} fill="currentColor" />
      {children}
    </svg>
  );
}

function Ink(props) {
  return <rect className="graph-ink" {...props} />;
}

/** Boss — sunglasses, no brow, sideways smirk. Highlights glance; glasses don't blink. */
function GrokFace({ size }) {
  return (
    <Stone size={size} face="grok">
      <Ink x="1.2" y="5.8" width="9.6" height="7.8" />
      <Ink x="13.2" y="5.8" width="9.6" height="7.8" />
      <Ink x="10" y="8" width="4" height="2.4" />
      <g className="graph-pupils">
        <rect x="3" y="7.6" width="2.8" height="2" fill="currentColor" />
        <rect x="15" y="7.6" width="2.8" height="2" fill="currentColor" />
      </g>
      <Ink x="11" y="19.4" width="11" height="2.6" />
      <Ink x="19.4" y="17.2" width="2.8" height="3.8" />
    </Stone>
  );
}

/** Arbeiter — two uneven tired eyes, still on the job. */
function AgentFace({ size }) {
  return (
    <Stone size={size} face="agent">
      <g className="graph-lids">
        <Ink x="1.4" y="5.8" width="8.4" height="9" />
        <Ink x="14" y="7.2" width="6.8" height="6" />
        <g className="graph-pupils">
          <rect x="3.2" y="8" width="2.6" height="2.6" fill="currentColor" />
          <rect x="15.8" y="8.6" width="2" height="2" fill="currentColor" />
        </g>
      </g>
      <Ink x="4.6" y="19" width="12.8" height="2" />
    </Stone>
  );
}

/** Hacker — wink, one wide eye, toothy grin. Wink stays; open eye blinks. */
function CodeFace({ size }) {
  return (
    <Stone size={size} face="code">
      <Ink x="1.8" y="7" width="6.8" height="2" />
      <g className="graph-lids">
        <Ink x="12.2" y="5.8" width="9.8" height="9.2" />
        <g className="graph-pupils">
          <rect x="14" y="7.8" width="2.6" height="2.6" fill="currentColor" />
        </g>
      </g>
      <Ink x="4" y="19.6" width="16" height="2.8" />
      <rect x="8.2" y="19.6" width="1.8" height="2.8" fill="currentColor" />
      <rect x="13" y="19.6" width="1.8" height="2.8" fill="currentColor" />
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
