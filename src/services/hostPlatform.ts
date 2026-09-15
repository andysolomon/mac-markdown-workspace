/** Host platform metadata for Linux/Hyprland vs macOS conventions (issue #26). */

export type HostOs = "darwin" | "linux" | "win32" | "web" | "ios" | "unknown";

export type HostPlatformInfo = {
  os: HostOs;
  /** When true, app shortcuts use Control; Meta/Super is left to the compositor. */
  commandUsesCtrl: boolean;
  /** Decorative macOS traffic lights — misleading outside darwin/web theme. */
  showWindowDots: boolean;
};

/** Half-tile friendly mins for Hyprland (~960px on a 1920 display). */
export const WINDOW_MIN_WIDTH = 640;
export const WINDOW_MIN_HEIGHT = 480;

export function hostOsFromNodePlatform(platform: string): HostOs {
  if (platform === "darwin" || platform === "linux" || platform === "win32") return platform;
  return "unknown";
}

export function platformFromOs(os: HostOs): HostPlatformInfo {
  switch (os) {
    case "darwin":
      return { os, commandUsesCtrl: false, showWindowDots: true };
    case "web":
      // Browser: keep Mac-theme dots; accept either mod key.
      return { os, commandUsesCtrl: false, showWindowDots: true };
    case "linux":
    case "win32":
      return { os, commandUsesCtrl: true, showWindowDots: false };
    case "ios":
      return { os, commandUsesCtrl: true, showWindowDots: false };
    default:
      return { os: "unknown", commandUsesCtrl: true, showWindowDots: false };
  }
}

/** Whether this keydown should be treated as an app command chord. */
export function isCommandMod(
  e: Pick<KeyboardEvent, "metaKey" | "ctrlKey">,
  platform: HostPlatformInfo,
): boolean {
  if (platform.os === "darwin") return e.metaKey;
  if (platform.os === "web") return e.metaKey || e.ctrlKey;
  // linux / win32 / ios / unknown — Super stays with the compositor/OS
  return e.ctrlKey;
}

/** Normalize letter keys so Ctrl+Shift+S matches "s" (not "S"). */
export function normalizeShortcutKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export type MenuExportFormat = "txt" | "pdf" | "docx" | "html";

/** Map native menu-action strings onto exportDocument formats. */
export function menuActionToExportFormat(action: string): MenuExportFormat | null {
  switch (action) {
    case "export-txt":
      return "txt";
    case "export-pdf":
      return "pdf";
    case "export-docx":
      return "docx";
    case "export-html":
      return "html";
    default:
      return null;
  }
}

export function includeMacAppMenuRoles(platform: string): boolean {
  return platform === "darwin";
}
