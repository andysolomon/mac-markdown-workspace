import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/tests/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
