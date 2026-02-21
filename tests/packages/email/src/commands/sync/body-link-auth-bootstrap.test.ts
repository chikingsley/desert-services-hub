import { afterEach, describe, expect, test } from "bun:test";
import { parseBodyLinkAuthBootstrapArgs } from "@email-cli/commands/sync/body-link-auth-bootstrap";

const KEYS = [
  "EMAIL_BODY_LINK_PLAYWRIGHT_HEADLESS",
  "EMAIL_BODY_LINK_PLAYWRIGHT_TIMEOUT_MS",
  "EMAIL_BODY_LINK_PLAYWRIGHT_STORAGE_STATE_PATH",
  "EMAIL_BODY_LINK_PLAYWRIGHT_DEBUG_DIR",
  "BUILDINGCONNECTED_LOGIN_EMAIL",
  "BUILDINGCONNECTED_LOGIN_PASSWORD",
  "BUILDINGCONNECTED_LOGIN_START_URL",
] as const;

const baselineEnv = new Map<string, string | undefined>(
  KEYS.map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const key of KEYS) {
    const value = baselineEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("parseBodyLinkAuthBootstrapArgs", () => {
  test("uses env defaults when args are omitted", () => {
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_HEADLESS = "0";
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_TIMEOUT_MS = "60000";
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_STORAGE_STATE_PATH =
      "/tmp/bc-auth/state.json";
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_DEBUG_DIR = "/tmp/bc-debug";
    process.env.BUILDINGCONNECTED_LOGIN_EMAIL = "user@example.com";
    process.env.BUILDINGCONNECTED_LOGIN_PASSWORD = "secret";
    process.env.BUILDINGCONNECTED_LOGIN_START_URL =
      "https://app.buildingconnected.com/";

    const parsed = parseBodyLinkAuthBootstrapArgs([]);

    expect(parsed.email).toBe("user@example.com");
    expect(parsed.password).toBe("secret");
    expect(parsed.statePath).toBe("/tmp/bc-auth/state.json");
    expect(parsed.debugDir).toBe("/tmp/bc-debug");
    expect(parsed.url).toBe("https://app.buildingconnected.com/");
    expect(parsed.timeoutMs).toBe(60_000);
    expect(parsed.headless).toBe(false);
    expect(parsed.nonInteractive).toBe(
      !(process.stdin.isTTY && process.stdout.isTTY)
    );
    expect(parsed.manualAuthWait).toBe(false);
    expect(parsed.manualAuthTimeoutMs).toBe(1_200_000);
  });

  test("lets args override env and keeps headed over headless", () => {
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_HEADLESS = "1";
    process.env.BUILDINGCONNECTED_LOGIN_EMAIL = "env@example.com";
    process.env.BUILDINGCONNECTED_LOGIN_PASSWORD = "env-secret";

    const parsed = parseBodyLinkAuthBootstrapArgs([
      "--headed",
      "--headless",
      "--non-interactive",
      "--email",
      "arg@example.com",
      "--password=arg-secret",
      "--state-path",
      "/tmp/custom-state.json",
      "--url=https://app.buildingconnected.com/goto/abc",
      "--validate-url",
      "https://app.buildingconnected.com/goto/xyz",
      "--debug-dir=/tmp/custom-debug",
      "--timeout-ms",
      "15000",
      "--otp",
      "123456",
      "--manual-auth-wait",
      "--manual-timeout-ms",
      "600000",
    ]);

    expect(parsed.headless).toBe(false);
    expect(parsed.nonInteractive).toBe(true);
    expect(parsed.email).toBe("arg@example.com");
    expect(parsed.password).toBe("arg-secret");
    expect(parsed.statePath).toBe("/tmp/custom-state.json");
    expect(parsed.url).toBe("https://app.buildingconnected.com/goto/abc");
    expect(parsed.validateUrl).toBe(
      "https://app.buildingconnected.com/goto/xyz"
    );
    expect(parsed.debugDir).toBe("/tmp/custom-debug");
    expect(parsed.timeoutMs).toBe(15_000);
    expect(parsed.otp).toBe("123456");
    expect(parsed.manualAuthWait).toBe(true);
    expect(parsed.manualAuthTimeoutMs).toBe(600_000);
  });

  test("falls back to default timeout when timeout arg is invalid", () => {
    process.env.EMAIL_BODY_LINK_PLAYWRIGHT_TIMEOUT_MS = undefined;

    const parsed = parseBodyLinkAuthBootstrapArgs(["--timeout-ms=0"]);

    expect(parsed.timeoutMs).toBe(45_000);
    expect(parsed.manualAuthTimeoutMs).toBe(1_200_000);
  });
});
