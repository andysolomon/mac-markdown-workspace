import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  wrapSelection: vi.fn(),
  toggleLinePrefix: vi.fn(),
  indentLine: vi.fn(),
  insertLink: vi.fn(),
  scrollCursorIntoView: vi.fn(),
}));

vi.mock("../services/editorBridge", () => bridge);

import { MarkdownAccessoryBar } from "../components/shell/MarkdownAccessoryBar";

type ViewportListener = (event: Event) => void;

function createViewport() {
  const listeners = new Map<string, Set<ViewportListener>>();
  const addEventListener = vi.fn((type: string, listener: ViewportListener) => {
    const callbacks = listeners.get(type) ?? new Set<ViewportListener>();
    callbacks.add(listener);
    listeners.set(type, callbacks);
  });
  const removeEventListener = vi.fn((type: string, listener: ViewportListener) => {
    listeners.get(type)?.delete(listener);
  });

  return {
    viewport: {
      height: 390,
      offsetTop: 0,
      addEventListener,
      removeEventListener,
    },
    emit(type: string) {
      for (const listener of listeners.get(type) ?? []) listener(new Event(type));
    },
    addEventListener,
    removeEventListener,
  };
}

describe("MarkdownAccessoryBar keyboard viewport", () => {
  let viewport: ReturnType<typeof createViewport>;

  beforeEach(() => {
    bridge.scrollCursorIntoView.mockClear();
    viewport = createViewport();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport.viewport,
    });
  });

  afterEach(() => {
    document.documentElement.style.removeProperty("--mm-kb-offset");
    document.documentElement.style.removeProperty("--mm-kb-inset");
    vi.restoreAllMocks();
  });

  it("publishes geometry and refreshes the caret for viewport events", () => {
    const windowAdd = vi.spyOn(window, "addEventListener");
    const { unmount } = render(<MarkdownAccessoryBar />);

    expect(document.documentElement.style.getPropertyValue("--mm-kb-offset")).toBe("454px");
    expect(document.documentElement.style.getPropertyValue("--mm-kb-inset")).toBe("504px");
    expect(bridge.scrollCursorIntoView).toHaveBeenCalled();
    expect(viewport.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(viewport.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(windowAdd).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(windowAdd).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      expect.objectContaining({ capture: true, passive: true }),
    );

    viewport.viewport.height = 520;
    viewport.viewport.offsetTop = 40;
    act(() => viewport.emit("resize"));
    expect(document.documentElement.style.getPropertyValue("--mm-kb-offset")).toBe("284px");
    expect(document.documentElement.style.getPropertyValue("--mm-kb-inset")).toBe("334px");

    act(() => window.dispatchEvent(new Event("scroll")));
    expect(bridge.scrollCursorIntoView.mock.calls.length).toBeGreaterThanOrEqual(3);

    unmount();
    expect(viewport.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(viewport.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(document.documentElement.style.getPropertyValue("--mm-kb-offset")).toBe("0px");
    expect(document.documentElement.style.getPropertyValue("--mm-kb-inset")).toBe("0px");
  });
});
