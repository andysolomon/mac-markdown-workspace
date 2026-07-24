import { describe, it, expect } from "vitest";
import { useDocumentStore } from "../services/documentStore";
import { useSettingsStore } from "../services/settingsStore";
import { buildStandaloneHtml } from "../services/exportHtml";

describe("app defaults", () => {
  it("opens in Source mode (issue #11)", () => {
    expect(useDocumentStore.getState().viewMode).toBe("source");
  });

  it("shows the toolbar and prefers iCloud storage by default", () => {
    const s = useSettingsStore.getState();
    expect(s.showToolbar).toBe(true);
    expect(s.iosStorage).toBe("icloud");
    expect(s.vimMode).toBe(false);
  });
});

describe("buildStandaloneHtml", () => {
  it("wraps rendered html in a complete self-contained document", () => {
    const doc = buildStandaloneHtml("<h1>Hello</h1><p>World</p>", "My Note");
    expect(doc.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(doc).toContain("<title>My Note</title>");
    expect(doc).toContain("<h1>Hello</h1><p>World</p>");
    expect(doc).toContain("@media print");
    expect(doc).not.toMatch(/https?:\/\/[^"']*\.(css|js|woff)/);
  });

  it("escapes markup in the title", () => {
    const doc = buildStandaloneHtml("<p>x</p>", `A <"quoted"> & title`);
    expect(doc).toContain("<title>A &lt;&quot;quoted&quot;&gt; &amp; title</title>");
    expect(doc).not.toContain(`<title>A <"quoted">`);
  });
});
