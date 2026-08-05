/**
 * Render plain text with valid slash commands in accent color.
 * Used for composer mirror layer and user message history.
 *
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import { useMemo } from "react";
import { highlightSlashSegments } from "../utils/slash.js";
import { MarkdownBody } from "./MarkdownBody.jsx";

/**
 * @param {{
 *   text: string,
 *   skills?: object[],
 *   commands?: object[],
 *   className?: string,
 *   markdownFallback?: boolean,
 * }} props
 */
export function SlashHighlightedText({
  text = "",
  skills = [],
  commands = [],
  className = "",
  markdownFallback = false,
}) {
  const segments = useMemo(
    () => highlightSlashSegments(text, skills, commands),
    [text, skills, commands],
  );
  const hasHighlight = segments.some((s) => s.highlight);

  if (!hasHighlight && markdownFallback) {
    return <MarkdownBody text={text} />;
  }

  return (
    <div className={className || "slash-highlighted-text"}>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <span key={i} className="slash-cmd">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </div>
  );
}
