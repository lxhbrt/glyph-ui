/**
 * Egyptian marks — scarab, Wedjat, sesh palette, cartouche, eggs.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

function Svg({ size, w = 16, h = 16, className, children }) {
  return (
    <svg
      className={className}
      width={size}
      height={Math.round((size * h) / w)}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Khepri — carved gold amulet, rolling the sun. */
export function ScarabMark({
  size = 24,
  sun = true,
  className = "graph-face graph-face--scarab",
}) {
  return (
    <Svg size={size} w={64} h={72} className={className}>
      {sun ? (
        <g className="scarab-sun">
          <circle cx="32" cy="8.4" r="6" fill="currentColor" />
          <circle
            className="scarab-cut"
            cx="32"
            cy="8.4"
            r="3.3"
            fill="none"
            strokeWidth="1.5"
          />
        </g>
      ) : null}

      <path
        fill="currentColor"
        d="M23 21.2C16.2 18 12.2 13.2 13.2 7.4C11.2 9.6 10.4 14.2 14.2 18.8C11 16.2 7.4 13.6 5.2 12C6.8 16.8 12.4 21.4 21.6 23.8Z"
      />
      <path
        fill="currentColor"
        d="M41 21.2C47.8 18 51.8 13.2 50.8 7.4C52.8 9.6 53.6 14.2 49.8 18.8C53 16.2 56.6 13.6 58.8 12C57.2 16.8 51.6 21.4 42.4 23.8Z"
      />
      <path
        fill="currentColor"
        d="M20.2 33.6C12 32.2 6.2 32.6 3.4 34.8C5.2 37.4 11.2 36.8 18.6 36.2C10.4 38.4 6.2 41.2 4.6 44C8.4 41.2 14.2 38.8 21.2 37.2Z"
      />
      <path
        fill="currentColor"
        d="M43.8 33.6C52 32.2 57.8 32.6 60.6 34.8C58.8 37.4 52.8 36.8 45.4 36.2C53.6 38.4 57.8 41.2 59.4 44C55.6 41.2 49.8 38.8 42.8 37.2Z"
      />
      <path
        fill="currentColor"
        d="M22.2 47.4C14.4 51.6 9.2 57.6 8 64.2C12.2 61.2 17.4 55.4 23.8 50.6C16.4 57.2 13.2 63.4 12.4 68C16.8 63.6 21.4 56.6 25.2 51.2Z"
      />
      <path
        fill="currentColor"
        d="M41.8 47.4C49.6 51.6 54.8 57.6 56 64.2C51.8 61.2 46.6 55.4 40.2 50.6C47.6 57.2 50.8 63.4 51.6 68C47.2 63.6 42.6 56.6 38.8 51.2Z"
      />

      <path
        fill="currentColor"
        d="M32 26.4C44 26.4 49.2 35 49.2 44.2C49.2 54.6 42.4 65 32 65C21.6 65 14.8 54.6 14.8 44.2C14.8 35 20 26.4 32 26.4Z"
      />
      <path
        fill="currentColor"
        d="M20.6 20.2C20.6 16.4 25.4 14.6 32 14.6C38.6 14.6 43.4 16.4 43.4 20.2C43.4 24.4 38.6 27.6 32 27.6C25.4 27.6 20.6 24.4 20.6 20.2Z"
      />
      <path
        fill="currentColor"
        d="M26 16.4L24.2 11.2L28.4 12.6L32 9.4L35.6 12.6L39.8 11.2L38 16.4C38 18.6 35.4 20 32 20C28.6 20 26 18.6 26 16.4Z"
      />

      <path className="scarab-cut" d="M32 28.2V63.2" />
      <path className="scarab-cut" d="M19.6 31.6Q32 37.2 44.4 31.6" />
      <path className="scarab-cut" d="M26.6 36.2Q24.4 46 26.8 56.4" />
      <path className="scarab-cut" d="M37.4 36.2Q39.6 46 37.2 56.4" />
      <path className="scarab-cut" d="M23.2 21.4H40.8" />
    </Svg>
  );
}

/** Wedjat / Eye of Horus — lesen. */
export function WedjatMark({ size = 12, className = "vaults-mode-glyph" }) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M1.6 5.1C5.4 2.6 10.6 2.6 14.4 5.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M1.4 7.6C4.8 4.7 11.2 4.7 14.6 7.6C11.2 10.5 4.8 10.5 1.4 7.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="7.6" r="1.45" fill="currentColor" />
      <path
        d="M5.1 9.6L4 13.4C5.6 14.6 7.4 13.6 7.2 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Sesh — Schreiberpalette + Rohr. Schreiben. */
