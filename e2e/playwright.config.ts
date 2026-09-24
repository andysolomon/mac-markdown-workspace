import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const WEB_PORT = 4173;
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;

/** True when this invocation will execute the browser `web` project. */
function webProjectWillRun(argv: string[]): boolean {
  const selected: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project" && argv[i + 1]) selected.push(argv[i + 1]);
    else if (arg.startsWith("--project=")) selected.push(arg.slice("--project=".length));
  }
  return selected.length === 0 || selected.includes("web");
}

const webServer: PlaywrightTestConfig["webServer"] = {
  // Config lives in e2e/; the preview serves the repo-root dist-web build.
  cwd: "..",
  command: `sh -c 'test -f dist-web/index.html || bun run web:build; exec bun run web:preview -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort'`,
  url: `${WEB_ORIGIN}/`,
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
};

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
  ...(webProjectWillRun(process.argv) ? { webServer } : {}),
  projects: [
    {
      name: "electron",
      testIgnore: "**/web-*.spec.ts",
    },
    {
      name: "web",
      testMatch: "**/web-*.spec.ts",
      use: {
        browserName: "chromium",
        baseURL: `${WEB_ORIGIN}/`,
      },
    },
  ],
});
