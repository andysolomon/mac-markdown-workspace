import { _electron as electron } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function launchApp(options?: { args?: string[]; env?: NodeJS.ProcessEnv }) {
  const electronPath = path.join(__dirname, "..", "node_modules", ".bin", "electron");
  const mainPath = path.join(__dirname, "..", ".vite", "build", "main.js");
  const extra = options?.args ?? [];
  const hasUserData = extra.some((arg) => arg === "--user-data-dir" || arg.startsWith("--user-data-dir="));
  const userData = hasUserData ? null : await mkdtemp(path.join(os.tmpdir(), "mmw-e2e-ud-"));
  const args = [
    mainPath,
    ...(userData ? [`--user-data-dir=${userData}`] : []),
    ...extra,
  ];

  return electron.launch({
    executablePath: electronPath,
    args,
    env: options?.env ? { ...process.env, ...options.env } : undefined,
  });
}
