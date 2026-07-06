/**
 * Standalone HTML export (issues #2, #3 / W-000002, W-000003).
 *
 * Wraps rendered note HTML in a self-contained document. The active theme's
 * token values are resolved at export time from the live document, so the
 * file carries the reader's palette/mode/typography with zero external
 * dependencies.
 */

const TOKEN_VARS = [
  "--mm-bg",
  "--mm-text",
  "--mm-faint",
  "--mm-accent",
  "--mm-link",
  "--mm-code",
  "--mm-code-bg",
  "--mm-border",
  "--mm-sel",
  "--mm-font-sans",
  "--mm-font-mono",
  "--mm-font-editor",
  "--mm-lh-body",
  "--mm-lh-heading",
  "--md-marker",
  "--md-h1",
  "--md-strike",
  "--md-quote-bar",
  "--md-quote-text",
  "--md-table-rule",
  "--md-rule",
  "--md-bold-weight",
] as const;

function resolvedTokens(): string {
  const cs = getComputedStyle(document.documentElement);
  return TOKEN_VARS.map((v) => {
    const value = cs.getPropertyValue(v).trim();
    return value ? `  ${v}: ${value};` : null;
  })
    .filter(Boolean)
    .join("\n");
}

const READING_CSS = `
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  max-width: 760px;
  padding: 48px 32px 96px;
  background: var(--mm-bg);
  color: var(--mm-text);
  font-family: var(--mm-font-editor, var(--mm-font-sans));
  font-size: 20px;
  line-height: var(--mm-lh-body, 1.62);
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4, h5, h6 { line-height: var(--mm-lh-heading, 1.25); font-weight: 800; margin: 1.25em 0 0.4em; }
h1 { color: var(--md-h1); font-size: 1.9em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1.1em; }
h5, h6 { color: var(--mm-faint); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.9em; }
ul li::marker, ol li::marker { color: var(--md-marker); font-weight: 700; }
input[type="checkbox"] { accent-color: var(--md-marker); }
strong { font-weight: var(--md-bold-weight, 800); }
del, s { color: var(--md-strike); }
a { color: var(--mm-link); text-decoration: underline; text-underline-offset: 3px; }
blockquote { margin: 1em 0; padding-left: 16px; border-left: 3px solid var(--md-quote-bar); color: var(--md-quote-text); font-style: italic; }
code { font-family: var(--mm-font-mono); color: var(--mm-code); background: var(--mm-code-bg); padding: 2px 6px; border-radius: 5px; font-size: 0.86em; }
pre { background: var(--mm-code-bg); border-radius: 10px; padding: 14px 20px; overflow-x: auto; }
pre code { background: transparent; padding: 0; color: var(--mm-text); }
hr { border: none; border-top: 1px solid var(--md-rule); margin: 2em 0; }
table { border-collapse: collapse; margin: 1em 0; font-size: 0.9em; }
th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--md-table-rule); font-weight: 800; background: var(--mm-code-bg); }
td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--mm-border); }
img { max-width: 100%; }
@media print {
  body { max-width: none; padding: 0; }
  @page { margin: 18mm; }
}
`;

export function buildStandaloneHtml(html: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root {
${resolvedTokens()}
}
${READING_CSS}
</style>
</head>
<body>
${html}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/**
 * Print a standalone document without the app chrome: render it into a
 * hidden iframe and print that frame (web PDF export path).
 */
export function printStandaloneHtml(standaloneHtml: string): boolean {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(standaloneHtml);
  doc.close();

  const cleanup = () => window.setTimeout(() => iframe.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once: true });
  // Fallback cleanup in case afterprint never fires.
  window.setTimeout(cleanup, 60_000);

  // Give the frame a tick to layout before printing.
  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 50);
  return true;
}
