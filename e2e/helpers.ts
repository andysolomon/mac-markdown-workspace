import { _electron as electron } from "@playwright/test";
import path from "node:path";

export async function launchApp() {
  const electronPath = path.join(__dirname, "..", "node_modules", ".bin", "electron");
  const mainPath = path.join(__dirname, "..", ".vite", "build", "main.js");

  return electron.launch({
    executablePath: electronPath,
    args: [mainPath],
  });
}
