/**
 * Graph — pitch-black field. Glyph, three Raupe heads, Obsidian dots.
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBindResource } from "../hooks/useBindResource.js";
import { hairlinePath } from "../utils/cables.js";
import {
  adjacentIds,
  bindsOf,
  displayBind,
  filterBindItems,
  graphFrame,
  HEAD_IDS,
  LAGE_CX,
  LAGE_H,
  LAGE_W,
  layoutLage,
  PHONE_PAD,
  profileHeadId,
  lerpGraph,
  reaches,
} from "../utils/lageLayout.js";
import { handleDialogTab } from "../utils/focusTrap.js";
import { GraphLegend } from "./GraphLegend.jsx";
import { GlyphVessel, SnakeHead } from "./GraphFaces.jsx";

function shortPath(p) {
  const s = String(p || "");
  if (s.startsWith("/Users/")) {
    const slash = s.indexOf("/", 7);
    if (slash > 0) return `~${s.slice(slash)}`;
  }
  return s;
}

export function CableLage({
  open,
  onClose,
  focus = "",
  activeProfile = "",
  working = false,
}) {
  const vaults = useBindResource({
    apiBase: "/api/vaults",
    listKey: "vaults",
    autoload: false,
  });
  const workspaces = useBindResource({
    apiBase: "/api/workspaces",
    listKey: "workspaces",
    autoload: false,
  });
  const stageRef = useRef(null);
  const currentHead = profileHeadId(activeProfile);
  const [bindings, setBindings] = useState(null);
  const [bindErr, setBindErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [pendingDetach, setPendingDetach] = useState(null);
  const [attachInput, setAttachInput] = useState("");
  const [cluster, setCluster] = useState("all");
  const [folderQuery, setFolderQuery] = useState("");
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia("(max-width: 720px)").matches;
    } catch {
      return false;
    }
  });

  const loadBindings = useCallback(async () => {
    try {
      const res = await fetch("/api/bindings", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setBindings(data);
      setBindErr("");
    } catch (e) {
      setBindErr(e.message || String(e));
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    void loadBindings();
    void vaults.refresh();
    void workspaces.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadBindings]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const focusClose = () => {
      stageRef.current?.querySelector(".lage-close")?.focus();
    };
    requestAnimationFrame(focusClose);
    const onKey = (e) => {
      if (handleDialogTab(stageRef.current, e)) return;
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (selectedId || cluster !== "all") {
        setSelectedId(null);
        setCluster("all");
        setPendingDetach(null);
        setHoverId(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [open, onClose, selectedId, cluster]);

  useEffect(() => {
    if (focus === "vaults" || focus === "agent") {
      setCluster("agent");
      setSelectedId("hub");
    } else if (focus === "workspaces" || focus === "code") {
      setCluster("code");
      setSelectedId("hub");
    } else if (focus === "grok") {
      setCluster("grok");
      setSelectedId("hub");
    } else if (focus === "bindings") {
      setCluster("agent");
      setSelectedId("hub");
    } else if (open) {
      setCluster((c) => c || "all");
    }
  }, [focus, open]);

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(max-width: 720px)");
    } catch {
      return undefined;
    }
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const folderCount = vaults.items.length + workspaces.items.length;
  const shownVaults = useMemo(
    () =>
      filterBindItems(vaults.items, {
        query: folderQuery,
        connectedOnly,
        kind: "vault",
      }),
    [vaults.items, folderQuery, connectedOnly],
  );
  const shownWorkspaces = useMemo(
    () =>
      filterBindItems(workspaces.items, {
        query: folderQuery,
        connectedOnly,
        kind: "workspace",
      }),
    [workspaces.items, folderQuery, connectedOnly],
  );

  const targetGraph = useMemo(
    () =>
      layoutLage({
        vaults: shownVaults,
        workspaces: shownWorkspaces,
        focus: cluster,
        compact: narrow,
      }),
    [shownVaults, shownWorkspaces, cluster, narrow],
  );
  const fromRef = useRef(targetGraph);
  const [graph, setGraph] = useState(targetGraph);

  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = false;
    }
    if (reduce) {
      fromRef.current = targetGraph;
      setGraph(targetGraph);
      return undefined;
    }
    const from = fromRef.current;
    const t0 = performance.now();
    const dur = 220;
    let raf = 0;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - u) * (1 - u);
      setGraph(lerpGraph(from, targetGraph, e));
      if (u < 1) raf = requestAnimationFrame(step);
      else fromRef.current = targetGraph;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targetGraph]);

  const byId = useMemo(() => {
    const m = new Map();
    for (const n of graph.nodes) m.set(n.id, n);
    return m;
  }, [graph.nodes]);

  const profiles = bindings?.profiles || {};
  const grok = profiles.grok;
  const code = profiles._code;
  const agent = profiles["glyph-agent"];
  const absorb = cluster === "all" ? null : cluster;

  function nodeState(node) {
    if (node.kind === "hub") {
      return {
        live: true,
        face: absorb,
        label:
          absorb === "grok"
            ? "Grok Build"
            : absorb === "agent"
              ? "°_Agent"
              : absorb === "code"
                ? "^_Code"
                : "Glyph",
        kindWord: absorb ? "Kopf" : "Tafel",
        working: Boolean(working && absorb),
      };
    }
    if (node.id === "grok") {
      return { live: Boolean(grok?.ok), face: "grok", kindWord: "Kopf" };
    }
    if (node.id === "agent") {
      return { live: Boolean(agent?.ok), face: "agent", kindWord: "Kopf" };
    }
    if (node.id === "code") {
      return { live: Boolean(code?.ok), face: "code", kindWord: "Kopf" };
    }
    if (node.kind === "vault" || node.kind === "workspace") {
      const list = node.kind === "vault" ? vaults.items : workspaces.items;
      const item = list.find((v) => v.id === node.ref);
      const binds = node.binds || bindsOf(item, node.kind);
      const vis = displayBind(binds);
      return {
        live: item ? item.enabled !== false && !vis.unbound : false,
        mode: vis.hasWrite ? "rw" : vis.hasRead ? "r" : vis.hasPrivate ? "private" : "",
        binds,
        ...vis,
        primary: Boolean(item?.primary || node.primary),
        item,
        label:
          node.kind === "workspace" && item?.path
            ? shortPath(item.path)
            : item?.name || node.label,
        kindWord: node.kind === "vault" ? "Vault" : "Root",
      };
    }
    return { live: false, kindWord: "" };
  }

  const lit = useMemo(() => {
    const seed = selectedId || hoverId;
    const set = new Set();
    if (!seed) return set;
    set.add(seed);
    for (const id of adjacentIds(graph.edges, seed)) set.add(id);
    return set;
  }, [selectedId, hoverId, graph.edges]);

  function edgeClass(edge) {
    const hide =
      cluster !== "all" &&
      edge.from !== "hub" &&
      edge.to !== "hub" &&
      !reaches(cluster, edge.from, graph.nodes) &&
      !reaches(cluster, edge.to, graph.nodes);
    const bind = edge.via === "bind";
    const leafOn =
      selected &&
      (selected.kind === "vault" || selected.kind === "workspace");
    const mine =
      bind && selectedId && (edge.from === selectedId || edge.to === selectedId);
    const bits = ["lage-cable"];
    if (bind) {
      if (edge.mode === "private") bits.push("is-private");
      else if (edge.mode === "rw") bits.push("is-rw");
      else bits.push("is-r");
    } else {
      bits.push("is-axis");
    }
    if (hide) bits.push("is-dim");
    else if (leafOn) {
      if (mine) bits.push("is-active");
      else bits.push("is-dim");
    }
    return bits.join(" ");
  }

  function edgeWidth(edge) {
    const bind = edge.via === "bind";
    const leafOn =
      selected &&
      (selected.kind === "vault" || selected.kind === "workspace");
    const mine =
      bind && selectedId && (edge.from === selectedId || edge.to === selectedId);
    if (!bind) return 0.38;
    if (leafOn && mine) return 1.55;
    if (edge.mode === "rw") return 1.12;
    if (edge.mode === "private") return 0.9;
    return 0.95;
  }

  function dimmed(node) {
    if (node.kind === "hub" || node.kind === "profile") return false;
    const st = nodeState(node);
    if (st.primary || selectedId === node.id) return false;
    if (selectedId && !lit.has(node.id)) return true;
    if (cluster === "all") return false;
    return !reaches(cluster, node.id, graph.nodes);
  }

  function enter(node) {
    setPendingDetach(null);
    if (node.id === "hub") {
      setSelectedId("hub");
      return;
    }
    if (node.id === "grok" || node.id === "agent" || node.id === "code") {
      setCluster(node.id);
      setSelectedId("hub");
      return;
    }
    if (node.kind === "vault" || node.kind === "workspace") {
      setSelectedId(node.id);
      return;
    }
    setSelectedId(node.id);
  }

  function pickId(id) {
    if (id === absorb) {
      setSelectedId("hub");
      return;
    }
    const node = byId.get(id);
    if (node) enter(node);
  }

  function resetField() {
    setSelectedId(null);
    setCluster("all");
    setPendingDetach(null);
    setHoverId(null);
  }

  const selected = selectedId ? byId.get(selectedId) : null;
  const selectedState = selected ? nodeState(selected) : null;
  const hubState = nodeState({ id: "hub", kind: "hub" });
  const busy = vaults.busy || workspaces.busy;
  const loading = vaults.loading || workspaces.loading;
  const allLayout = useMemo(
    () =>
      layoutLage({
        vaults: shownVaults,
        workspaces: shownWorkspaces,
        focus: "all",
        compact: narrow,
      }),
    [shownVaults, shownWorkspaces, narrow],
  );
  const field = useMemo(
    () =>
      narrow
        ? graphFrame(allLayout.nodes, PHONE_PAD)
        : { x: 0, y: 0, w: LAGE_W, h: LAGE_H },
    [narrow, allLayout],
  );
  const allEdges = allLayout.edges;

  const neighborRows = useMemo(() => {
    if (!selected) return [];
    const leaf = selected.kind === "vault" || selected.kind === "workspace";
    const source = leaf ? allEdges : graph.edges;
    return adjacentIds(source, selected.id).map((id) => {
      const n = byId.get(id === absorb ? "hub" : id);
      const st = n ? nodeState(n) : null;
      const fallback =
        id === "agent"
          ? "°_Agent"
          : id === "code"
            ? "^_Code"
            : id === "grok"
              ? "Grok Build"
              : id;
      return {
        id,
        label: st?.label || n?.label || fallback,
        kind: n?.kind || "",
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, graph.edges, allEdges, byId, vaults.items, workspaces.items, absorb]);

  function pathMatch(item, raw) {
    const p = String(item?.path || "");
    const name = String(item?.name || "");
    if (!raw) return false;
    if (p === raw || name === raw) return true;
    if (raw.startsWith("~") && p.endsWith(raw.slice(1))) return true;
    return p.endsWith(`/${raw}`) || p.endsWith(raw);
  }

  async function onAttach(e) {
    e?.preventDefault?.();
    const raw = attachInput.trim();
    if (!raw || busy) return;
    const head = cluster === "all" ? absorb || "agent" : cluster;
    if (!HEAD_IDS.includes(head)) return;
    const mode = head === "agent" ? "r" : "rw";
    setAttachInput("");
    const existingVault = vaults.items.find((it) => pathMatch(it, raw));
    const existingWs = workspaces.items.find((it) => pathMatch(it, raw));
    let ok = false;
    if (existingVault) {
      ok = await vaults.patch(existingVault.id, { heads: { [head]: mode } });
    } else if (existingWs) {
      ok = await workspaces.patch(existingWs.id, { heads: { [head]: mode } });
    } else {
      const hook = head === "code" ? workspaces : vaults;
      ok = await hook.attach(raw, mode, { head });
    }
    if (!ok) setAttachInput(raw);
  }

  const wantBind =
    focus === "bindings" || focus === "agent" || focus === "code";

  if (!open) return null;

  return (
    <div
      ref={stageRef}
      className="lage-stage"
      role="dialog"
      aria-modal="true"
      aria-label="Graph"
    >
      <button type="button" className="lage-close" onClick={onClose}>
        Schließen
      </button>
      <p className="lage-edge-key" aria-label="Kanten">
        <span className="lage-edge-key-item is-rw">schreiben</span>
        <span className="lage-edge-key-item is-r">lesen</span>
        <span className="lage-edge-key-item is-private">privat</span>
      </p>
      {folderCount >= 8 ? (
        <div className="lage-filter">
          <input
            type="search"
            value={folderQuery}
            onChange={(e) => setFolderQuery(e.target.value)}
            placeholder="Ordner suchen"
            aria-label="Ordner suchen"
          />
          <button
            type="button"
            className={`lage-filter-btn${connectedOnly ? " is-on" : ""}`}
            aria-pressed={connectedOnly}
            onClick={() => setConnectedOnly((v) => !v)}
          >
            Nur verbunden
          </button>
        </div>
      ) : null}

      {bindErr || vaults.error || workspaces.error ? (
        <p className="lage-alert" role="alert">
          {bindErr || vaults.error || workspaces.error}
        </p>
      ) : null}

      <div
        className={`lage-body${loading ? " is-loading" : ""}${
          selected ? " has-inspect" : ""
        }`}
      >
        <div
          className="lage-canvas"
          data-loading={loading || undefined}
          style={{
            "--lage-fw": field.w,
            "--lage-fh": field.h,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) resetField();
          }}
        >
          <svg
            className="lage-svg"
            viewBox={`${field.x} ${field.y} ${field.w} ${field.h}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            {graph.edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              return (
                <path
                  key={`${e.from}->${e.to}`}
                  className={edgeClass(e)}
                  d={hairlinePath(a.x, a.y, b.x, b.y)}
                  style={{ strokeWidth: edgeWidth(e) }}
                />
              );
            })}
          </svg>

          {graph.nodes.map((node) => {
            const st = nodeState(node);
            const isHub = node.id === "hub";
            const glow = cluster !== "all" && reaches(cluster, node.id, graph.nodes);
            const hot = lit.has(node.id);
            const name = isHub ? hubState.label : st.label || node.label;
            const starred =
              (node.kind === "vault" || node.kind === "workspace") &&
              (st.primary || selectedId === node.id);
            return (
              <button
                key={node.id}
                type="button"
                className={`lage-node lage-node--${node.kind}${
                  st.live ? " is-live" : ""
                }${st.working ? " is-working" : ""}${
                  st.primary ? " is-primary" : ""
                }${selectedId === node.id ? " is-selected" : ""}${
                  isHub ? " is-center" : ""
                }${isHub && absorb ? " is-holding" : ""}${
                  isHub && !absorb ? " is-idle-glyph" : ""
                }${glow ? " is-reach" : ""}${hot ? " is-hot" : ""}${
                  dimmed(node) ? " is-dim" : ""
                }${st.stepDim ? " is-step-dim" : ""}${
                  starred ? " is-star" : ""
                }${st.mode ? ` is-mode-${st.mode}` : ""}${
                  currentHead && node.id === currentHead ? " is-current" : ""
                }`}
                style={{
                  left: `${((node.x - field.x) / field.w) * 100}%`,
                  top: `${((node.y - field.y) / field.h) * 100}%`,
                }}
                aria-label={name}
                title={name}
                aria-current={
                  currentHead && node.id === currentHead ? "true" : undefined
                }
                aria-pressed={selectedId === node.id}
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() =>
                  setHoverId((id) => (id === node.id ? null : id))
                }
                onFocus={() => setHoverId(node.id)}
                onBlur={() =>
                  setHoverId((id) => (id === node.id ? null : id))
                }
                onClick={(e) => {
                  e.stopPropagation();
                  enter(node);
                }}
              >
                <span className="lage-node-core">
                  <NodeFace
                    node={node}
                    st={st}
                    hub={hubState}
                    starred={starred}
                    large={narrow}
                  />
                </span>
                <strong className="lage-node-label">{name}</strong>
              </button>
            );
          })}
        </div>

        {selected ? (
          <aside
            className={`lage-inspect${
              selected.x < LAGE_CX ? " is-right" : ""
            }`}
            aria-label="Legende"
          >
            <LegendCatch>
              <GraphLegend
                absorb={absorb}
                selected={selected}
                state={selectedState}
                neighbors={neighborRows}
                onPick={pickId}
                grok={grok}
                code={code}
                agent={agent}
                bindings={bindings}
                onBindingsChange={setBindings}
                vaults={vaults}
                workspaces={workspaces}
                busy={busy}
                pendingDetach={pendingDetach}
                setPendingDetach={setPendingDetach}
                openBind={wantBind && !selectedState?.item}
              />
            </LegendCatch>

            {cluster === "agent" || cluster === "code" || cluster === "grok" ? (
              <form className="lage-attach" onSubmit={onAttach}>
                <input
                  type="text"
                  value={attachInput}
                  onChange={(e) => setAttachInput(e.target.value)}
                  disabled={busy}
                  placeholder={
                    cluster === "code"
                      ? "~/projekt oder /Users/…"
                      : "Pfad, Name oder obsidian://"
                  }
                  aria-label={
                    cluster === "code" ? "Root anbinden" : "Ordner anbinden"
                  }
                />
                <button type="submit" disabled={busy || !attachInput.trim()}>
                  Anbinden
                </button>
              </form>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function GraphModal(props) {
  return (
    <GraphGuard onClose={props.onClose}>
      <CableLage {...props} />
    </GraphGuard>
  );
}

export class GraphGuard extends Component {
  constructor(props) {
    super(props);
    this.state = { err: "" };
  }
  static getDerivedStateFromError(err) {
    return { err: err?.message || String(err) };
  }
  render() {
    if (this.state.err) {
      return (
        <div
          className="lage-stage"
          role="alertdialog"
          aria-modal="true"
          aria-label="Graph-Fehler"
        >
          <button
            type="button"
            className="lage-close"
            onClick={this.props.onClose}
          >
            Schließen
          </button>
          <p className="lage-alert" role="alert">
            {this.state.err}
          </p>
          <button
            type="button"
            className="lage-link lage-guard-retry"
            onClick={() => this.setState({ err: "" })}
          >
            Nochmal
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

class LegendCatch extends Component {
  constructor(props) {
    super(props);
    this.state = { err: "" };
  }
  static getDerivedStateFromError(err) {
    return { err: err?.message || String(err) };
  }
  render() {
    if (this.state.err) {
      return (
        <p className="lage-alert" role="alert">
          {this.state.err}
        </p>
      );
    }
    return this.props.children;
  }
}

function NodeFace({ node, st, hub, starred, large = false }) {
  if (node.id === "hub") {
    const faceOn = Boolean(hub.face);
    return (
      <GlyphVessel
        size={large ? (faceOn ? 42 : 54) : faceOn ? 28 : 36}
        face={hub.face || null}
      />
    );
  }
  if (node.kind === "profile") {
    return (
      <SnakeHead
        size={large ? 40 : 26}
        face={st.face || node.face || "grok"}
      />
    );
  }
  return <FolderGlyph st={st} starred={starred} />;
}

/** One viewBox: O or star at (12,12), ticks/dots on the same origin. */
function FolderGlyph({ st, starred }) {
  return (
    <svg
      className={`lage-folder-mark${st.stepDim ? " is-step-dim" : ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {starred ? (
        <polygon
          className="lage-folder-star"
          points="12,4.2 13.55,9.05 18.6,9.2 14.6,12.35 15.7,17.3 12,14.55 8.3,17.3 9.4,12.35 5.4,9.2 10.45,9.05"
        />
      ) : (
        <circle className="lage-folder-o" cx="12" cy="12" r="3.15" />
      )}
      {st.hasRead ? (
        <>
          <line x1="12" y1="1.6" x2="12" y2="5.4" />
          <line x1="22.4" y1="12" x2="18.6" y2="12" />
          <line x1="12" y1="22.4" x2="12" y2="18.6" />
          <line x1="1.6" y1="12" x2="5.4" y2="12" />
        </>
      ) : null}
      {st.hasPrivate ? (
        <>
          <circle className="lage-folder-dot" cx="16.7" cy="7.3" r="0.85" />
          <circle className="lage-folder-dot" cx="16.7" cy="16.7" r="0.85" />
          <circle className="lage-folder-dot" cx="7.3" cy="16.7" r="0.85" />
          <circle className="lage-folder-dot" cx="7.3" cy="7.3" r="0.85" />
        </>
      ) : null}
    </svg>
  );
}
