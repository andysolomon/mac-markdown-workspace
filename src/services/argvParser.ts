/**
 * Parse CLI argv for Markdown files the host should import (issue #25).
 *
 * Packaged launches look like `mac-markdown-workspace file.md`. Unpackaged /
 * Playwright launches prefix Electron/Chromium switches and a `.js` entry.
 * `--` ends switch parsing so a leading-dash name (`-notes.md`) is a file.
 */

export const OPENABLE_EXTENSIONS = [".md", ".markdown", ".mdx", ".txt"] as const;

const FLAGS_WITH_VALUE = new Set([
  "--user-data-dir",
  "--remote-debugging-port",
  "--inspect",
  "--inspect-brk",
  "--inspect-port",
  "--js-flags",
  "--ozone-platform",
  "--display",
  "--app",
  "--host-rules",
  "--proxy-server",
  "--proxy-bypass-list",
  "--log-net-log",
  "--disk-cache-dir",
  "--lang",
  "--locale",
]);

export function hasOpenableExtension(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return OPENABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function parseOpenFileArgs(argv: string[]): string[] {
  const files: string[] = [];
  let rest = false;
  let skipNext = false;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (rest) {
      files.push(arg);
      continue;
    }
    if (arg === "--") {
      rest = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const flag = eq === -1 ? arg : arg.slice(0, eq);
      if (eq === -1 && FLAGS_WITH_VALUE.has(flag)) skipNext = true;
      continue;
    }
    if (arg === "." || arg === "..") continue;
    if (arg.startsWith("-psn_")) continue;
    if (arg.startsWith("-") && !hasOpenableExtension(arg)) continue;
    if (/\.(js|mjs|cjs|asar)$/i.test(arg) && !hasOpenableExtension(arg)) continue;
    files.push(arg);
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const file of files) {
    if (!file || seen.has(file)) continue;
    seen.add(file);
    unique.push(file);
  }
  return unique;
}
