import { describe, it, expect } from "vitest";
import { hasOpenableExtension, parseOpenFileArgs } from "../services/argvParser";

describe("parseOpenFileArgs (issue #25)", () => {
  it("collects file args from a packaged Linux launch", () => {
    expect(
      parseOpenFileArgs(["/opt/mac-markdown-workspace/mac-markdown-workspace", "/tmp/a.md", "/tmp/b.markdown"]),
    ).toEqual(["/tmp/a.md", "/tmp/b.markdown"]);
  });

  it("keeps paths with spaces and Unicode", () => {
    expect(
      parseOpenFileArgs([
        "mac-markdown-workspace",
        "/tmp/my notes.md",
        "/tmp/日本語.md",
      ]),
    ).toEqual(["/tmp/my notes.md", "/tmp/日本語.md"]);
  });

  it("treats a leading-dash Markdown name as a file", () => {
    expect(parseOpenFileArgs(["electron", "-notes.md"])).toEqual(["-notes.md"]);
    expect(parseOpenFileArgs(["electron", "--", "-dash.md", "ok.md"])).toEqual(["-dash.md", "ok.md"]);
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

  it("does not treat --user-data-dir's value as a Markdown file", () => {
    expect(
      parseOpenFileArgs([
        "electron",
        "--user-data-dir=/tmp/not-a-note",
        "main.js",
        "/tmp/note.md",
      ]),
    ).toEqual(["/tmp/note.md"]);
  });

  it("dedupes identical paths and ignores empty tokens after --", () => {
    expect(parseOpenFileArgs(["app", "a.md", "a.md", "--", "a.md", ""])).toEqual(["a.md"]);
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
