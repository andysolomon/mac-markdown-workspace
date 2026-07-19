/**
 * Bear-like ordered-list restarts: a same-indent `1.` / `1)` after a blank
 * line starts a new ordered list. CommonMark otherwise merges those into one
 * loose `<ol>`, so Preview/WYSIWYG would continue numbering (8. Colors…).
 */

import type { List, ListItem, Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import type { VFile } from "vfile";

const ORDERED_ONE_RE = /^\s*1[.)]/;

function lineAt(source: string, offset: number): string {
  const from = source.lastIndexOf("\n", offset - 1) + 1;
  let to = source.indexOf("\n", offset);
  if (to === -1) to = source.length;
  return source.slice(from, to);
}

function hasBlankLineBetween(
  source: string,
  prevEndOffset: number,
  nextStartOffset: number,
): boolean {
  if (nextStartOffset <= prevEndOffset) return false;
  return /\n[ \t]*\n/.test(source.slice(prevEndOffset, nextStartOffset));
}

function startsWithOrderedOne(source: string, item: ListItem): boolean {
  const offset = item.position?.start?.offset;
  if (offset == null) return false;
  return ORDERED_ONE_RE.test(lineAt(source, offset));
}

function splitOrderedList(list: List, source: string): List[] | null {
  if (!list.ordered || list.children.length < 2) return null;

  const chunks: ListItem[][] = [];
  let current: ListItem[] = [];

  for (let i = 0; i < list.children.length; i++) {
    const item = list.children[i];
    const prev = list.children[i - 1];
    if (
      i > 0 &&
      startsWithOrderedOne(source, item) &&
      hasBlankLineBetween(
        source,
        prev.position?.end?.offset ?? 0,
        item.position?.start?.offset ?? 0,
      )
    ) {
      chunks.push(current);
      current = [item];
    } else {
      current.push(item);
    }
  }
  chunks.push(current);

  if (chunks.length < 2) return null;

  return chunks.map((children) => {
    const next: List = {
      type: "list",
      ordered: true,
      start: 1,
      spread: children.some((child) => child.spread),
      children,
    };
    return next;
  });
}

function processParent(parent: { children: RootContent[] }, source: string): void {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];

    // Depth-first so nested lists split before their parents are considered.
    if (child && typeof child === "object" && "children" in child && Array.isArray(child.children)) {
      processParent(child as { children: RootContent[] }, source);
    }

    if (!child || child.type !== "list") continue;
    const lists = splitOrderedList(child, source);
    if (!lists) continue;
    parent.children.splice(i, 1, ...lists);
    i += lists.length - 1;
  }
}

/**
 * Remark plugin: split ordered lists when a blank line is followed by `1.`/`1)`.
 */
export const remarkSplitOrderedListRestarts: Plugin<[], Root> = function remarkSplitOrderedListRestarts() {
  return (tree: Root, file: VFile) => {
    const source = String(file.value ?? "");
    if (!source) return;
    processParent(tree, source);
  };
};

export default remarkSplitOrderedListRestarts;
