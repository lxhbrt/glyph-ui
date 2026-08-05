/**
 * AssistantText — rendert die Antwort eines lokalen/Cloud-Agenten.
 *
 * Zwei Quellen für die Tool-/Denk-Stufen („SearchVault“/„SearchWeb“/„Think“ …):
 *   1. `steps` (live): Array von {start, result} pro Stufe, das die UI während
 *      des Streamings aufbaut (Stufe erscheint, sobald sie beginnt; das Ergebnis
 *      wird nach der Aktivität angehängt).
 *   2. Fallback über den Sentinel im Text (alte, nicht-streamende Antworten).
 *
 * Die Stufen werden als eigenes, bewusst gedecktes Element (dunkler, kleiner)
 * ÜBER dem normalen Markdown-Antworttext gezeigt — so heben sie sich visuell ab.
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import { memo } from "react";
import { MarkdownBody } from "./MarkdownBody.jsx";
import { splitStepBanner } from "../utils/assistantTrace.js";

function StepRail({ steps }) {
  if (!Array.isArray(steps) || !steps.length) return null;
  return (
    <div className="steps-rail" data-testid="steps-rail">
      {steps.map((s, i) => (
        <div className="step-block" key={s.id ?? i}>
          {s.start ? <div className="step-line step-line--start">{s.start}</div> : null}
          {s.result ? <div className="step-line step-line--result">{s.result}</div> : null}
        </div>
      ))}
    </div>
  );
}

const AssistantText = memo(function AssistantText({ text, steps }) {
  // Live-Stufen bevorzugt; sonst Fallback auf den (alten) zusammengefassten Banner.
  const hasLiveSteps = Array.isArray(steps) && steps.length > 0;

  if (hasLiveSteps) {
    return (
      <>
        <StepRail steps={steps} />
        {text ? <MarkdownBody text={text} /> : null}
      </>
    );
  }

  const { banner, answer } = splitStepBanner(text);
  if (!banner) {
    return text ? <MarkdownBody text={text} /> : null;
  }
  return (
    <>
      <div className="agent-steps" data-testid="agent-steps">
        {banner.split("\n").map((line, i) => (
          <div className="agent-step-line" key={i}>
            {line}
          </div>
        ))}
      </div>
      {answer ? <MarkdownBody text={answer} /> : null}
    </>
  );
});

export { AssistantText };
