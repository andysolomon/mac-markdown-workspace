/** Pure parser for ASCII / box-drawing filesystem trees in markdown fences. */

export type TreeEntry = {
  relativePath: string;
  kind: "file" | "dir";
};

const BOX_LINE = /^((?:[│|][ \t]*)*)(?:[├└](?:─+|-+))[ \t]*(.+)$/;

function expandTabs(line: string): string {
  return line.replace(/\t/g, "  ");
}

function parseLine(line: string): { depth: number; name: string } | null {
  const trimmed = line.trimEnd();
  if (!trimmed.trim()) return null;

  const box = BOX_LINE.exec(trimmed);
  if (box) {
    const pipeCount = (box[1].match(/[│|]/g) ?? []).length;
    const name = box[2].trim();
    if (!name) return null;
    return { depth: pipeCount + 1, name };
  }

  const expanded = expandTabs(trimmed);
  const indentMatch = /^(\s*)(\S.*)$/.exec(expanded);
  if (!indentMatch) return null;
  const indent = indentMatch[1].length;
  const name = indentMatch[2].trim();
  if (!name) return null;
  return { depth: Math.floor(indent / 2), name };
}

function isUnsafeSegment(segment: string): boolean {
  return !segment || segment === "." || segment === "..";
}

function isUnsafePath(relativePath: string): boolean {
  if (!relativePath) return true;
  if (relativePath.startsWith("/") || relativePath.startsWith("\\")) return true;
  if (/^[A-Za-z]:[\\/]/.test(relativePath)) return true;
  const segments = relativePath.split("/");
  return segments.some(isUnsafeSegment);
}

function addEntry(
  byPath: Map<string, TreeEntry["kind"]>,
  relativePath: string,
  kind: TreeEntry["kind"],
): void {
  if (isUnsafePath(relativePath)) return;
  byPath.set(relativePath, kind);
  if (kind === "file") {
    const parts = relativePath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/");
      if (!byPath.has(parent)) byPath.set(parent, "dir");
    }
  }
}

function parseInlinePath(name: string): { relativePath: string; kind: TreeEntry["kind"] } | null {
  const isDir = name.endsWith("/");
  const raw = (isDir ? name.slice(0, -1) : name).trim();
  if (!raw.includes("/")) return null;
  const segments = raw.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some(isUnsafeSegment)) return null;
  if (raw.startsWith("/") || raw.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(raw)) return null;
  const relativePath = segments.join("/");
  return { relativePath, kind: isDir ? "dir" : "file" };
}

function normalizeSegment(name: string): { segment: string; isDir: boolean } | null {
  const isDir = name.endsWith("/");
  const segment = (isDir ? name.slice(0, -1) : name).trim();
  if (!segment || segment === "." || segment === "..") return null;
  if (segment.includes("/") || segment.includes("\\")) return null;
  if (/^[A-Za-z]:$/.test(segment)) return null;
  return { segment, isDir };
}

/** Parse an indented or box-drawing tree into normalized relative posix paths. */
export function parseTree(source: string): TreeEntry[] {
  const byPath = new Map<string, TreeEntry["kind"]>();
  const stack: string[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const parsed = parseLine(rawLine);
    if (!parsed) continue;

    const inline = parseInlinePath(parsed.name);
    if (inline) {
      addEntry(byPath, inline.relativePath, inline.kind);
      continue;
    }

    const segmentInfo = normalizeSegment(parsed.name);
    if (!segmentInfo) continue;

    const { segment, isDir } = segmentInfo;
    const depth = parsed.depth;
    stack.length = depth;
    stack.push(segment);

    const relativePath = stack.join("/");
    addEntry(byPath, relativePath, isDir ? "dir" : "file");
  }

  return [...byPath.entries()]
    .map(([relativePath, kind]) => ({ relativePath, kind }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

const FENCE_RE = /^```[ \t]*(tree|filesystem)(?:[ \t][^\n]*)?\r?\n([\s\S]*?)^```[ \t]*$/gim;

/** Extract fenced bodies whose info string starts with `tree` or `filesystem`. */
export function extractTreeFences(markdown: string): string[] {
  const fences: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(markdown)) !== null) {
    fences.push(match[2].replace(/\n$/, ""));
  }
  return fences;
}
