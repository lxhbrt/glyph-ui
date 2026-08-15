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

/** Boss — sunglasses, no brow, sideways smirk. */
function GrokFace({ size }) {
  return (
    <Stone size={size} face="grok">
      <Ink x="1.4" y="6.2" width="9.2" height="7.2" />
      <Ink x="13.4" y="6.2" width="9.2" height="7.2" />
      <Ink x="10.2" y="8.2" width="3.6" height="2.2" />
      <rect x="3.2" y="7.8" width="2.6" height="1.8" fill="currentColor" />
      <rect x="15.2" y="7.8" width="2.6" height="1.8" fill="currentColor" />
      <Ink x="11.4" y="19.8" width="10.4" height="2.2" />
      <Ink x="19.6" y="17.6" width="2.6" height="3.4" />
    </Stone>
  );
}

/** Arbeiter — two uneven tired eyes, still on the job. */
function AgentFace({ size }) {
  return (
    <Stone size={size} face="agent">
      <Ink x="1.6" y="6.2" width="8" height="8.4" />
      <Ink x="14.2" y="7.6" width="6.4" height="5.4" />
      <rect x="3.4" y="8.2" width="2.4" height="2.4" fill="currentColor" />
      <rect x="16" y="8.8" width="1.8" height="1.8" fill="currentColor" />
      <Ink x="5" y="19.4" width="12" height="1.6" />
    </Stone>
  );
}

/** Hacker — wink, one wide eye, toothy grin. */
function CodeFace({ size }) {
  return (
    <Stone size={size} face="code">
      <Ink x="2" y="7.4" width="6.4" height="1.6" />
      <Ink x="12.4" y="6.2" width="9.4" height="8.6" />
      <rect x="14.2" y="8" width="2.4" height="2.4" fill="currentColor" />
      <Ink x="4.4" y="20" width="15.2" height="2.4" />
      <rect x="8.4" y="20" width="1.6" height="2.4" fill="currentColor" />
      <rect x="13.2" y="20" width="1.6" height="2.4" fill="currentColor" />
    </Stone>
  );
}

export function SnakeHead({ size = 28, face = "grok" }) {
  if (face === "agent") return <AgentFace size={size} />;
  if (face === "code") return <CodeFace size={size} />;
  return <GrokFace size={size} />;
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
