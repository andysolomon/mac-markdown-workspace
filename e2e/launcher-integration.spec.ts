import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { launchApp } from "./helpers";

async function makeIsolatedHome(): Promise<{ home: string; userData: string; env: NodeJS.ProcessEnv }> {
  const home = await mkdtemp(path.join(os.tmpdir(), "mmw-launcher-home-"));
  const userData = path.join(home, "config");
  const docs = path.join(home, "Documents");
  await mkdir(docs, { recursive: true });
  await mkdir(path.join(home, ".config"), { recursive: true });
  await mkdir(userData, { recursive: true });
  await writeFile(
    path.join(home, ".config", "user-dirs.dirs"),
    'XDG_DOCUMENTS_DIR="$HOME/Documents"\n',
    "utf8",
  );
  return {
    home,
    userData,
    env: { HOME: home, XDG_CONFIG_HOME: path.join(home, ".config") },
  };
}

async function writeMarkdown(dir: string, name: string, body: string): Promise<string> {
  const filePath = path.join(dir, name);
  await writeFile(filePath, body, "utf8");
  return filePath;
}

async function spawnSecondInstance(
  userData: string,
  files: string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const electronPath = path.join(__dirname, "..", "node_modules", ".bin", "electron");
  const mainPath = path.join(__dirname, "..", ".vite", "build", "main.js");
  const child = spawn(electronPath, [mainPath, `--user-data-dir=${userData}`, "--", ...files], {
    env: { ...process.env, ...env },
    stdio: "ignore",
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("second instance did not exit"));
    }, 20000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test.describe("Launcher integration (issue #25)", () => {
  test("cold launch imports one Markdown file as a new note", async () => {
    const { home, userData, env } = await makeIsolatedHome();
    const files = path.join(home, "files");
    await mkdir(files);
    const one = await writeMarkdown(files, "solo.md", "# Launcher Solo Import\n\nfrom argv");

    const app = await launchApp({
      args: [`--user-data-dir=${userData}`, "--", one],
      env,
    });
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await expect(window.locator(".mm-doclist").getByText("Launcher Solo Import")).toBeVisible({
      timeout: 15000,
    });
    await app.close();
  });

  test("cold launch imports multiple paths including spaces, Unicode, and a leading dash", async () => {
    const { home, userData, env } = await makeIsolatedHome();
    const files = path.join(home, "files");
    await mkdir(files);
    const spaced = await writeMarkdown(files, "file with spaces.md", "# Launcher Spaced File\n");
    const unicode = await writeMarkdown(files, "日本語.md", "# Launcher Unicode File\n");
    const dashed = await writeMarkdown(files, "-leading.md", "# Launcher Leading Dash\n");

    const app = await launchApp({
      args: [`--user-data-dir=${userData}`, "--", spaced, unicode, dashed],
      env,
    });
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await expect(window.locator(".mm-doclist").getByText("Launcher Spaced File")).toBeVisible({
      timeout: 15000,
    });
    await expect(window.locator(".mm-doclist").getByText("Launcher Unicode File")).toBeVisible();
    await expect(window.locator(".mm-doclist").getByText("Launcher Leading Dash")).toBeVisible();
    await app.close();
  });

  test("second instance focuses the first window and imports the file", async () => {
    const { home, userData, env } = await makeIsolatedHome();
    const files = path.join(home, "files");
    await mkdir(files);
    const extra = await writeMarkdown(files, "second.md", "# Launcher Second Instance\n");

    const app = await launchApp({ args: [`--user-data-dir=${userData}`], env });
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await expect(window.locator(".mm-doclist")).toBeVisible();

    await spawnSecondInstance(userData, [extra], env);
    await expect(window.locator(".mm-doclist").getByText("Launcher Second Instance")).toBeVisible({
      timeout: 15000,
    });
    await app.close();
  });

  test("missing file reports an error without replacing another note", async () => {
    const { home, userData, env } = await makeIsolatedHome();
    const missing = path.join(home, "files", "no-such-file.md");

    const app = await launchApp({
      args: [`--user-data-dir=${userData}`, "--", missing],
      env,
    });
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await expect(window.locator(".mm-toast")).toContainText("missing or unreadable", { timeout: 15000 });
    await expect(window.locator(".mm-doclist").getByText("Welcome to Mac Markdown")).toBeVisible();
    await app.close();
  });
});
