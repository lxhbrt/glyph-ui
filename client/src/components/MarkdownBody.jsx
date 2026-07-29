/**
 * Copyright (c) 2026 Alexander Hubert
 * SPDX-License-Identifier: MIT
 */
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/**
 * Chat markdown: GFM + single newlines as hard breaks (Enter in the composer).
 * Without remark-breaks, Markdown collapses "line1\\nline2" into one line.
 */
function MarkdownBody({ text }) {
  const source = text ?? "";
  if (!source.trim()) {
    return <div className="md-body md-body--empty" />;
  }
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          // Avoid huge default margins inside tight chat bubbles
          p: ({ children }) => <p className="md-p">{children}</p>,
          br: () => <br />,
          ul: ({ children }) => <ul className="md-list">{children}</ul>,
          ol: ({ children }) => <ol className="md-list md-list--ol">{children}</ol>,
          li: ({ children }) => <li className="md-li">{children}</li>,
          h1: ({ children }) => <h3 className="md-h">{children}</h3>,
          h2: ({ children }) => <h3 className="md-h">{children}</h3>,
          h3: ({ children }) => <h4 className="md-h md-h--sm">{children}</h4>,
          h4: ({ children }) => <h4 className="md-h md-h--sm">{children}</h4>,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className?.includes("language-"));
            if (isBlock) {
              return (
                <code className={`md-code-block ${className || ""}`} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="md-code-inline" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="md-pre">{children}</pre>,
          blockquote: ({ children }) => (
            <blockquote className="md-quote">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="md-table-wrap">
              <table className="md-table">{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export { MarkdownBody };
