import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const root = process.cwd();

/**
 * Load `.dev.vars` (same keys as Wrangler) when env vars are not already set.
 */
const loadDevVars = (): void => {
  const p = join(root, ".dev.vars");
  if (!existsSync(p)) {
    return;
  }
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      continue;
    }
    const i = t.indexOf("=");
    if (i <= 0) {
      continue;
    }
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
};

loadDevVars();

export default defineConfig({
  expect: { timeout: 30_000 },
  fullyParallel: false,
  reporter: [["list"]],
  testDir: "./tests/portal-headed",
  timeout: 180_000,
  use: {
    ...devices["Desktop Chrome"],
    actionTimeout: 60_000,
    headless: false,
    launchOptions: {
      args: ["--disable-popup-blocking"],
    },
    navigationTimeout: 60_000,
    viewport: { height: 900, width: 1400 },
  },
  workers: 1,
});
