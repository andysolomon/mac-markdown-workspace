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
});

describe("derivePreview", () => {
  it("skips blank lines and de-marks list/quote prefixes", () => {
    expect(derivePreview("# Title\n\n- a bullet")).toBe("a bullet");
    expect(derivePreview("Title\n> quoted")).toBe("quoted");
  });
});

describe("extractTags", () => {
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
});

describe("buildTagIndex", () => {
  it("merges casings under one entry, keeping first-seen casing", () => {
    const index = buildTagIndex([note("a", "#App"), note("b", "#app")]);
    expect(index).toEqual([{ tag: "App", count: 2 }]);
  });
});

describe("filterNotes", () => {
  const notes = [
    note("a", "# Roadmap\nShip the #app this quarter"),
    note("b", "# Groceries\nmilk and eggs"),
    note("c", "# App ideas\nbrainstorm #app #ideas"),
  ];

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
