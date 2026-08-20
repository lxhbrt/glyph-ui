/**
 * Unit tests: Graph layout.
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cablePath, hairlinePath } from "../../client/src/utils/cables.js";
import {
  adjacentIds,
  bindsOf,
  clusterOf,
  displayBind,
  FRAME_PAD,
  graphFrame,
  layoutLage,
  LAGE_H,
  LAGE_W,
  reaches,
  ringOf,
  wallStickDeg,
} from "../../client/src/utils/lageLayout.js";

describe("layoutLage", () => {
  it("places Glyph + three profiles, no API plugs", () => {
    const { nodes, edges } = layoutLage({});
    const ids = nodes.map((n) => n.id);
    for (const id of ["hub", "grok", "agent", "code"]) {
      assert.ok(ids.includes(id), id);
    }
    assert.ok(!ids.includes("plug-direct"));
    assert.ok(edges.some((e) => e.from === "hub" && e.to === "grok"));
    assert.equal(nodes.find((n) => n.id === "grok").label, "Grok Build");
  });

  it("slides grok into Glyph; grok-bound folders pull in", () => {
    const args = {
      vaults: [
        { id: "hseq-sync", name: "HSEQ Sync" },
        { id: "peniel", name: "Peniel" },
      ],
      workspaces: [{ id: "glyph-ui", name: "glyph-ui" }],
    };
    const all = layoutLage({ ...args, focus: "all" });
    const grok = layoutLage({ ...args, focus: "grok" });
    assert.ok(!grok.nodes.some((n) => n.id === "grok"));
    assert.equal(grok.absorb, "grok");
    const vAll = all.nodes.find((n) => n.id === "vault:peniel");
    const vGrok = grok.nodes.find((n) => n.id === "vault:peniel");
    assert.ok(ringOf(vGrok) < ringOf(vAll));
    const ws = grok.nodes.find((n) => n.id === "ws:glyph-ui");
    assert.ok(ws);
    for (const n of grok.nodes) {
      assert.ok(n.x >= 80 && n.x <= LAGE_W - 80, n.id);
      assert.ok(n.y >= 60 && n.y <= LAGE_H - 60, n.id);
    }
  });

  it("puts Grok above, Agent left, Code right; tablets on the walls", () => {
    const { nodes } = layoutLage({
      vaults: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
      workspaces: [
        { id: "x", name: "X" },
        { id: "y", name: "Y" },
      ],
    });
    const hub = nodes.find((n) => n.id === "hub");
    const grok = nodes.find((n) => n.id === "grok");
    const agent = nodes.find((n) => n.id === "agent");
    const code = nodes.find((n) => n.id === "code");
    assert.ok(grok.y < hub.y);
    assert.ok(agent.x < hub.x);
    assert.ok(code.x > hub.x);
    const vs = nodes.filter((n) => n.kind === "vault");
    const ws = nodes.filter((n) => n.kind === "workspace");
    for (const n of vs) assert.ok(n.x < hub.x, n.id);
    for (const n of ws) assert.ok(n.x > hub.x, n.id);
    const r0 = ringOf(vs[0]);
    for (const n of [...vs, ...ws]) {
      assert.ok(Math.abs(ringOf(n) - r0) < 3, n.id);
      assert.ok(ringOf(n) > ringOf(agent), n.id);
    }
  });

  it("pulls agent food closer when Agent is focused", () => {
    const args = {
      vaults: [{ id: "peniel", name: "Peniel" }],
      workspaces: [{ id: "glyph-ui", name: "glyph-ui" }],
    };
    const all = layoutLage({ ...args, focus: "all" });
    const agent = layoutLage({ ...args, focus: "agent" });
    const vAll = all.nodes.find((n) => n.id === "vault:peniel");
    const vAg = agent.nodes.find((n) => n.id === "vault:peniel");
    assert.ok(ringOf(vAg) < ringOf(vAll));
    const wAll = all.nodes.find((n) => n.id === "ws:glyph-ui");
    const wAg = agent.nodes.find((n) => n.id === "ws:glyph-ui");
    assert.equal(wAg.x, wAll.x);
    assert.equal(wAg.y, wAll.y);
  });

  it("clusterOf and reaches", () => {
    assert.equal(clusterOf("vault:x"), "agent");
    assert.equal(clusterOf("ws:y"), "code");
    assert.equal(clusterOf("grok"), "grok");
    assert.equal(clusterOf("hub"), "all");
    assert.equal(reaches("agent", "vault:hseq"), true);
    assert.equal(reaches("agent", "code"), false);
    assert.equal(reaches("code", "ws:ui"), true);
    assert.equal(reaches("code", "agent"), true);
    assert.equal(reaches("grok", "agent"), true);
  });

  it("draws a bind edge per head, none when unbound", () => {
    const { edges, nodes } = layoutLage({
      vaults: [
        {
          id: "peniel",
          name: "Peniel",
          mode: "r",
          heads: { grok: "r", agent: "private", code: "unbound" },
        },
        {
          id: "loose",
          name: "Loose",
          mode: "r",
          heads: { grok: "unbound", agent: "unbound", code: "unbound" },
        },
      ],
    });
    const peniel = nodes.find((n) => n.id === "vault:peniel");
    assert.equal(peniel.binds.grok, "r");
    assert.equal(peniel.binds.agent, "private");
    assert.ok(edges.some((e) => e.to === "vault:peniel" && e.from === "grok" && e.mode === "r"));
    assert.ok(
      edges.some((e) => e.to === "vault:peniel" && e.from === "agent" && e.mode === "private"),
    );
    assert.ok(!edges.some((e) => e.to === "vault:peniel" && e.from === "code"));
    assert.ok(!edges.some((e) => e.to === "vault:loose" || e.from === "vault:loose"));
  });

  it("keeps grok-bound folders when Grok is focused", () => {
    const args = {
      vaults: [
        {
          id: "peniel",
          name: "Peniel",
          heads: { grok: "r", agent: "r", code: "unbound" },
        },
      ],
    };
    const grok = layoutLage({ ...args, focus: "grok" });
    assert.ok(grok.edges.some((e) => e.to === "vault:peniel" || e.from === "vault:peniel"));
    const agent = layoutLage({
      vaults: [
        {
          id: "only-code",
          name: "Only",
          heads: { grok: "unbound", agent: "unbound", code: "r" },
        },
      ],
      focus: "agent",
    });
    assert.ok(
      !agent.edges.some((e) => e.to === "vault:only-code" || e.from === "vault:only-code"),
    );
  });

  it("graphFrame is the full field when empty", () => {
    const f = graphFrame([]);
    assert.equal(f.x, 0);
    assert.equal(f.y, 0);
    assert.equal(f.w, LAGE_W);
    assert.equal(f.h, LAGE_H);
  });

  it("graphFrame crops to nodes plus pad — compact constellation is smaller than the field", () => {
    const { nodes } = layoutLage({ compact: true });
    const f = graphFrame(nodes);
    assert.ok(f.w < LAGE_W, `${f.w} < ${LAGE_W}`);
    assert.ok(f.h < LAGE_H, `${f.h} < ${LAGE_H}`);
    for (const n of nodes) {
      assert.ok(n.x >= f.x + FRAME_PAD - 0.5, n.id);
      assert.ok(n.x <= f.x + f.w - FRAME_PAD + 0.5, n.id);
      assert.ok(n.y >= f.y + FRAME_PAD - 0.5, n.id);
      assert.ok(n.y <= f.y + f.h - FRAME_PAD + 0.5, n.id);
    }
  });

  it("graphFrame grows when wall tablets sit farther out", () => {
    const tight = graphFrame(layoutLage({ compact: true }).nodes);
    const wide = graphFrame(
      layoutLage({
        compact: true,
        vaults: [{ id: "a" }, { id: "b" }, { id: "c" }],
        workspaces: [{ id: "x" }, { id: "y" }],
      }).nodes,
    );
    assert.ok(wide.w > tight.w, `${wide.w} > ${tight.w}`);
  });

  it("compact frame is portrait — phone canvas can grow with the field", () => {
    const empty = graphFrame(layoutLage({ compact: true }).nodes, 48);
    assert.ok(
      empty.h / empty.w >= 0.92,
      `empty ${empty.w}×${empty.h} ratio ${empty.h / empty.w}`,
    );
    const loaded = graphFrame(
      layoutLage({
        compact: true,
        vaults: [{ id: "a" }, { id: "b" }],
        workspaces: [{ id: "x" }],
      }).nodes,
      48,
    );
    assert.ok(
      loaded.h / loaded.w >= 0.88,
      `loaded ${loaded.w}×${loaded.h} ratio ${loaded.h / loaded.w}`,
    );
    const grok = layoutLage({ compact: true }).nodes.find((n) => n.id === "grok");
    const hub = layoutLage({ compact: true }).nodes.find((n) => n.id === "hub");
    const agent = layoutLage({ compact: true }).nodes.find((n) => n.id === "agent");
    assert.ok(hub.y - grok.y > agent.x - hub.x, "vertical arm longer than horizontal");
  });

  it("compact keeps wall tablets off the heads", () => {
    const { nodes } = layoutLage({
      compact: true,
      vaults: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
      workspaces: [
        { id: "x", name: "X" },
        { id: "y", name: "Y" },
      ],
    });
    const hub = nodes.find((n) => n.id === "hub");
    const agent = nodes.find((n) => n.id === "agent");
    const code = nodes.find((n) => n.id === "code");
    for (const n of nodes.filter((v) => v.kind === "vault")) {
      assert.ok(n.x < hub.x, n.id);
      assert.ok(ringOf(n) > ringOf(agent) - 2, n.id);
    }
    for (const n of nodes.filter((v) => v.kind === "workspace")) {
      assert.ok(n.x > hub.x, n.id);
      assert.ok(ringOf(n) > ringOf(code) - 2, n.id);
    }
  });

  it("talks: Agent only vaults, Code to Agent", () => {
    const args = {
      vaults: [{ id: "peniel", name: "Peniel" }],
      workspaces: [{ id: "glyph-ui", name: "glyph-ui" }],
    };
    const agent = layoutLage({ ...args, focus: "agent" });
    assert.ok(
      agent.edges.every((e) => e.from.includes("vault:") || e.to.includes("vault:")),
    );
    const code = layoutLage({ ...args, focus: "code" });
    assert.ok(code.edges.some((e) => e.from === "hub" && e.to === "agent"));
    assert.ok(
      code.edges.some((e) => String(e.from).startsWith("ws:") || String(e.to).startsWith("ws:")),
    );
  });
});

describe("wallStickDeg", () => {
  it("tilts left-top and left-bottom opposite ways, keeps text upright", () => {
    const top = wallStickDeg(210, 168);
    const bot = wallStickDeg(210, 640);
    assert.ok(top < 0, top);
    assert.ok(bot > 0, bot);
    assert.ok(Math.abs(top) <= 42);
    assert.ok(Math.abs(bot) <= 42);
  });
});

describe("cablePath scale", () => {
  it("accepts a larger sag for Graph", () => {
    const d = cablePath(0, 0, 200, 0, { maxSag: 80, minSag: 20 });
    const cy = Number(d.split("Q ")[1].split(" ")[1]);
    assert.ok(cy >= 20, cy);
  });
});

describe("hairlinePath", () => {
  it("stays near the midpoint, not a hanging sag", () => {
    const d = hairlinePath(0, 0, 200, 0);
    const [, qy] = d.split("Q ")[1].split(" ").map(Number);
    assert.ok(Math.abs(qy) < 12, qy);
  });
});

describe("bindsOf", () => {
  it("defaults vault to agent, workspace to code", () => {
    const v = bindsOf({ mode: "r" }, "vault");
    assert.equal(v.agent, "r");
    assert.equal(v.grok, "rw");
    assert.equal(v.code, "unbound");
    const w = bindsOf({ mode: "rw" }, "workspace");
    assert.equal(w.code, "rw");
    assert.equal(w.agent, "unbound");
    assert.equal(w.grok, "rw");
  });

  it("read is dashes, write is not read", () => {
    const r = displayBind({ grok: "r", agent: "unbound", code: "unbound" });
    assert.equal(r.hasRead, true);
    assert.equal(r.hasWrite, false);
    const w = displayBind({ grok: "rw", agent: "unbound", code: "unbound" });
    assert.equal(w.hasRead, false);
    assert.equal(w.hasWrite, true);
  });

  it("marks disabled as unbound", () => {
    const b = bindsOf({ mode: "r", enabled: false }, "vault");
    assert.equal(b.agent, "unbound");
    assert.equal(b.grok, "unbound");
    const vis = displayBind(b);
    assert.equal(vis.unbound, true);
    assert.equal(vis.stepDim, true);
  });
});

describe("adjacentIds", () => {
  it("lists both ends of a spoke", () => {
    const { edges } = layoutLage({
      vaults: [{ id: "peniel", name: "Peniel" }],
    });
    const fromHub = adjacentIds(edges, "hub");
    assert.ok(fromHub.includes("grok"));
    assert.ok(fromHub.includes("agent"));
    assert.ok(adjacentIds(edges, "agent").includes("vault:peniel"));
  });
});

describe("edge weight", () => {
  it("marks profile spokes heavier than binds", () => {
    const { edges } = layoutLage({
      vaults: [{ id: "peniel", name: "Peniel" }],
    });
    const spoke = edges.find((e) => e.from === "hub" && e.to === "grok");
    const bind = edges.find((e) => e.to === "vault:peniel");
    assert.ok(spoke.weight > bind.weight);
  });
});
