/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

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

/** Simple plus — attach / add in composer */
function IconPlus({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
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

function IconCopy({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCheck({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
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

export {
  IconSearch,
  IconCompose,
  IconCommands,
  IconBook,
  IconCalendar,
  IconFolder,
  IconWiki,
  IconWorkspace,
  IconTheme,
  IconMic,
  IconPlus,
  IconSpeaker,
  IconSpeakerOff,
  IconCopy,
  IconCheck,
  IconRefresh,
  IconStop,
};
