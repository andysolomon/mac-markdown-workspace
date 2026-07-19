import React, { useEffect, useState } from "react";
import { highlightCode } from "../services/shikiHighlighter";

interface FencedCodeBlockProps {
  code: string;
  language?: string;
}

/**
 * Client-side Shiki highlighter for Preview fences. Shows plain monospace
 * until the async highlighter resolves, then swaps in token spans that use
 * --shiki-* → --md-code-* CSS variables.
 */
export const FencedCodeBlock = React.memo(function FencedCodeBlock({
  code,
  language,
}: FencedCodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    void highlightCode(code, language).then((next) => {
      if (!cancelled) setHtml(next);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (!html) {
    return (
      <pre>
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="mm-code-block"
      // Shiki output is trusted (our own highlighter; note body is user content
      // escaped by Shiki into text nodes / spans).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
