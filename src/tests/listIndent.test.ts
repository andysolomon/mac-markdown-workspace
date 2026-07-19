import { describe, it, expect } from "vitest";
import {
  LIST_INDENT_UNIT,
  LIST_INDENT_WIDTH,
  parseListLine,
  indentListLine,
  outdentListLine,
  renumberOrderedSiblings,
  applyListIndent,
  isListLine,
} from "../services/listIndent";

describe("LIST_INDENT_UNIT", () => {
  it("is four spaces", () => {
    expect(LIST_INDENT_UNIT).toBe("    ");
    expect(LIST_INDENT_WIDTH).toBe(4);
  });
});

describe("parseListLine", () => {
  it("parses ordered and bullet items", () => {
    expect(parseListLine("1. Colors")).toMatchObject({
      indent: 0,
      ordered: true,
      delimiter: ".",
      content: "Colors",
    });
    expect(parseListLine("  - Red")).toMatchObject({
      indent: 2,
      ordered: false,
      content: "Red",
    });
  });

  it("returns null for non-list lines", () => {
    expect(parseListLine("### Review")).toBeNull();
    expect(parseListLine("")).toBeNull();
    expect(isListLine("1. ok")).toBe(true);
    expect(isListLine("plain")).toBe(false);
  });
});

describe("indentListLine / outdentListLine", () => {
  it("indents ordered items by 4 spaces and resets the marker to 1", () => {
    expect(indentListLine("2. Red")).toBe("    1. Red");
    expect(indentListLine("3) Blue")).toBe("    1) Blue");
  });

  it("indents bullet items by 4 spaces without inventing numbers", () => {
    expect(indentListLine("- Red")).toBe("    - Red");
    expect(indentListLine("  * Blue")).toBe("      * Blue");
  });

  it("outdents by 4 spaces", () => {
    expect(outdentListLine("    1. Red")).toBe("1. Red");
    expect(outdentListLine("  - almost")).toBe("- almost");
    expect(outdentListLine("1. top")).toBe("1. top");
  });
});

describe("renumberOrderedSiblings", () => {
  it("renumbers same-indent ordered items and skips nested children", () => {
    const lines = ["1. Colors", "    1. Red", "    2. Blue", "4. Shapes", "    1. Square"];
    expect(renumberOrderedSiblings(lines, 3)).toEqual([
      "1. Colors",
      "    1. Red",
      "    2. Blue",
      "2. Shapes",
      "    1. Square",
    ]);
  });
});

describe("applyListIndent", () => {
  it("Tabs a child under a parent and resets numbering at both levels", () => {
    const before = ["1. Colors", "2. Red", "3. Blue", "4. Shapes"];
    const { lines, changed } = applyListIndent(before, 1, "indent");
    expect(changed).toBe(true);
    expect(lines).toEqual(["1. Colors", "    1. Red", "2. Blue", "3. Shapes"]);
  });

  it("nests a second child and renumbers the nested list", () => {
    const before = ["1. Colors", "    1. Red", "2. Blue", "3. Shapes"];
    const { lines } = applyListIndent(before, 2, "indent");
    expect(lines).toEqual(["1. Colors", "    1. Red", "    2. Blue", "2. Shapes"]);
  });

  it("produces the target Colors / Shapes / Cities shape", () => {
    let lines = [
      "1. Colors",
      "2. Red",
      "3. Blue",
      "4. Shapes",
      "5. Rectangle",
      "6. Square",
      "7. Cities",
      "8. Singapore",
      "9. New York",
    ];
    for (const index of [1, 2, 4, 5, 7, 8]) {
      lines = applyListIndent(lines, index, "indent").lines;
    }
    expect(lines).toEqual([
      "1. Colors",
      "    1. Red",
      "    2. Blue",
      "2. Shapes",
      "    1. Rectangle",
      "    2. Square",
      "3. Cities",
      "    1. Singapore",
      "    2. New York",
    ]);
  });

  it("Shift-Tabs a child back into the parent sequence", () => {
    const before = ["1. Colors", "    1. Red", "    2. Blue", "2. Shapes"];
    const { lines } = applyListIndent(before, 2, "outdent");
    expect(lines).toEqual(["1. Colors", "    1. Red", "2. Blue", "3. Shapes"]);
  });

  it("indents bullets without inventing numbers", () => {
    const before = ["- Colors", "- Red", "- Blue"];
    const { lines } = applyListIndent(before, 1, "indent");
    expect(lines).toEqual(["- Colors", "    - Red", "- Blue"]);
  });

  it("is a no-op when outdenting a top-level item", () => {
    const before = ["1. Colors", "2. Red"];
    const { lines, changed, cursorDelta } = applyListIndent(before, 0, "outdent");
    expect(changed).toBe(false);
    expect(cursorDelta).toBe(0);
    expect(lines).toEqual(before);
  });
});
