/**
 * Tool-Karte — aufklappbare ACP-Toolzeile (Verb + Ziel, Details nach Klick).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import { useEffect, useState } from "react";
import {
  extractToolDetails,
  formatToolStatus,
  summarizeTool,
  toolHasDetails,
} from "../utils/toolCard.js";

function DiffBody({ text }) {
  return String(text || "")
    .split("\n")
    .map((line, i) => {
      const cls = line.startsWith("+")
        ? "tool-card-line tool-card-line--add"
        : line.startsWith("-")
          ? "tool-card-line tool-card-line--del"
          : "tool-card-line";
      return (
        <span key={i} className={cls}>
          {line}
          {"\n"}
        </span>
      );
    });
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "failed") return "failed";
  if (s === "completed") return "completed";
  if (s === "cancelled" || s === "killed") return "cancelled";
  if (s === "in_progress" || s === "running") return "in_progress";
  if (s === "pending") return "pending";
  return "unknown";
}

export function ToolCard({ msg }) {
  const summary = summarizeTool(msg);
  const details = extractToolDetails(msg);
  const has = toolHasDetails(details);
  const failed = String(msg.status || "").toLowerCase() === "failed";
  const [open, setOpen] = useState(failed);

  useEffect(() => {
    if (failed) setOpen(true);
  }, [failed]);

  const statusLabel = formatToolStatus(msg.status);
  const inner = (
    <>
      <span className="tool-card-verb">{summary.verb}</span>
      {summary.target ? (
        <span className="tool-card-target">{summary.target}</span>
      ) : null}
      {summary.deltaAdd ? (
        <span className="tool-card-delta-add">+{summary.deltaAdd}</span>
      ) : null}
      {summary.deltaDel ? (
        <span className="tool-card-delta-del">−{summary.deltaDel}</span>
      ) : null}
      {statusLabel ? (
        <span className="tool-card-status">{statusLabel}</span>
      ) : null}
      {has ? (
        <span className="tool-card-chev" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={`tool-card tool-card--${statusClass(msg.status)}${
        open && has ? " is-open" : ""
      }`}
      data-testid="tool-card"
    >
      {has ? (
        <button
          type="button"
          className="tool-card-summary"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {inner}
        </button>
      ) : (
        <div className="tool-card-summary">{inner}</div>
      )}
      {has && open ? (
        <div className="tool-card-details">
          {details.sections.map((s, i) => (
            <div key={`${s.label}-${i}`} className="tool-card-section">
              <div className="tool-card-label">{s.label}</div>
              <pre
                className={
                  s.kind === "diff"
                    ? "tool-card-pre tool-card-pre--diff"
                    : "tool-card-pre"
                }
              >
                {s.kind === "diff" ? <DiffBody text={s.text} /> : s.text}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
