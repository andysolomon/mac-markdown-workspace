import { describe, it, expect } from "vitest";
import { parseTree, extractTreeFences } from "../services/treeModel";

describe("parseTree", () => {
  it("parses indented trees with trailing slash directories", () => {
    const entries = parseTree(`project/
  src/
    index.ts
  README.md`);
    expect(entries).toContainEqual({ relativePath: "project", kind: "dir" });
    expect(entries).toContainEqual({ relativePath: "project/src", kind: "dir" });
    expect(entries).toContainEqual({ relativePath: "project/src/index.ts", kind: "file" });
    expect(entries).toContainEqual({ relativePath: "project/README.md", kind: "file" });
  });

  it("parses box-drawing trees", () => {
    const entries = parseTree(`app/
├── lib/
│   └── util.ts
└── main.ts`);
    expect(entries).toContainEqual({ relativePath: "app", kind: "dir" });
    expect(entries).toContainEqual({ relativePath: "app/lib", kind: "dir" });
    expect(entries).toContainEqual({ relativePath: "app/lib/util.ts", kind: "file" });
    expect(entries).toContainEqual({ relativePath: "app/main.ts", kind: "file" });
  });

  it("implicitly creates parent directories for nested files", () => {
    const entries = parseTree(`a/b/c.txt`);
    expect(entries).toEqual([
      { relativePath: "a", kind: "dir" },
      { relativePath: "a/b", kind: "dir" },
      { relativePath: "a/b/c.txt", kind: "file" },
    ]);
  });

  it("rejects unsafe path segments", () => {
    const entries = parseTree(`../escape
/rooted
safe/ok.txt`);
    expect(entries).toEqual([
      { relativePath: "safe", kind: "dir" },
      { relativePath: "safe/ok.txt", kind: "file" },
    ]);
  });

  it("treats tabs as two spaces for depth", () => {
    const entries = parseTree(`root/
\tchild.txt`);
    expect(entries).toContainEqual({ relativePath: "root/child.txt", kind: "file" });
  });
});

describe("extractTreeFences", () => {
  it("extracts tree and filesystem fence bodies", () => {
    const md = `# Note

\`\`\`tree
alpha/
  beta.txt
\`\`\`

\`\`\`filesystem title-hint
gamma/
\`\`\`

\`\`\`js
not-a-tree
\`\`\`
`;
    expect(extractTreeFences(md)).toEqual(["alpha/\n  beta.txt", "gamma/"]);
  });

  it("returns empty array when no tree fences exist", () => {
    expect(extractTreeFences("```txt\nhello\n```")).toEqual([]);
  });
});
