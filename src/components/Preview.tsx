import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkEmoji from "remark-emoji";
import rehypeKatex from "rehype-katex";
import { MermaidBlock } from "./MermaidBlock";
import type { Components } from "react-markdown";

interface PreviewProps {
  content: string;
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match?.[1];

    if (lang === "mermaid") {
      const code = String(children).replace(/\n$/, "");
      return <MermaidBlock code={code} />;
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export const Preview = React.memo(function Preview({ content }: PreviewProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkEmoji]}
      rehypePlugins={[rehypeKatex]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});
