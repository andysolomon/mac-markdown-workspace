import ReactDOMServer from "react-dom/server";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkEmoji from "remark-emoji";
import rehypeKatex from "rehype-katex";

export function markdownToHtml(markdown: string): string {
  const element = React.createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm, remarkMath, remarkEmoji],
    rehypePlugins: [rehypeKatex],
    children: markdown,
  });

  return ReactDOMServer.renderToString(element);
}
