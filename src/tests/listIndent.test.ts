import { describe, it, expect } from "vitest";
import { outdentListLine, applyListIndent } from "../services/listIndent";

describe("outdentListLine", () => {
  it("outdents by 4 spaces", () => {
    expect(outdentListLine("    1. Red")).toBe("1. Red");
    expect(outdentListLine("  - almost")).toBe("- almost");
    expect(outdentListLine("1. top")).toBe("1. top");
  });
});

describe("applyListIndent", () => {
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
});
