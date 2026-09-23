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
import { ACCESSORY_BAR_HEIGHT, IOS_SAFARI_URL_PILL_CLEARANCE } from "../services/editorViewport";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: userAgent });
}

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
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0.0.0");
    delete (window as { Capacitor?: unknown }).Capacitor;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport.viewport,
    });
  });

  afterEach(() => {
    document.documentElement.style.removeProperty("--mm-kb-offset");
    document.documentElement.style.removeProperty("--mm-kb-inset");
    delete (window as { Capacitor?: unknown }).Capacitor;
    vi.restoreAllMocks();
  });

  it("publishes geometry and refreshes the caret for viewport events", () => {
    const windowAdd = vi.spyOn(window, "addEventListener");
    const { unmount } = render(<MarkdownAccessoryBar />);

    expect(document.documentElement.style.getPropertyValue("--mm-kb-offset")).toBe("454px");
    expect(document.documentElement.style.getPropertyValue("--mm-kb-inset")).toBe(
      `${454 + ACCESSORY_BAR_HEIGHT}px`,
    );
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
    expect(document.documentElement.style.getPropertyValue("--mm-kb-inset")).toBe(
      `${284 + ACCESSORY_BAR_HEIGHT}px`,
    );

    act(() => window.dispatchEvent(new Event("scroll")));
    expect(bridge.scrollCursorIntoView.mock.calls.length).toBeGreaterThanOrEqual(3);

    unmount();
    expect(viewport.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(viewport.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(document.documentElement.style.getPropertyValue("--mm-kb-offset")).toBe("0px");
    expect(document.documentElement.style.getPropertyValue("--mm-kb-inset")).toBe("0px");
  });

  it("lifts the bar above the Safari URL pill and keeps 44px controls", () => {
    setUserAgent(IPHONE_SAFARI);
    const { getAllByRole, unmount } = render(<MarkdownAccessoryBar />);
    const buttons = getAllByRole("button");

    expect(buttons.length).toBeGreaterThanOrEqual(7);
    expect(document.documentElement.style.getPropertyValue("--mm-kb-offset")).toBe(
      `${454 + IOS_SAFARI_URL_PILL_CLEARANCE}px`,
    );
    expect(document.documentElement.style.getPropertyValue("--mm-kb-inset")).toBe(
      `${454 + IOS_SAFARI_URL_PILL_CLEARANCE + ACCESSORY_BAR_HEIGHT}px`,
    );
    // The published offset clears a pill whose top is 64px above the keyboard.
    expect(IOS_SAFARI_URL_PILL_CLEARANCE).toBeGreaterThanOrEqual(64);

    unmount();
  });

  it("does not add URL-pill clearance in the native iOS shell", () => {
    setUserAgent(IPHONE_SAFARI);
    (window as { Capacitor?: { isNativePlatform: () => boolean } }).Capacitor = {
      isNativePlatform: () => true,
    };
    const { unmount } = render(<MarkdownAccessoryBar />);

    expect(document.documentElement.style.getPropertyValue("--mm-kb-offset")).toBe("454px");
    expect(document.documentElement.style.getPropertyValue("--mm-kb-inset")).toBe(
      `${454 + ACCESSORY_BAR_HEIGHT}px`,
    );

    unmount();
  });

  it("does not lift the bar for Safari chrome while the keyboard is closed", () => {
    setUserAgent(IPHONE_SAFARI);
    viewport.viewport.height = 754;
    const { unmount } = render(<MarkdownAccessoryBar />);

    expect(document.documentElement.style.getPropertyValue("--mm-kb-offset")).toBe("0px");
    expect(document.documentElement.style.getPropertyValue("--mm-kb-inset")).toBe(
      `${ACCESSORY_BAR_HEIGHT}px`,
    );

    unmount();
  });
});
