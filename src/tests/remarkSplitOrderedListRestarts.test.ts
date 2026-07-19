import { describe, it, expect } from "vitest";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import type { List, Root } from "mdast";
import { remarkSplitOrderedListRestarts } from "../services/remarkSplitOrderedListRestarts";

function process(md: string): Root {
  return remark().use(remarkGfm).use(remarkSplitOrderedListRestarts).runSync(
    remark().use(remarkGfm).parse(md),
    md,
  ) as Root;
}

function topLists(tree: Root): List[] {
  return tree.children.filter((c): c is List => c.type === "list");
}

describe("remarkSplitOrderedListRestarts", () => {
  it("splits when a blank line is followed by 1.", () => {
    const tree = process("1. a\n2. b\n\n1. c\n2. d\n");
    const lists = topLists(tree);
    expect(lists).toHaveLength(2);
    expect(lists[0].ordered).toBe(true);
    expect(lists[0].children).toHaveLength(2);
    expect(lists[1].ordered).toBe(true);
    expect(lists[1].start).toBe(1);
    expect(lists[1].children).toHaveLength(2);
  });

  it("does not split when a blank line is followed by 2. (continuation)", () => {
    const tree = process("1. a\n\n2. b\n");
    const lists = topLists(tree);
    expect(lists).toHaveLength(1);
    expect(lists[0].children).toHaveLength(2);
  });

  it("leaves nested ordered lists intact under a parent item", () => {
    const tree = process("1. Car\n    1. Levels\n        1. Moe Levels\n2. Bike\n");
    const lists = topLists(tree);
    expect(lists).toHaveLength(1);
    expect(lists[0].children).toHaveLength(2);
    const car = lists[0].children[0];
    const nested = car.children.find((c): c is List => c.type === "list");
    expect(nested?.ordered).toBe(true);
    expect(nested?.children).toHaveLength(1);
  });

  it("does not affect bullet lists", () => {
    const tree = process("- One\n\n- Two\n");
    const lists = topLists(tree);
    expect(lists).toHaveLength(1);
    expect(lists[0].ordered).toBe(false);
    expect(lists[0].children).toHaveLength(2);
  });

  it("splits the Review fixture into three ordered lists", () => {
    const md = `### Review
1. Claude-Code--Fable
2. Codex--Sol
3. Moonshot--Kimi-K3
4. Cursor--Fable
5. Cursor--Grok-4.5
6. MiniMax--M3
7. Cursor--Composer

1. Colors
2. Red
3. Blue
4. Shapes
5. Rectangle
6. Square
7. Cities
8. Singapore
9. New York

1. Car
    1. Levels
        1. Moe Levels
2. Bike
- One
    - Two

- Two
`;
    const tree = process(md);
    const lists = topLists(tree);
    const ordered = lists.filter((l) => l.ordered);
    const bullets = lists.filter((l) => !l.ordered);

    expect(ordered).toHaveLength(3);
    expect(ordered[0].children).toHaveLength(7);
    expect(ordered[1].children).toHaveLength(9);
    expect(ordered[1].start).toBe(1);
    expect(ordered[2].children).toHaveLength(2);

    // Colors is the first item of the second ordered list
    const colorsPara = ordered[1].children[0].children[0];
    expect(colorsPara.type).toBe("paragraph");
    if (colorsPara.type === "paragraph") {
      const text = colorsPara.children[0];
      expect(text.type).toBe("text");
      if (text.type === "text") expect(text.value).toBe("Colors");
    }

    expect(bullets.length).toBeGreaterThanOrEqual(1);
  });
});
