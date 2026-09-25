import { describe, it, expect } from "vitest";
import { buildStandaloneHtml } from "../services/exportHtml";

describe("buildStandaloneHtml", () => {
  it("escapes markup in the title", () => {
    const doc = buildStandaloneHtml("<p>x</p>", `A <"quoted"> & title`);
    expect(doc).toContain("<title>A &lt;&quot;quoted&quot;&gt; &amp; title</title>");
    expect(doc).not.toContain(`<title>A <"quoted">`);
  });
});
