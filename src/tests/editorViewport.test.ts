import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMobileEditorBottomInset } from "../services/editorViewport";

describe("getMobileEditorBottomInset", () => {
  beforeEach(() => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      () => ({ matches: true }) as MediaQueryList,
    );
    document.documentElement.style.removeProperty("--mm-kb-inset");
  });

  afterEach(() => {
    document.documentElement.style.removeProperty("--mm-kb-inset");
    vi.restoreAllMocks();
  });

  it("keeps the existing mobile chrome clearance before the keyboard opens", () => {
    expect(getMobileEditorBottomInset()).toBe(88);
  });

  it("uses the larger keyboard-plus-accessory inset", () => {
    document.documentElement.style.setProperty("--mm-kb-inset", "504px");
    expect(getMobileEditorBottomInset()).toBe(504);
  });
});
