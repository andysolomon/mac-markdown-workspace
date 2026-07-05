import { describe, it, expect } from "vitest";
import { deriveTitle, derivePreview, extractTags, buildNote } from "../services/notesModel";

describe("deriveTitle", () => {
  it("uses the first heading, stripped of markers", () => {
    expect(deriveTitle("# Hello World\n\nbody")).toBe("Hello World");
    expect(deriveTitle("### Deep\n")).toBe("Deep");
  });

  it("uses the first non-empty line when there is no heading", () => {
    expect(deriveTitle("\n\nJust text\nmore")).toBe("Just text");
  });

  it("falls back to Untitled for empty content", () => {
    expect(deriveTitle("")).toBe("Untitled");
    expect(deriveTitle("   \n\n")).toBe("Untitled");
    expect(deriveTitle("#   \n")).toBe("Untitled");
  });
});

describe("derivePreview", () => {
  it("returns the first line after the title", () => {
    expect(derivePreview("# Title\nFirst body line\nsecond")).toBe("First body line");
  });

  it("skips blank lines and de-marks list/quote prefixes", () => {
    expect(derivePreview("# Title\n\n- a bullet")).toBe("a bullet");
    expect(derivePreview("Title\n> quoted")).toBe("quoted");
  });

  it("is empty for single-line notes", () => {
    expect(derivePreview("# Only a title")).toBe("");
  });
});

describe("extractTags", () => {
  it("extracts inline hashtags", () => {
    expect(extractTags("Notes about #App and #automation here")).toEqual(["App", "automation"]);
  });

  it("does NOT treat heading markers as tags", () => {
    expect(extractTags("# Heading\n## Subheading\nbody")).toEqual([]);
  });

  it("ignores # inside inline and fenced code", () => {
    expect(extractTags("run `#nope` inline")).toEqual([]);
    expect(extractTags("```\n#alsoNope\n```\n#yes")).toEqual(["yes"]);
  });

  it("does not match # in the middle of a URL", () => {
    expect(extractTags("see https://x.com/page#section for more")).toEqual([]);
  });

  it("supports nested tag paths and dedupes repeats", () => {
    expect(extractTags("#work/todo #work/todo #Work")).toEqual(["work/todo", "Work"]);
  });

  it("dedupes case-insensitively, keeping the first casing", () => {
    expect(extractTags("#App #app #APP")).toEqual(["App"]);
  });

  it("preserves distinct casings as separate tags", () => {
    expect(extractTags("#App #application #baLance")).toEqual(["App", "application", "baLance"]);
  });
});

describe("buildNote", () => {
  it("enriches a raw note with derived fields", () => {
    const note = buildNote({ id: "n1", body: "# Roadmap\nShip it #App", updatedAt: 42 });
    expect(note).toEqual({
      id: "n1",
      body: "# Roadmap\nShip it #App",
      updatedAt: 42,
      title: "Roadmap",
      preview: "Ship it #App",
      tags: ["App"],
    });
  });
});
