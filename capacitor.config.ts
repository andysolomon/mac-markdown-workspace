import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.andrewsolomon.macmarkdownworkspace",
  appName: "Mac Markdown Workspace",
  webDir: "dist-ios",
  // Webview background while the JS boots (first launch on device shows it
  // for a few seconds in debug builds) — teal-dark instead of stark black.
  backgroundColor: "#16181a",
  plugins: {
    Keyboard: {
      // Resize the webview when the keyboard opens so fixed bottom chrome
      // (the markdown accessory bar) stays above it (issue #18 / W-000018).
      resize: "native",
    },
  },
};

export default config;
