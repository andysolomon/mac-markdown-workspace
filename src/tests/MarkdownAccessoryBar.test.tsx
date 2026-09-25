import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  wrapSelection: vi.fn(),
  toggleLinePrefix: vi.fn(),
  indentLine: vi.fn(),
  insertLink: vi.fn(),
  revealCaretNow: vi.fn(),
}));

vi.mock("../services/editorBridge", () => bridge);

import { MarkdownAccessoryBar } from "../components/shell/MarkdownAccessoryBar";
import { EDITING_CARET_MARGIN, resetRememberedKeyboard } from "../services/editorViewport";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

function createViewport(height: number) {
  const events = new EventTarget();
  return {
    height,
    offsetTop: 0,
    addEventListener: (type: string, fn: EventListener) => events.addEventListener(type, fn),
    removeEventListener: (type: string, fn: EventListener) => events.removeEventListener(type, fn),
    emit(type: string) {
      events.dispatchEvent(new Event(type));
    },
  };
}

describe("MarkdownAccessoryBar", () => {
  let viewport: ReturnType<typeof createViewport>;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    vi.useFakeTimers();
    resetRememberedKeyboard();
    Object.values(bridge).forEach((fn) => fn.mockClear());
    frames = [];
    viewport = createViewport(874);
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: IPHONE_SAFARI });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 874 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((fn) => frames.push(fn));
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const runFrame = () => act(() => frames.splice(0).forEach((fn) => fn(0)));

  it("renders 44px formatting controls that keep the editor focused", () => {
    const { getAllByRole, getByRole, getByLabelText, unmount } = render(<MarkdownAccessoryBar />);
    expect(getByRole("toolbar", { name: "Markdown formatting" })).toBeTruthy();
    expect(getAllByRole("button")).toHaveLength(9);

    const bold = getByLabelText("Bold");
    // mousedown's default would move focus off the editor and drop the keyboard.
    expect(fireEvent.mouseDown(bold)).toBe(false);
    fireEvent.click(bold);
    expect(bridge.wrapSelection).toHaveBeenCalledWith("**");

    fireEvent.click(getByLabelText("Task"));
    expect(bridge.toggleLinePrefix).toHaveBeenCalledWith("- [ ] ");
    unmount();
  });

  it("pins the app above the keyboard for as long as it is mounted", () => {
    const { unmount } = render(<MarkdownAccessoryBar />);
    expect(document.documentElement.getAttribute("data-mm-editing")).toBe("pending");

    runFrame();
    expect(document.documentElement.getAttribute("data-mm-editing")).toBe("ready");
    expect(document.documentElement.getAttribute("data-mm-keyboard")).toBe("predicted");
    expect(bridge.revealCaretNow).toHaveBeenCalledWith(EDITING_CARET_MARGIN);

    viewport.height = 515;
    act(() => viewport.emit("resize"));
    expect(document.documentElement.getAttribute("data-mm-keyboard")).toBe("open");
    expect(document.documentElement.style.getPropertyValue("--mm-vv-height")).toBe("515px");

    unmount();
    expect(document.documentElement.hasAttribute("data-mm-editing")).toBe(false);
    expect(document.documentElement.hasAttribute("data-mm-keyboard")).toBe(false);
  });

  it("leaves the note freely scrollable while the keyboard is up", () => {
    const { unmount } = render(<MarkdownAccessoryBar />);
    runFrame();
    viewport.height = 515;
    act(() => viewport.emit("resize"));
    bridge.revealCaretNow.mockClear();

    // Scrolling the editor or the page must not drag the caret back.
    act(() => {
      viewport.emit("scroll");
      window.dispatchEvent(new Event("scroll"));
    });
    expect(bridge.revealCaretNow).not.toHaveBeenCalled();

    unmount();
  });
});
