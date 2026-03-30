import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const root = process.cwd();

const loadDevVars = (): void => {
  const path = join(root, ".dev.vars");
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

loadDevVars();

export default defineConfig({
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  reporter: [["list"]],
  retries: 0,
  testDir: "./tests/portal-headless",
  timeout: 240_000,
  use: {
    ...devices["Desktop Chrome"],
    actionTimeout: 60_000,
    headless: true,
    navigationTimeout: 60_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { height: 900, width: 1400 },
  },
  workers: 1,
});
