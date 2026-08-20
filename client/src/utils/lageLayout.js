/**
 * Graph layout: Glyph stays the tablet. Grok / Agent / Code flow into it.
 * Vaults and Roots never enter the hub.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */

export const LAGE_W = 1200;
export const LAGE_H = 780;
export const LAGE_CX = 600;
export const LAGE_CY = 390;
export const RING_HEAD = 208;
export const RING_BIND = 358;
export const RING_PULL = 52;
export const FRAME_PAD = 80;
/** Tighter crop on the phone so the constellation, not the pad, fills the canvas. */
export const PHONE_PAD = 48;
export const HEAD_IDS = ["grok", "agent", "code"];

/** Compact (phone): Grok high, Agent/Code slightly below Glyph — tall triangle. */
const COMPACT_HEAD = {
  grok: { dx: 0, dy: -300 },
  agent: { dx: -158, dy: 88 },
  code: { dx: 158, dy: 88 },
};

/** Camera around the constellation. Phone uses this as SVG viewBox so the graph fills the field. */
export function graphFrame(nodes, pad = FRAME_PAD) {
  if (!nodes?.length) return { x: 0, y: 0, w: LAGE_W, h: LAGE_H };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const x = Number(n?.x);
    const y = Number(n?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: LAGE_W, h: LAGE_H };
  const p = Number.isFinite(pad) ? pad : FRAME_PAD;
  return {
    x: minX - p,
    y: minY - p,
    w: Math.max(1, maxX - minX + p * 2),
    h: Math.max(1, maxY - minY + p * 2),
  };
}

export function homeHeadOf(kind) {
  return kind === "workspace" ? "code" : "agent";
}

export function headMode(item, head, homeHead) {
  const home = homeHead || homeHeadOf(item?.kind);
  const heads = item?.heads;
  if (heads && typeof heads === "object" && Object.prototype.hasOwnProperty.call(heads, head)) {
    const m = String(heads[head] || "unbound");
    return m === "r+w" ? "rw" : m;
  }
  if (head === home) return item?.mode || "r";
  if (head === "grok") {
    return (item?.mode || "r") === "private" ? "private" : "rw";
  }
  return "unbound";
}

export function bindsOf(item, kind) {
  const home = homeHeadOf(kind);
  const out = {};
  for (const h of HEAD_IDS) out[h] = headMode(item, h, home);
  if (item && item.enabled === false) {
    for (const h of HEAD_IDS) out[h] = "unbound";
  }
  return out;
}

export function displayBind(binds) {
  const modes = HEAD_IDS.map((h) => binds?.[h]).filter(
    (m) => m && m !== "unbound",
  );
  const hasRead = modes.some((m) => m === "r");
  const hasWrite = modes.some((m) => m === "rw");
  const hasPrivate = modes.some((m) => m === "private");
  const unbound = modes.length === 0;
  return {
    unbound,
    hasRead,
    hasWrite,
    hasPrivate,
    stepDim: unbound || (hasPrivate && !hasRead && !hasWrite),
  };
}

export function ringOf(node) {
  return Math.hypot((node?.x || 0) - LAGE_CX, (node?.y || 0) - LAGE_CY);
}

function onRing(r, deg) {
  const a = (deg * Math.PI) / 180;
  return {
    x: Math.round(LAGE_CX + r * Math.cos(a)),
    y: Math.round(LAGE_CY + r * Math.sin(a)),
  };
}

function compactHeadPoint(id) {
  const p = COMPACT_HEAD[id] || COMPACT_HEAD.grok;
  return { x: LAGE_CX + p.dx, y: LAGE_CY + p.dy };
}

