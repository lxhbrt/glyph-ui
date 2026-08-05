/**
 * AssistantText — rendert die Antwort eines lokalen/Cloud-Agenten.
 *
 * Erkennt den Grok-artigen Tool-Banner (Schritte + Modell) am Ende des
 * stepBanner-Sentinels und zeigt ihn als eigenes, bewusst gedecktes Element
 * (dunkler, kleiner) ÜBER dem normalen Markdown-Antworttext. So hebt sich
 * die Tool-/Denk-Stufe visuell vom eigentlichen Antworttext ab.
 *
 * Ohne Banner einfach MarkdownBody. Reines Rendering — keine Datenlogik.
 *
 * Copyright (c) 2026 Alexander Hubert · SPDX-License-Identifier: MIT
 */
import { memo } from "react";
import { MarkdownBody } from "./MarkdownBody.jsx";
import { splitStepBanner } from "../utils/assistantTrace.js";

const AssistantText = memo(function AssistantText({ text }) {
  const { banner, answer } = splitStepBanner(text);

  if (!banner) {
    return <MarkdownBody text={text} />;
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
      <MarkdownBody text={answer} />
    </>
  );
});

export { AssistantText };
