/**
 * AssistantText — rendert die Antwort eines lokalen/Cloud-Agenten.
 *
 * Lese-Hierarchie (Lesespur-Vertrag):
 *   - Primärspur = nur Final-/Status-Text (Markdown)
 *   - Protokoll = Steps (Tools) + Entwürfe (Zwischen-LLM), live offen,
 *     nach Turn-Ende zugeklappt (HSEQ-Nachvollzug per Klick)
 *
 * Zwei Quellen für die Tool-/Denk-Stufen („SearchVault“/„SearchWeb“ …):
 *   1. `steps` (live): Array von {start, result} pro Stufe während Streaming.
 *   2. Fallback über den Sentinel im Text (alte, nicht-streamende Antworten).
 *
 * Der Antworttext geht immer durch cleanAssistantAnswer — Sentinel/Banner
 * und geleakte Tool-JSON landen nie im Markdown-Body (saubere Lesespur).
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import { memo, useState, useEffect } from "react";
import { MarkdownBody } from "./MarkdownBody.jsx";
import { cleanAssistantAnswer } from "../utils/assistantTrace.js";

function StepRail({ steps }) {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return (
    <div className="steps-rail chat-secondary" data-testid="steps-rail">
      {steps.map((s, i) => (
        <div className="step-block" key={s.id ?? i}>
          {s.start ? <div className="step-line step-line--start">{s.start}</div> : null}
          {s.result ? <div className="step-line step-line--result">{s.result}</div> : null}
        </div>
      ))}
    </div>
  );
}

function BannerSteps({ banner }) {
  if (!banner) return null;
  return (
    <div className="agent-steps chat-secondary" data-testid="agent-steps">
      {banner.split("\n").map((line, i) => (
        <div className="agent-step-line" key={i}>
          {line}
        </div>
      ))}
    </div>
  );
}

function DraftsBlock({ drafts }) {
  if (!Array.isArray(drafts) || drafts.length === 0) return null;
  return (
    <div className="drafts-rail chat-secondary" data-testid="drafts-rail">
      <div className="drafts-rail-label">Entwürfe</div>
      {drafts.map((d, i) => (
        <div className="draft-block" key={d.id ?? i}>
          <div className="draft-body">{typeof d === "string" ? d : d.text || ""}</div>
        </div>
      ))}
    </div>
  );
}

function protocolSummary(stepCount, draftCount) {
  const parts = [];
  if (stepCount > 0) {
    parts.push(`${stepCount} Schritt${stepCount === 1 ? "" : "e"}`);
  }
  if (draftCount > 0) {
    parts.push(`${draftCount} Entwurf${draftCount === 1 ? "" : "e"}`);
  }
  if (!parts.length) return "Arbeitsprotokoll";
  return `Arbeitsprotokoll · ${parts.join(" · ")}`;
}

const AssistantText = memo(function AssistantText({
  text,
  steps,
  drafts,
  streaming = false,
  protocolCollapsed = false,
}) {
  const hasLiveSteps = Array.isArray(steps) && steps.length > 0;
  const draftList = Array.isArray(drafts) ? drafts : [];
  // Banner + leaked tool JSON never enter MarkdownBody.
  const { banner, answer } = cleanAssistantAnswer(text);
  const prose = answer || "";

  const stepCount = hasLiveSteps
    ? steps.length
    : banner
      ? banner.split("\n").filter(Boolean).length
      : 0;
  const hasProtocol = stepCount > 0 || draftList.length > 0;

  // Live: Protokoll offen. Fertig: Default zugeklappt (Q8), Nutzer kann öffnen.
  const [open, setOpen] = useState(Boolean(streaming) || !protocolCollapsed);
  useEffect(() => {
    if (streaming) {
      setOpen(true);
    } else if (protocolCollapsed) {
      setOpen(false);
    }
  }, [streaming, protocolCollapsed]);

  return (
    <>
      {hasProtocol ? (
        <details
          className="work-protocol chat-secondary"
          data-testid="work-protocol"
          open={open}
          onToggle={(e) => setOpen(e.currentTarget.open)}
        >
          <summary className="work-protocol-summary">
            {protocolSummary(stepCount, draftList.length)}
          </summary>
          <div className="work-protocol-body">
            {hasLiveSteps ? <StepRail steps={steps} /> : <BannerSteps banner={banner} />}
            <DraftsBlock drafts={draftList} />
          </div>
        </details>
      ) : null}
      {prose ? <MarkdownBody text={prose} /> : null}
    </>
  );
});

export { AssistantText };
