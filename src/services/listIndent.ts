/**
 * List-aware indent/outdent for Source mode.
 *
 * CommonMark needs ≥4 spaces under an ordered item for a nested list.
 * Indenting also resets ordered markers so a child starts at `1.` and
 * parent siblings are renumbered independently.
 */

export const LIST_INDENT_UNIT = "    ";
export const LIST_INDENT_WIDTH = LIST_INDENT_UNIT.length;

const LIST_LINE_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/;

export interface ParsedListLine {
  indent: number;
  indentSpaces: string;
  marker: string;
  ordered: boolean;
  delimiter: "." | ")" | null;
  afterMarker: string;
  content: string;
  /** Index where list content (after marker + spacing) begins. */
  markerEnd: number;
}

export function parseListLine(line: string): ParsedListLine | null {
  const match = LIST_LINE_RE.exec(line);
  if (!match) return null;
  const indentSpaces = match[1];
  const marker = match[2];
  const afterMarker = match[3];
  const content = match[4];
  const ordered = /^\d+[.)]$/.test(marker);
  const delimiter = ordered ? (marker.slice(-1) as "." | ")") : null;
  return {
    indent: indentSpaces.length,
    indentSpaces,
    marker,
    ordered,
    delimiter,
    afterMarker,
    content,
    markerEnd: indentSpaces.length + marker.length + afterMarker.length,
  };
}

/** Indent one line by 4 spaces; ordered items reset to `1.` / `1)`. */
export function indentListLine(line: string): string {
  const parsed = parseListLine(line);
  if (!parsed) return LIST_INDENT_UNIT + line;
  if (parsed.ordered && parsed.delimiter) {
    return (
      LIST_INDENT_UNIT +
      parsed.indentSpaces +
      "1" +
      parsed.delimiter +
      parsed.afterMarker +
      parsed.content
    );
  }
  return LIST_INDENT_UNIT + line;
}

/** Outdent one line by up to 4 leading spaces. */
export function outdentListLine(line: string): string {
  if (line.startsWith(LIST_INDENT_UNIT)) return line.slice(LIST_INDENT_WIDTH);
  const leading = /^ {1,4}/.exec(line);
  if (leading) return line.slice(leading[0].length);
  return line;
}

function rewriteOrderedNumber(line: string, n: number): string {
  const parsed = parseListLine(line);
  if (!parsed?.ordered || !parsed.delimiter) return line;
  return (
    parsed.indentSpaces + String(n) + parsed.delimiter + parsed.afterMarker + parsed.content
  );
}

/**
 * Renumber contiguous ordered list items that share the indent of
 * `lines[startIndex]`. Deeper-indented children are skipped; a blank,
 * non-list, bullet, or shallower line ends the run.
 */
export function renumberOrderedSiblings(lines: string[], startIndex: number): string[] {
  if (startIndex < 0 || startIndex >= lines.length) return lines;
  const target = parseListLine(lines[startIndex]);
  if (!target?.ordered) return lines;
  const indent = target.indent;

  let start = startIndex;
  for (let i = startIndex - 1; i >= 0; i--) {
    const parsed = parseListLine(lines[i]);
    if (!parsed) break;
    if (parsed.indent > indent) continue;
    if (parsed.indent < indent) break;
    if (!parsed.ordered) break;
    start = i;
  }

  const result = lines.slice();
  let n = 1;
  for (let i = start; i < result.length; i++) {
    const parsed = parseListLine(result[i]);
    if (!parsed) break;
    if (parsed.indent > indent) continue;
    if (parsed.indent < indent) break;
    if (!parsed.ordered) break;
    result[i] = rewriteOrderedNumber(result[i], n++);
  }
  return result;
}

function findOrderedAtIndent(lines: string[], around: number, indent: number): number {
  for (const i of [around - 1, around + 1, around]) {
    if (i < 0 || i >= lines.length) continue;
    const parsed = parseListLine(lines[i]);
    if (parsed?.ordered && parsed.indent === indent) return i;
  }
  // Scan outward for a same-indent ordered sibling past nested children.
  for (let i = around - 1; i >= 0; i--) {
    const parsed = parseListLine(lines[i]);
    if (!parsed) break;
    if (parsed.indent > indent) continue;
    if (parsed.indent < indent) break;
    if (parsed.ordered) return i;
    break;
  }
  for (let i = around + 1; i < lines.length; i++) {
    const parsed = parseListLine(lines[i]);
    if (!parsed) break;
    if (parsed.indent > indent) continue;
    if (parsed.indent < indent) break;
    if (parsed.ordered) return i;
    break;
  }
  return -1;
}

export type ListIndentDirection = "indent" | "outdent";

export interface ListIndentResult {
  lines: string[];
  /** True when the target line (or sibling numbers) changed. */
  changed: boolean;
  /** Character-offset delta for a cursor that was on the target line. */
  cursorDelta: number;
}

/**
 * Indent or outdent `lines[lineIndex]` and renumber ordered siblings at
 * both the old and new indent levels.
 */
export function applyListIndent(
  lines: string[],
  lineIndex: number,
  direction: ListIndentDirection,
): ListIndentResult {
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { lines, changed: false, cursorDelta: 0 };
  }

  const oldLine = lines[lineIndex];
  const oldParsed = parseListLine(oldLine);
  // Non-list lines: only Tab-indent (not outdent) with plain spaces, and
  // only when the caller already decided to handle the line.
  const newLine =
    direction === "indent" ? indentListLine(oldLine) : outdentListLine(oldLine);

  if (newLine === oldLine) {
    return { lines, changed: false, cursorDelta: 0 };
  }

  const leadingSpaces = /^ */.exec(oldLine)?.[0].length ?? 0;
  const oldIndent = oldParsed?.indent ?? leadingSpaces;
  let next = lines.slice();
  next[lineIndex] = newLine;

  const newParsed = parseListLine(newLine);
  if (newParsed?.ordered) {
    next = renumberOrderedSiblings(next, lineIndex);
  }

  if (oldParsed?.ordered) {
    const seed = findOrderedAtIndent(next, lineIndex, oldIndent);
    if (seed >= 0) next = renumberOrderedSiblings(next, seed);
  }

  const changed = next.some((line, i) => line !== lines[i]);
  return {
    lines: next,
    changed,
    cursorDelta: newLine.length - oldLine.length,
  };
}

/** True when the line is a markdown list item (bullet or ordered). */
export function isListLine(line: string): boolean {
  return parseListLine(line) !== null;
}
