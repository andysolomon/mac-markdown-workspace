import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.andrewsolomon.macmarkdownworkspace",
  appName: "Mac Markdown Workspace",
  webDir: "dist-ios",
  // Webview background while the JS boots (first launch on device shows it
  // for a few seconds in debug builds) — teal-dark instead of stark black.
  backgroundColor: "#16181a",
};

export default config;
