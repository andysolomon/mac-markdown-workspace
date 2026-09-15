import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30000,
  retries: 0,
  // Hyprland tiles new windows; parallel Electron launches race the ≤640px
  // mobile layout even after launchApp pins 1320×860 (issue #26).
  workers: 1,
  use: {
    trace: "on-first-retry",
  },
});
