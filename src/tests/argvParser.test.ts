import { describe, it, expect } from "vitest";
import { hasOpenableExtension, parseOpenFileArgs } from "../services/argvParser";

describe("parseOpenFileArgs (issue #25)", () => {
  it("collects file args from a packaged Linux launch", () => {
    expect(
      parseOpenFileArgs(["/opt/mac-markdown-workspace/mac-markdown-workspace", "/tmp/a.md", "/tmp/b.markdown"]),
    ).toEqual(["/tmp/a.md", "/tmp/b.markdown"]);
  });

  it("skips Electron/Chromium switches and an unpackaged entry script", () => {
    expect(
      parseOpenFileArgs([
        "/usr/bin/electron",
        "--inspect=0",
        "--remote-debugging-pipe",
        "--user-data-dir",
        "/tmp/ud",
        "/home/me/app/.vite/build/main.js",
        "--",
        "/tmp/real.md",
      ]),
    ).toEqual(["/tmp/real.md"]);
  });

  it("skips macOS process-serial flags and the cwd placeholder", () => {
    expect(parseOpenFileArgs(["Electron", "-psn_0_12345", ".", "note.txt"])).toEqual(["note.txt"]);
  });
});

describe("hasOpenableExtension", () => {
  it("accepts Markdown and text suffixes only", () => {
    expect(hasOpenableExtension("x.md")).toBe(true);
    expect(hasOpenableExtension("X.MDX")).toBe(true);
    expect(hasOpenableExtension("a.png")).toBe(false);
    expect(hasOpenableExtension("no-ext")).toBe(false);
  });
});
