/**
 * Shared CodeMirror language registry for Source fences
 * code blocks.
 *
 * Eager JS/TS (and a few common langs) avoid relying solely on
 * LanguageDescription lazy-load, which can silently fail when nested
 * @codemirror/language copies disagree. language-data covers the long tail.
 */
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { languages as languageData } from "@codemirror/language-data";
import type { LanguageSupport } from "@codemirror/language";

/** Default for untagged fences — TypeScript-aware JavaScript. */
export const defaultCodeLanguage: LanguageSupport = javascript({ typescript: true });

const eagerByAlias: Record<string, () => LanguageSupport> = {
  js: () => javascript(),
  javascript: () => javascript(),
  mjs: () => javascript(),
  cjs: () => javascript(),
  ts: () => javascript({ typescript: true }),
  typescript: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  json: () => json(),
  python: () => python(),
  py: () => python(),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
};

/**
 * Resolve a fenced-code info string for @codemirror/lang-markdown.
 * Returns an eager Language for common aliases, else a language-data
 * LanguageDescription (lazy), else the TS default Language.
 *
 * Return type is intentionally loose: nested @codemirror/language copies
 * under transitive deps disagree at typecheck; Vite dedupes at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveCodeLanguage(info: string): any {
  const name = info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!name) return defaultCodeLanguage.language;
  const eager = eagerByAlias[name];
  if (eager) return eager().language;
  const desc = languageData.find(
    (d) =>
      d.name.toLowerCase() === name ||
      d.alias?.some((a) => a.toLowerCase() === name),
  );
  return desc ?? defaultCodeLanguage.language;
}

export const languages = languageData;
