import {
  createCssVariablesTheme,
  createHighlighter,
  createJavaScriptRegexEngine,
  type Highlighter,
} from "shiki";

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
    // JS regex engine — no Oniguruma WASM fetch (avoids silent Preview
    // failures when the wasm chunk 404s or fails to init in the browser).
    highlighterPromise = createHighlighter({
      engine: createJavaScriptRegexEngine(),
      themes: [mmwCodeTheme],
      langs: [...CORE_LANGS],
    });
  }
  return highlighterPromise;
}

function normalizeLang(lang?: string): string {
  const requested = (lang || "typescript").toLowerCase();
  if (requested === "ts") return "typescript";
  if (requested === "js" || requested === "mjs" || requested === "cjs") return "javascript";
  if (requested === "sh" || requested === "shell" || requested === "zsh" || requested === "bash") {
    return "shellscript";
  }
  if (requested === "text" || requested === "plain" || requested === "plaintext") {
    return "text";
  }
  return requested;
}

/**
 * Highlight a fenced code body to an HTML string (`<pre class="shiki">…`).
 * Missing/unknown languages fall back to TypeScript then plain text.
 */
export async function highlightCode(code: string, lang?: string): Promise<string> {
  const highlighter = await getHighlighter();
  let language = normalizeLang(lang);

  if (language !== "text" && !highlighter.getLoadedLanguages().includes(language)) {
    try {
      await highlighter.loadLanguage(language as Parameters<Highlighter["loadLanguage"]>[0]);
    } catch {
      language = "typescript";
    }
  }

  const body = code.replace(/\n$/, "");
  try {
    return highlighter.codeToHtml(body, {
      lang: language === "text" ? "typescript" : language,
      theme: "mmw-code",
    });
  } catch {
    return highlighter.codeToHtml(body, {
      lang: "typescript",
      theme: "mmw-code",
    });
  }
}
