import { createCssVariablesTheme, createHighlighter, type Highlighter } from "shiki";

/** Shiki theme that paints via --shiki-* CSS vars (mapped to --md-code-* in index.css). */
export const mmwCodeTheme = createCssVariablesTheme({
  name: "mmw-code",
  variablePrefix: "--shiki-",
  fontStyle: true,
});

const CORE_LANGS = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "json",
  "html",
  "css",
  "python",
  "go",
  "rust",
  "java",
  "sql",
  "bash",
  "shellscript",
  "yaml",
  "markdown",
  "xml",
] as const;

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [mmwCodeTheme],
      langs: [...CORE_LANGS],
    });
  }
  return highlighterPromise;
}

/**
 * Highlight a fenced code body to an HTML string (`<pre class="shiki">…`).
 * Unknown languages fall back to plain text tokens (still themed).
 */
export async function highlightCode(code: string, lang?: string): Promise<string> {
  const highlighter = await getHighlighter();
  const requested = (lang || "text").toLowerCase();
  const alias =
    requested === "ts"
      ? "typescript"
      : requested === "js"
        ? "javascript"
        : requested === "sh" || requested === "shell" || requested === "zsh" || requested === "bash"
          ? "shellscript"
          : requested;

  let language = alias;
  if (!highlighter.getLoadedLanguages().includes(language)) {
    try {
      await highlighter.loadLanguage(language as Parameters<Highlighter["loadLanguage"]>[0]);
    } catch {
      language = "text";
      if (!highlighter.getLoadedLanguages().includes("text")) {
        try {
          await highlighter.loadLanguage("text");
        } catch {
          /* plaintext always available as last resort via empty lang */
        }
      }
    }
  }

  try {
    return highlighter.codeToHtml(code.replace(/\n$/, ""), {
      lang: language,
      theme: "mmw-code",
    });
  } catch {
    return highlighter.codeToHtml(code.replace(/\n$/, ""), {
      lang: "text",
      theme: "mmw-code",
    });
  }
}