/** Tafeln on a ring around Glyph. Left/right of the horizontal midline. */
export function wallSlots(n, side, pull = false, compact = false) {
  if (n <= 0) return [];
  if (compact) {
    // Column under the side heads so the crop stays tall (phone can scale up).
    const inset = pull ? 168 : 175;
    const x = LAGE_CX + (side === "left" ? -inset : inset);
    const yStart = LAGE_CY + COMPACT_HEAD.agent.dy + 72;
    const gap = 48;
    const span = n <= 1 ? 0 : Math.min(192, gap * (n - 1));
    return Array.from({ length: n }, (_, i) => ({
      x: Math.round(x),
      y: Math.round(n === 1 ? yStart : yStart + (span * i) / Math.max(1, n - 1)),
    }));
  }
  const r0 = RING_BIND;
  const r = r0 - (pull ? RING_PULL : 0);
  const step = 22;
  const maxSpan = side === "left" ? 110 : 86;
  const span = n === 1 ? 0 : Math.min(maxSpan, step * (n - 1));
  const mid = side === "left" ? 180 : 0;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const deg =
      side === "left" ? mid + span / 2 - t * span : mid - span / 2 + t * span;
    return onRing(r, deg);
  });
}

/** Rotate a wall tablet so it sits tangent on the ring (text stays upright). */
export function wallStickDeg(x, y) {
  const dx = (x || 0) - LAGE_CX;
  const dy = (y || 0) - LAGE_CY;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  deg *= 0.72;
  if (deg > 42) deg = 42;
  if (deg < -42) deg = -42;
  return Math.round(deg * 10) / 10;
}

export function centerIdFor(focus) {
  if (focus === "grok") return "grok";
  if (focus === "agent") return "agent";
  if (focus === "code") return "code";
  return "hub";
}

function isFolderId(id) {
  const s = String(id || "");
  return s.startsWith("vault:") || s.startsWith("ws:");
}

function nodeBoundTo(node, focus) {
  if (!node?.binds) return false;
  const m = node.binds[focus];
  return Boolean(m && m !== "unbound");
}

/** Who is in the selected head's talk/reach. Vaults/roots never become Glyph. */
export function reaches(focus, nodeId, nodes) {
  if (!focus || focus === "all") return false;
  if (nodeId === "hub" || nodeId === focus) return true;
  const n = (nodes || []).find((x) => x.id === nodeId);
  if (n?.binds) return nodeBoundTo(n, focus);
  if (focus === "agent") return String(nodeId).startsWith("vault:");
  if (focus === "code") {
    return String(nodeId).startsWith("ws:") || nodeId === "agent";
  }
  if (focus === "grok") {
    return nodeId === "agent" || nodeId === "code";
  }
  return false;
}

/** Which tails stay when a head sits in the center. */
export function keepsTalk(focus, from, to, nodes) {
  if (!focus || focus === "all") return true;
  const ids = [from, to];
  const folderId = ids.find(isFolderId);
  if (folderId) {
    const n = (nodes || []).find((x) => x.id === folderId);
    if (n?.binds) return nodeBoundTo(n, focus);
    if (focus === "agent") return String(folderId).startsWith("vault:");
    if (focus === "code") return String(folderId).startsWith("ws:");
    return false;
  }
  if (focus === "agent") return false;
  if (focus === "code") {
    return ids.includes("hub") && ids.includes("agent");
  }
  return true;
}

