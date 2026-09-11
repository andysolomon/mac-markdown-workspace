import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const palettes = ["teal", "forest", "gold", "crimson", "blue", "olive", "graphite", "red"];
const selectionTokens = ["--mm-selection-bg", "--mm-selection-text"];

function ruleBody(css: string, selector: string): string {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`missing CSS rule: ${selector}`);
  return match[1];
}

function tokenValue(body: string, token: string): string {
  const match = body.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!match) throw new Error(`missing ${token}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`invalid color: ${hex}`);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(background: string, foreground: string): number {
  const lighter = Math.max(luminance(background), luminance(foreground));
  const darker = Math.min(luminance(background), luminance(foreground));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("selected-text contrast", () => {
  it("uses dedicated tokens for global and CodeMirror selection styling", () => {
    const globalCss = read("src/index.css");
    const editorTheme = read("src/services/markdownEditorTheme.ts");

    expect(globalCss).toMatch(
      /::selection[\s\S]*background-color:\s*var\(--mm-selection-bg\)[\s\S]*color:\s*var\(--mm-selection-text\)/,
    );
    expect(editorTheme).toMatch(
      /cm-selectionLayer \.cm-selectionBackground[\s\S]*backgroundColor:\s*"var\(--mm-selection-bg\)/,
    );
    expect(editorTheme).toMatch(
      /\.cm-line::selection, \.cm-line ::selection[\s\S]*color:\s*"var\(--mm-selection-text\)/,
    );
    expect(editorTheme).not.toMatch(/selectionBackground[\s\S]*var\(--mm-sel\)/);
  });

  it("resolves AA-level selection contrast for every palette and mode", () => {
    const lightTokens = read("src/styles/tokens/colors.css");
    const darkTokens = read("src/styles/tokens/colors-dark.css");
    const extraTokens = read("src/styles/tokens/colors-extra.css");
    const lightCss = `${lightTokens}\n${extraTokens}`;
    const darkCss = `${darkTokens}\n${extraTokens}`;

    for (const palette of palettes) {
      const lightSelector =
        palette === "teal"
          ? `:root,\\s*\\[data-theme="teal"\\]`
          : `\\[data-theme="${palette}"\\]`;
      const darkSelector = `\\[data-theme="${palette}"\\]\\[data-mode="dark"\\]`;
      const lightBody = ruleBody(lightCss, lightSelector);
      const darkBody = ruleBody(darkCss, darkSelector);

      for (const token of selectionTokens) {
        expect(lightBody).toMatch(new RegExp(`${token}:\\s*#[0-9a-f]{6}`, "i"));
        expect(darkBody).toMatch(new RegExp(`${token}:\\s*#[0-9a-f]{6}`, "i"));
      }

      expect(contrastRatio(tokenValue(lightBody, selectionTokens[0]), tokenValue(lightBody, selectionTokens[1]))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokenValue(darkBody, selectionTokens[0]), tokenValue(darkBody, selectionTokens[1]))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
