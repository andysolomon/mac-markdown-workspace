import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkEmoji from "remark-emoji";
import rehypeKatex from "rehype-katex";
import { MermaidBlock } from "./MermaidBlock";
import { FencedCodeBlock } from "./FencedCodeBlock";
import { remarkSplitOrderedListRestarts } from "../services/remarkSplitOrderedListRestarts";
import type { Components } from "react-markdown";

interface PreviewProps {
  content: string;
}

function languageFromClassName(className?: string): string | undefined {
  const match = /language-([\w#+-]+)/.exec(className || "");
  return match?.[1];
}

const components: Components = {
  code({ className, children, ...props }) {
    const lang = languageFromClassName(className);
    const code = String(children).replace(/\n$/, "");

    // react-markdown passes inline code without a language class and without newlines.
    const inline = !className && !code.includes("\n");
    if (inline) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    if (lang === "mermaid") {
      return <MermaidBlock code={code} />;
    }

    if (lang === "tree" || lang === "filesystem") {
      return <FencedCodeBlock code={code} language={lang} />;
    }

    return <FencedCodeBlock code={code} language={lang} />;
  },
  // Avoid double <pre> wrappers: FencedCodeBlock already emits <pre>.
  pre({ children }) {
    return <>{children}</>;
  },
};

export const Preview = React.memo(function Preview({ content }: PreviewProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkSplitOrderedListRestarts, remarkMath, remarkEmoji]}
      rehypePlugins={[rehypeKatex]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});
