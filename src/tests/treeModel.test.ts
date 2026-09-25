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
});
