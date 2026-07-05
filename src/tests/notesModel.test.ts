import { describe, it, expect } from "vitest";
import {
  deriveTitle,
  derivePreview,
  extractTags,
  buildNote,
  buildTagIndex,
  filterNotes,
} from "../services/notesModel";

const note = (id: string, body: string, updatedAt = 0) => buildNote({ id, body, updatedAt });

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
    const built = buildNote({ id: "n1", body: "# Roadmap\nShip it #App", updatedAt: 42 });
    expect(built).toEqual({
      id: "n1",
      body: "# Roadmap\nShip it #App",
      updatedAt: 42,
      title: "Roadmap",
      preview: "Ship it #App",
      tags: ["App"],
    });
  });
});

describe("buildTagIndex", () => {
  it("counts tags across notes, sorted alphabetically (case-insensitive)", () => {
    const index = buildTagIndex([
      note("a", "#App and #work"),
      note("b", "#work again"),
      note("c", "no tags here"),
    ]);
    expect(index).toEqual([
      { tag: "App", count: 1 },
      { tag: "work", count: 2 },
    ]);
  });

  it("merges casings under one entry, keeping first-seen casing", () => {
    const index = buildTagIndex([note("a", "#App"), note("b", "#app")]);
    expect(index).toEqual([{ tag: "App", count: 2 }]);
  });

  it("is empty when no note has tags", () => {
    expect(buildTagIndex([note("a", "plain text")])).toEqual([]);
  });
});

describe("filterNotes", () => {
  const notes = [
    note("a", "# Roadmap\nShip the #app this quarter"),
    note("b", "# Groceries\nmilk and eggs"),
    note("c", "# App ideas\nbrainstorm #app #ideas"),
  ];

  it("returns all notes when no tag or query", () => {
    expect(filterNotes(notes, {}).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by tag (case-insensitive)", () => {
    expect(filterNotes(notes, { tag: "App" }).map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("searches title and body, all terms must match", () => {
    expect(filterNotes(notes, { query: "milk" }).map((n) => n.id)).toEqual(["b"]);
    expect(filterNotes(notes, { query: "app ideas" }).map((n) => n.id)).toEqual(["c"]);
    expect(filterNotes(notes, { query: "roadmap quarter" }).map((n) => n.id)).toEqual(["a"]);
  });

  it("combines tag and query", () => {
    expect(filterNotes(notes, { tag: "app", query: "brainstorm" }).map((n) => n.id)).toEqual(["c"]);
  });
});