function baseNodes({
  vaults,
  workspaces,
  pullVault = false,
  pullWs = false,
  compact = false,
}) {
  const grok = {
    id: "grok",
    kind: "profile",
    label: "Grok Build",
    cluster: "grok",
    face: "grok",
    ...(compact ? compactHeadPoint("grok") : onRing(RING_HEAD, -90)),
  };
  const agent = {
    id: "agent",
    kind: "profile",
    label: "°_Agent",
    cluster: "agent",
    face: "agent",
    ...(compact ? compactHeadPoint("agent") : onRing(RING_HEAD, 180)),
  };
  const code = {
    id: "code",
    kind: "profile",
    label: "^_Code",
    cluster: "code",
    face: "code",
    ...(compact ? compactHeadPoint("code") : onRing(RING_HEAD, 0)),
  };
  const hub = {
    id: "hub",
    kind: "hub",
    label: "Glyph",
    cluster: "all",
    x: LAGE_CX,
    y: LAGE_CY,
  };
  const nodes = [hub, grok, agent, code];
  const edges = [
    {
      from: "hub",
      to: "grok",
      via: "profile",
      weight: 1.4,
      stones: stoneCount(hub, grok),
    },
    {
      from: "hub",
      to: "agent",
      via: "profile",
      weight: 1.4,
      stones: stoneCount(hub, agent),
    },
    {
      from: "hub",
      to: "code",
      via: "profile",
      weight: 1.4,
      stones: stoneCount(hub, code),
    },
  ];

  const byHead = { grok, agent, code };

  function addFolder(src, kind, pt) {
    const binds = bindsOf(src, kind);
    const node = {
      id: kind === "vault" ? `vault:${src.id}` : `ws:${src.id}`,
      kind,
      cluster: homeHeadOf(kind),
      label: src.name || src.id,
      ref: src.id,
      binds,
      primary: Boolean(src.primary),
      ...pt,
    };
    nodes.push(node);
    for (const h of HEAD_IDS) {
      const m = binds[h];
      if (!m || m === "unbound") continue;
      edges.push({
        from: h,
        to: node.id,
        via: "bind",
        mode: m,
        weight: m === "rw" ? 0.95 : 0.8,
        stones: stoneCount(byHead[h], node),
      });
    }
  }

  wallSlots(vaults.length, "left", pullVault, compact).forEach((pt, i) => {
    addFolder(vaults[i], "vault", pt);
  });

  wallSlots(workspaces.length, "right", pullWs, compact).forEach((pt, i) => {
    addFolder(workspaces[i], "workspace", pt);
  });

  return { nodes, edges };
}

/**
 * @param {{
 *   vaults?: Array<{id: string}>,
 *   workspaces?: Array<{id: string}>,
 *   focus?: string,
 * }} input
 */
export function layoutLage({
  vaults = [],
  workspaces = [],
  focus = "all",
  compact = false,
} = {}) {
  const pullVault =
    focus !== "all" &&
    vaults.some((v) => bindsOf(v, "vault")[focus] !== "unbound");
  const pullWs =
    focus !== "all" &&
    workspaces.some((w) => bindsOf(w, "workspace")[focus] !== "unbound");
  const { nodes, edges } = baseNodes({
    vaults,
    workspaces,
    pullVault,
    pullWs,
    compact,
  });
  const absorb = focus === "all" ? null : centerIdFor(focus);
  const mapped = absorb ? nodes.filter((n) => n.id !== absorb) : nodes;
  const remap = (id) => (id === absorb ? "hub" : id);
  const mappedEdges = edges
    .map((e) => ({ ...e, from: remap(e.from), to: remap(e.to) }))
    .filter((e) => e.from !== e.to)
    .filter((e) => keepsTalk(focus, e.from, e.to, mapped));
  return { nodes: mapped, edges: mappedEdges, centerId: "hub", absorb };
}

function stoneCount(a, b) {
  const len = Math.hypot((b?.x || 0) - (a?.x || 0), (b?.y || 0) - (a?.y || 0));
  return Math.max(8, Math.min(22, Math.round(len / 18)));
}

export function adjacentIds(edges, id) {
  const out = [];
  for (const e of edges || []) {
    if (e.from === id) out.push(e.to);
    else if (e.to === id) out.push(e.from);
  }
  return out;
}

export function clusterOf(nodeId) {
  if (nodeId === "hub") return "all";
  if (String(nodeId).startsWith("vault:") || nodeId === "agent") return "agent";
  if (String(nodeId).startsWith("ws:") || nodeId === "code") return "code";
  if (nodeId === "grok") return "grok";
  return "all";
}

export function lerpGraph(from, to, t) {
  const byFrom = new Map((from?.nodes || []).map((n) => [n.id, n]));
  const absorbed = to.absorb;
  if (absorbed && from?.nodes) {
    const leaving = from.nodes.find((n) => n.id === absorbed);
    if (leaving) byFrom.set("hub", leaving);
  }
  const emerging = from?.absorb;
  const hubFrom = byFrom.get("hub");
  return {
    ...to,
    nodes: (to.nodes || []).map((n) => {
      let a = byFrom.get(n.id);
      if (!a && emerging && n.id === emerging && hubFrom) a = hubFrom;
      if (!a) return n;
      return {
        ...n,
        x: a.x + (n.x - a.x) * t,
        y: a.y + (n.y - a.y) * t,
      };
    }),
  };
}
