/**
 * AssistantText — rendert die Antwort eines lokalen/Cloud-Agenten.
 *
 * Lese-Hierarchie: Antwort = Primärspur; Steps/Tool/Think = muted, immer lesbar.
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
import { memo } from "react";
import { MarkdownBody } from "./MarkdownBody.jsx";
import { cleanAssistantAnswer } from "../utils/assistantTrace.js";

function StepRail({ steps }) {
  if (!Array.isArray(steps) || !steps.length) return null;
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

const AssistantText = memo(function AssistantText({ text, steps }) {
  const hasLiveSteps = Array.isArray(steps) && steps.length > 0;
  // Banner + leaked tool JSON never enter MarkdownBody.
  const { banner, answer } = cleanAssistantAnswer(text);
  const prose = answer || "";

  return (
    <>
      {hasLiveSteps ? <StepRail steps={steps} /> : <BannerSteps banner={banner} />}
      {prose ? <MarkdownBody text={prose} /> : null}
    </>
  );
});

export { AssistantText };