export function SeshMark({ size = 12, className = "vaults-mode-glyph" }) {
  return (
    <Svg size={size} className={className}>
      <rect
        x="1.4"
        y="2.4"
        width="9.2"
        height="11.4"
        rx="1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="4.2" cy="5.6" r="1.15" fill="currentColor" />
      <circle cx="7.8" cy="5.6" r="1.15" fill="currentColor" />
      <path
        d="M6 8.2V12.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M12.2 2.6L14.2 13.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Schloss — kein Durchgang / privat. */
export function SchlossMark({ size = 12, className = "vaults-mode-glyph" }) {
  return (
    <Svg size={size} className={className}>
      <rect
        x="3.2"
        y="7.2"
        width="9.6"
        height="7.4"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5.4 7.2V5.4C5.4 3.6 6.6 2.3 8 2.3C9.4 2.3 10.6 3.6 10.6 5.4V7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="10.6" r="1.05" fill="currentColor" />
    </Svg>
  );
}

/** Tyet — Isis-Knoten. Schutz / privat. */
export function TyetMark({ size = 12, className = "vaults-mode-glyph" }) {
  return (
    <Svg size={size} className={className}>
      <circle
        cx="8"
        cy="3.7"
        r="2.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M8 6V14.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M8 7.1C4.3 7.1 3.1 10.4 3.4 13.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M8 7.1C11.7 7.1 12.9 10.4 12.6 13.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Kartusche — Name enclosure. Used as Glyph tablet and folder field. */
export function CartoucheMark({ size = 12, className = "vaults-mode-glyph" }) {
  return (
    <Svg size={size} className={className}>
      <rect
        x="3.1"
        y="1.4"
        width="9.8"
        height="11.4"
        rx="4.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path
        d="M3.4 14.4H12.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function Egg({ cx, cy, rx, ry }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="currentColor" />
      <ellipse
        cx={cx - rx * 0.22}
        cy={cy - ry * 0.28}
        rx={rx * 0.28}
        ry={ry * 0.2}
        fill="var(--bg)"
        opacity="0.38"
      />
    </g>
  );
}

/** Dung-beetle eggs — folder (3), root (2), file (1). */
export function EggClutch({
  size = 16,
  count = 3,
  className = "graph-face graph-face--eggs",
}) {
  const n = count < 2 ? 1 : count > 3 ? 3 : count;
  return (
    <Svg size={size} className={className}>
      {n === 1 ? <Egg cx={8} cy={8.2} rx={4.1} ry={5.6} /> : null}
      {n === 2 ? (
        <>
          <Egg cx={5.3} cy={9.1} rx={3.5} ry={4.8} />
          <Egg cx={10.7} cy={7.2} rx={3.2} ry={4.4} />
        </>
      ) : null}
      {n === 3 ? (
        <>
          <Egg cx={4.8} cy={10.1} rx={3.4} ry={4.6} />
          <Egg cx={11.2} cy={9.8} rx={3.2} ry={4.4} />
          <Egg cx={8.1} cy={5.4} rx={2.8} ry={3.7} />
        </>
      ) : null}
    </Svg>
  );
}

/** Quiet engraved ticks on a ring — stamp, not a node. */
export function StampRings({ cx = 600, cy = 390, rings = [128, 228, 348] }) {
  const ticks = [];
  for (const r of rings) {
    const n = r < 160 ? 28 : r < 280 ? 40 : 56;
    for (let i = 0; i < n; i += 1) {
      if (i % 5 === 2) continue;
      const a = (i / n) * Math.PI * 2;
      const inner = r - (i % 3 === 0 ? 5 : 2.4);
      const outer = r + (i % 7 === 0 ? 3.2 : 1.4);
      ticks.push(
        <line
          key={`${r}-${i}`}
          className="lage-stamp-tick"
          x1={cx + Math.cos(a) * inner}
          y1={cy + Math.sin(a) * inner}
          x2={cx + Math.cos(a) * outer}
          y2={cy + Math.sin(a) * outer}
        />,
      );
    }
  }
  return (
    <g className="lage-stamp" aria-hidden="true">
      {rings.map((r) => (
        <circle key={r} className="lage-stamp-ring" cx={cx} cy={cy} r={r} />
      ))}
      {ticks}
    </g>
  );
}

/** Ordner — klares Tafel-Icon, kein Hieroglyphen-Stapel. */
export function FolderMark({ size = 16, className = "lage-folder" }) {
  return (
    <Svg size={size} w={16} h={16} className={className}>
      <path
        fill="currentColor"
        d="M1.4 4.1h4.1l1.3 1.5h7.8v8.8H1.4Z"
      />
      <path
        fill="currentColor"
        opacity="0.55"
        d="M1.4 6.4h13.2v8H1.4Z"
      />
    </Svg>
  );
}

/** Stele. Rail icon-glyph-mark: signs + outline in currentColor, no plate fill. */
export function TabletMark({ size = 16, className = "graph-face graph-face--tablet" }) {
  return (
    <Svg size={size} w={24} h={24} className={className}>
      <path
        className="tablet-plate"
        d="M1.4 5Q1.4 1 12 1Q22.6 1 22.6 5V23H1.4Z"
      />
      <rect className="tablet-sign" x="3.2" y="8.6" width="17.6" height="0.8" />
      <rect className="tablet-sign" x="3.2" y="14.6" width="17.6" height="0.8" />
      <rect className="tablet-sign" x="3.4" y="2.8" width="1.6" height="4.8" />
      <rect className="tablet-sign" x="5.8" y="4.2" width="3.2" height="1.5" />
      <rect className="tablet-sign" x="9.8" y="2.8" width="1.4" height="4.8" />
      <rect className="tablet-sign" x="9.2" y="4.4" width="2.6" height="1" />
      <rect className="tablet-sign" x="12.2" y="3" width="1" height="4.4" />
      <rect className="tablet-sign" x="13.6" y="3" width="1" height="4.4" />
      <rect className="tablet-sign" x="15" y="3" width="1" height="4.4" />
      <rect className="tablet-sign" x="16.8" y="3.2" width="3.4" height="1" />
      <rect className="tablet-sign" x="16.8" y="4.8" width="3.4" height="1" />
      <rect className="tablet-sign" x="16.8" y="6.4" width="3.4" height="1" />
      <rect className="tablet-sign" x="3.4" y="10.2" width="3.6" height="1.5" />
      <rect className="tablet-sign" x="8" y="10" width="3" height="3" />
      <rect className="tablet-sign" x="8.9" y="13" width="1.2" height="1.2" />
      <rect className="tablet-sign" x="12.2" y="10" width="1.5" height="4" />
      <rect className="tablet-sign" x="15.4" y="10.2" width="3.8" height="1" />
      <rect className="tablet-sign" x="15.4" y="11.8" width="3.8" height="1" />
      <rect className="tablet-sign" x="15.4" y="13.4" width="3.8" height="1" />
      <rect className="tablet-sign" x="3.4" y="16.2" width="3.6" height="1.4" />
      <rect className="tablet-sign" x="3.4" y="18.4" width="3.6" height="1.4" />
      <rect className="tablet-sign" x="8" y="16.2" width="1.5" height="5.2" />
      <rect className="tablet-sign" x="11" y="16.2" width="9.2" height="5.4" />
      <rect className="tablet-plate" x="12.2" y="17.2" width="6.8" height="3.4" />
      <rect className="tablet-sign" x="13.2" y="17.8" width="2" height="2.2" />
      <rect className="tablet-sign" x="16" y="18.2" width="2.2" height="1.6" />
    </Svg>
  );
}

export function GlyphMark({ size = 20, className = "icon-glyph-mark" }) {
  return <TabletMark size={size} className={className} />;
}

/** Circular Glyph medal — coin, not a photo, not a square chip. */
export function GlyphMedal({ size = 30, className = "graph-face graph-face--medal" }) {
  return (
    <Svg size={size} w={24} h={24} className={className}>
      <circle className="glyph-medal-fill" cx="12" cy="12" r="11.2" />
      <circle className="glyph-medal-ring" cx="12" cy="12" r="11.2" />
      <circle className="glyph-medal-ring" cx="12" cy="12" r="9.4" />
      <rect className="tablet-sign" x="7" y="7.2" width="10" height="0.7" />
      <rect className="tablet-sign" x="7" y="11.6" width="10" height="0.7" />
      <rect className="tablet-sign" x="7.2" y="8.4" width="1.4" height="2.4" />
      <rect className="tablet-sign" x="9.4" y="8.8" width="2.4" height="1.2" />
      <rect className="tablet-sign" x="12.4" y="8.4" width="1.2" height="2.4" />
      <rect className="tablet-sign" x="14.4" y="8.6" width="2.4" height="0.8" />
      <rect className="tablet-sign" x="7.2" y="12.8" width="2.6" height="1.2" />
      <rect className="tablet-sign" x="10.6" y="12.8" width="2.2" height="2.2" />
      <rect className="tablet-sign" x="13.6" y="12.8" width="3.2" height="0.8" />
      <rect className="tablet-sign" x="13.6" y="14.2" width="3.2" height="0.8" />
    </Svg>
  );
}


