import React from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ViewportProbe, viewportProbeRequested } from "../components/shell/ViewportProbe";

describe("ViewportProbe", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("is only requested with ?viewport-debug", () => {
    expect(viewportProbeRequested()).toBe(false);
    window.history.replaceState(null, "", "/?viewport-debug");
    expect(viewportProbeRequested()).toBe(true);
  });

  it("prints the live geometry and outlines the shell until unmounted", () => {
    const { container, unmount } = render(<ViewportProbe />);
    expect(container.textContent).toMatch(/inner \d+×\d+/);
    expect(document.documentElement.hasAttribute("data-mm-viewport-debug")).toBe(true);
    unmount();
    expect(document.documentElement.hasAttribute("data-mm-viewport-debug")).toBe(false);
  });
});
