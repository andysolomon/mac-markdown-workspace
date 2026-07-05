/**
 * Platform-agnostic notes model + derivation.
 *
 * Storage shims (Electron/web/iOS) only move raw bytes: each note is a markdown
 * file/record identified by a stable `id`, with a `body` and an `updatedAt`.
 * Everything a UI needs — title, preview, tags — is DERIVED here from the body,
 * Bear-style, so it stays consistent across platforms and is unit-testable.
 */

export interface RawNote {
  id: string;
  body: string;
  updatedAt: number;
}

export interface Note extends RawNote {
  title: string;
  preview: string;
  tags: string[];
}

const HEADING_PREFIX = /^#{1,6}\s*/;

/** First non-empty line, with a leading heading marker stripped. */
export function deriveTitle(body: string): string {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const title = line.replace(HEADING_PREFIX, "").trim();
    return title || "Untitled";
  }
  return "Untitled";
}

/** The first meaningful line after the title, lightly de-marked, for the list. */
export function derivePreview(body: string): string {
  const lines = body.split("\n");
  let seenTitle = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!seenTitle) {
      seenTitle = true;
      continue;
    }
    return line
      .replace(HEADING_PREFIX, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^>\s?/, "")
      .trim();
  }
  return "";
}

/** Strip fenced and inline code so `#` inside code is never treated as a tag. */
function stripCode(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`\n]*`/g, " ");
}

const TAG_RE = /(^|\s)#([A-Za-z0-9_][A-Za-z0-9_/-]*)/g;

/**
 * Bear-style hashtags: `#word` preceded by whitespace or line-start. Excludes
 * heading markers (`# ` has a space after `#`), `#` inside code, and `#fragment`
 * in URLs (no preceding whitespace). Deduped, first-seen order and casing kept.
 */
export function extractTags(body: string): string[] {
  const text = stripCode(body);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const match of text.matchAll(TAG_RE)) {
    const tag = match[2].replace(/[/-]+$/, ""); // trailing separators aren't part of the tag
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** Enrich a raw note with derived title/preview/tags. */
export function buildNote(raw: RawNote): Note {
  return {
    ...raw,
    title: deriveTitle(raw.body),
    preview: derivePreview(raw.body),
    tags: extractTags(raw.body),
  };
}
