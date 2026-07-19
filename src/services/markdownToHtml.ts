import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkEmoji from "remark-emoji";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import prettyCode from "rehype-pretty-code";
import { remarkSplitOrderedListRestarts } from "./remarkSplitOrderedListRestarts";
import { mmwCodeTheme } from "./shikiHighlighter";

/**
 * Async Markdown → HTML for exports. Uses rehype-pretty-code (Shiki) so
 * fenced blocks get the same --shiki-* / --md-code-* token colors as Preview.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const file = await remark()
    .use(remarkGfm)
    .use(remarkSplitOrderedListRestarts)
    .use(remarkMath)
    .use(remarkEmoji)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeKatex)
    .use(prettyCode, {
      theme: mmwCodeTheme,
      keepBackground: false,
      bypassInlineCode: true,
    } as Parameters<typeof prettyCode>[0])
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}
