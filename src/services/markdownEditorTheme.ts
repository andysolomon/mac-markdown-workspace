import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/**
 * Structure-colored Markdown editing theme (Mac Markdown design system).
 *
 * The system's core rule — SYNTAX is drawn in the theme accent, PROSE stays
 * neutral — falls out of the Lezer markdown grammar cleanly: every structural
 * mark (# hashes, list bullets, > quote marks, ** emphasis marks, code fences,
 * link brackets) carries the `processingInstruction` tag, so one rule colors
 * them all with `--md-marker`.
 *
 * Nested fenced-code languages reuse the same `--md-code-*` roles as Preview
 * (Shiki) and WYSIWYG so palette / light-dark switches restyle live.
 */
const macMarkdownHighlight = HighlightStyle.define([
  // Structural marks — always accent. The one rule that defines the system.
  { tag: t.processingInstruction, color: "var(--md-marker)", fontWeight: "700" },

  // Headings: H1 leads with accent; H2–H4 carry weight only; H5/H6 recede.
  { tag: t.heading1, color: "var(--md-h1)", fontWeight: "800", fontSize: "1.55em", lineHeight: "var(--mm-lh-heading)" },
  { tag: t.heading2, color: "var(--md-h2)", fontWeight: "800", fontSize: "1.3em", lineHeight: "var(--mm-lh-heading)" },
  { tag: t.heading3, color: "var(--md-h3)", fontWeight: "800", fontSize: "1.15em", lineHeight: "var(--mm-lh-heading)" },
  { tag: t.heading4, color: "var(--md-h4)", fontWeight: "800", fontSize: "1.05em" },
  { tag: t.heading5, color: "var(--md-h5)", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "0.9em" },
  { tag: t.heading6, color: "var(--md-h6)", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "0.85em" },

  // Inline runs: weight/style carry emphasis, not color.
  { tag: t.strong, fontWeight: "var(--md-bold-weight, 800)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, color: "var(--md-strike)", textDecoration: "line-through" },

  // Links glow in the accent.
  { tag: t.link, color: "var(--md-link)", textDecoration: "underline", textUnderlineOffset: "3px" },
  { tag: t.url, color: "var(--md-link)" },

  // Untagged monospace (inline code / unknown fence lang) — fallback role.
  { tag: t.monospace, color: "var(--md-code)", fontFamily: "var(--mm-font-mono)", fontSize: "0.86em" },

  // Nested fenced-code tokens (when markdown({ codeLanguages }) is enabled).
  { tag: t.keyword, color: "var(--md-code-keyword)" },
  { tag: t.controlKeyword, color: "var(--md-code-keyword)" },
  { tag: t.moduleKeyword, color: "var(--md-code-keyword)" },
  { tag: t.definitionKeyword, color: "var(--md-code-keyword)" },
  { tag: t.operatorKeyword, color: "var(--md-code-keyword)" },
  { tag: t.string, color: "var(--md-code-string)" },
  { tag: t.special(t.string), color: "var(--md-code-string)" },
  { tag: t.comment, color: "var(--md-code-comment)", fontStyle: "italic" },
  { tag: t.lineComment, color: "var(--md-code-comment)", fontStyle: "italic" },
  { tag: t.blockComment, color: "var(--md-code-comment)", fontStyle: "italic" },
  { tag: t.number, color: "var(--md-code-number)" },
  { tag: t.bool, color: "var(--md-code-number)" },
  { tag: t.null, color: "var(--md-code-number)" },
  { tag: t.typeName, color: "var(--md-code-type)" },
  { tag: t.className, color: "var(--md-code-type)" },
  { tag: t.namespace, color: "var(--md-code-type)" },
  { tag: t.propertyName, color: "var(--md-code-property)" },
  { tag: t.attributeName, color: "var(--md-code-property)" },
  { tag: t.variableName, color: "var(--md-code-plain)" },
  { tag: t.definition(t.variableName), color: "var(--md-code-plain)" },
  { tag: t.function(t.variableName), color: "var(--md-code-function)" },
  { tag: t.function(t.propertyName), color: "var(--md-code-function)" },
  { tag: t.operator, color: "var(--md-code-operator)" },
  { tag: t.punctuation, color: "var(--md-code-punctuation)" },
  { tag: t.bracket, color: "var(--md-code-punctuation)" },
  { tag: t.paren, color: "var(--md-code-punctuation)" },
  { tag: t.squareBracket, color: "var(--md-code-punctuation)" },
  { tag: t.brace, color: "var(--md-code-punctuation)" },
  { tag: t.meta, color: "var(--md-code-comment)" },
  { tag: t.invalid, color: "var(--md-code-string)" },

  // Blocks.
  { tag: t.quote, color: "var(--md-quote-text)", fontStyle: "italic" },
  { tag: t.contentSeparator, color: "var(--md-marker)" }, // --- thematic break
  { tag: t.labelName, color: "var(--mm-faint)" }, // ```lang info, [link labels]
  { tag: t.atom, color: "var(--md-checkbox)", fontWeight: "700" }, // [ ] / [x] task markers
]);

/** Highlight extension for Source fenced code blocks. */
export const macMarkdownSyntaxHighlighting: Extension = syntaxHighlighting(macMarkdownHighlight);

/**
 * Editor chrome: flat theme surface, accent caret, neutral selection wash,
 * prose-first type. The editor face/size are indirected through
 * `--mm-font-editor` / `--mm-editor-size` so the Aa picker can swap them.
 */
const macMarkdownChrome = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--mm-text)",
    fontSize: "var(--mm-editor-size, var(--mm-text-base))",
  },
  ".cm-scroller": {
    fontFamily: "var(--mm-font-editor, var(--mm-font-sans))",
    lineHeight: "var(--mm-lh-body)",
    padding: "var(--mm-space-4) var(--mm-space-5)",
  },
  ".cm-content": {
    caretColor: "var(--mm-accent)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--mm-accent)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--mm-sel)",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

export const macMarkdownEditorTheme: Extension = [
  macMarkdownChrome,
  macMarkdownSyntaxHighlighting,
];
