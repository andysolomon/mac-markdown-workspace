/* Unit tests for the lostSinceLastWindow side buffer in src/main.ts (issue
   #25 follow-ups). main.ts drives everything through Electron events, so the
   tests mock `electron` (plus electron-store and the squirrel-startup shim)
   and expose captured app/ipc handlers. The app's `whenReady` resolves via
   `h.readyResolve` so the initial window is created deterministically in
   beforeEach. */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

type Handler = (...args: unknown[]) => void;

interface FakeWindow {
  destroyed: boolean;
  on: Mock;
  webContents: { on: Mock; send: Mock };
}

const h = vi.hoisted(() => {
  const appHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const ipcOn = new Map<string, (...args: unknown[]) => void>();
  const windows: Array<Record<string, unknown>> = [];
  const quitSpy = vi.fn();
  const state = { readyResolve: null as null | (() => void) };
  return { appHandlers, ipcOn, windows, quitSpy, ...state };
});

vi.mock("electron", () => {
  const makeWindow = () => {
    const win: {
      destroyed: boolean;
      on: Mock;
      loadURL: Mock;
      loadFile: Mock;
      isDestroyed: Mock;
      isMinimized: Mock;
      show: Mock;
      restore: Mock;
      focus: Mock;
      close: Mock;
      destroy: Mock;
      webContents: { on: Mock; send: Mock; isDestroyed: Mock; isCrashed: Mock; setZoomLevel: Mock; getZoomLevel: Mock };
    } = {
      destroyed: false,
      on: vi.fn(),
      loadURL: vi.fn(async () => undefined),
      loadFile: vi.fn(async () => undefined),
      isDestroyed: vi.fn(() => win.destroyed),
      isMinimized: vi.fn(() => false),
      show: vi.fn(),
      restore: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
      destroy: vi.fn(),
      webContents: {
        on: vi.fn(),
        send: vi.fn(),
        isDestroyed: vi.fn(() => false),
        isCrashed: vi.fn(() => false),
        setZoomLevel: vi.fn(),
        getZoomLevel: vi.fn(() => 0),
      },
    };
    h.windows.push(win);
    return win;
  };
  const app = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const list = h.appHandlers.get(event) ?? [];
      list.push(handler);
      h.appHandlers.set(event, list);
    }),
    whenReady: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          h.readyResolve = resolve;
        }),
    ),
    requestSingleInstanceLock: vi.fn(() => true),
    quit: h.quitSpy,
    getPath: vi.fn(() => "/tmp/mmw-test-documents"),
    getVersion: vi.fn(() => "0.0.0-test"),
    name: "Mac Markdown Workspace",
  };
  const BrowserWindow = Object.assign(vi.fn(() => makeWindow()), {
    getFocusedWindow: vi.fn(() => h.windows[h.windows.length - 1] ?? null),
    getAllWindows: vi.fn(() => h.windows.filter((w) => w.destroyed === false)),
  });
  return {
    app,
    BrowserWindow,
    dialog: {},
    ipcMain: {
      on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
        h.ipcOn.set(channel, handler);
      }),
      handle: vi.fn(),
      removeListener: vi.fn(),
    },
    Menu: {
      buildFromTemplate: vi.fn((template: unknown) => template),
      setApplicationMenu: vi.fn(),
    },
    session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
  };
});

vi.mock("electron-store", () => ({
  default: class {
    private values = new Map<string, unknown>();
    get(key: string): unknown {
      return this.values.get(key);
    }
    set(key: string, value: unknown): void {
      this.values.set(key, value);
    }
  },
}));

vi.mock("electron-squirrel-startup", () => ({ default: false }));

/* These are injected by the Electron Forge Vite plugin in a real build;
   createMainWindow reads them, so the bare identifiers must resolve at
   runtime. Falsy dev-server URL forces the packaged `loadFile` branch. */
Object.assign(globalThis, {
  MAIN_WINDOW_VITE_DEV_SERVER_URL: "",
  MAIN_WINDOW_VITE_NAME: "main",
  __dirname: "/fake/electron-dist",
});

const originalArgv = process.argv;

let readyResolveRef: (() => void) | null = null;

const lastHandler = (event: string): Handler => {
  const list = h.appHandlers.get(event);
  if (!list || list.length === 0) {
    throw new Error(`no handler captured for "${event}"`);
  }
  return list[list.length - 1];
};

const asWindow = (raw: unknown): FakeWindow => raw as unknown as FakeWindow;

/** Fire did-finish-load + host:renderer-ready so the queue drains to `win`. */
const makeRendererReady = (win: FakeWindow): void => {
  for (const call of win.webContents.on.mock.calls) {
    if (call[0] === "did-finish-load") (call[1] as Handler)();
  }
  const ready = h.ipcOn.get("host:renderer-ready");
  if (!ready) throw new Error("host:renderer-ready not registered");
  ready({ sender: win.webContents });
};

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(async () => {
  vi.resetModules();
  h.appHandlers.clear();
  h.ipcOn.clear();
  h.windows.length = 0;
  h.quitSpy.mockClear();
  readyResolveRef = null;
  process.argv = ["/usr/bin/electron", "/fake/release/main.js"];
  await import("../main");
  readyResolveRef = h.readyResolve;
  if (!readyResolveRef) throw new Error("whenReady resolver not captured");
  readyResolveRef();
  await flush();
});

afterEach(() => {
  process.argv = originalArgv;
});

describe("lostSinceLastWindow side buffer (issue #25)", () => {
  it("parks paths while the window is gone, then reclaims them on createMainWindow and delivers once the renderer is ready", () => {
    const w1 = asWindow(h.windows[0]);
    makeRendererReady(w1);
    w1.destroyed = true;

    lastHandler("second-instance")({}, ["/electron", "/parked-a.md", "/parked-b.md"], "/tmp");
    expect(w1.webContents.send).not.toHaveBeenCalled();

    lastHandler("activate")();
    const w2 = asWindow(h.windows[1]);
    expect(h.windows).toHaveLength(2);

    makeRendererReady(w2);
    expect(w2.webContents.send).toHaveBeenCalledTimes(1);
    expect(w2.webContents.send).toHaveBeenCalledWith("host:open-files", ["/parked-a.md", "/parked-b.md"]);
  });

  it("drops parked paths when before-quit fires with no surviving window (Linux window-all-closed trigger), so a later window reclaims nothing", () => {
    const w1 = asWindow(h.windows[0]);
    makeRendererReady(w1);
    w1.destroyed = true;

    lastHandler("second-instance")({}, ["/electron", "/dropped.md"], "/tmp");
    expect(w1.webContents.send).not.toHaveBeenCalled();

    const event = { preventDefault: vi.fn() };
    lastHandler("before-quit")(event);
    expect(event.preventDefault).not.toHaveBeenCalled();

    lastHandler("activate")();
    const w2 = asWindow(h.windows[1]);
    makeRendererReady(w2);
    expect(w2.webContents.send).not.toHaveBeenCalled();
  });
});
