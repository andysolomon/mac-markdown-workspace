import { describe, it, expect } from "vitest";
import { highlightCode } from "../services/shikiHighlighter";
import { markdownToHtml } from "../services/markdownToHtml";

describe("highlightCode", () => {
  it("emits Shiki css-variable token colors for TypeScript", async () => {
    const html = await highlightCode(
      'const x: string = "hi"\n// comment\n',
      "typescript",
    );
    expect(html).toContain("--shiki-token-keyword");
    expect(html).toContain("--shiki-token-string-expression");
    expect(html).toContain("--shiki-token-comment");
  });
});

describe("markdownToHtml code fences", () => {
  it("highlights fenced typescript via rehype-pretty-code", async () => {
    const html = await markdownToHtml(
      "```typescript\nconst x: string = \"hi\"\n```\n",
    );
    expect(html).toContain("--shiki-token-keyword");
    expect(html).toContain('data-language="typescript"');
  });
});
