import { afterEach, describe, expect, test } from "bun:test";
import {
  normalizeBuildingConnectedAuthStartRequest,
  normalizeBuildingConnectedClipboardPasteRequest,
  parseBuildingConnectedVncResolution,
} from "@background-jobs/api/buildingconnected-auth";

const ENV_KEYS = [
  "BUILDINGCONNECTED_LOGIN_START_URL",
  "BUILDINGCONNECTED_AUTH_MANUAL_TIMEOUT_MS",
] as const;

const baselineEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = baselineEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("normalizeBuildingConnectedAuthStartRequest", () => {
  test("uses env defaults when body is empty", () => {
    process.env.BUILDINGCONNECTED_LOGIN_START_URL =
      "https://app.buildingconnected.com/goto/env-default";
    process.env.BUILDINGCONNECTED_AUTH_MANUAL_TIMEOUT_MS = "600000";

    const parsed = normalizeBuildingConnectedAuthStartRequest({});

    expect(parsed.startUrl).toBe(
      "https://app.buildingconnected.com/goto/env-default"
    );
    expect(parsed.manualAuthTimeoutMs).toBe(600_000);
    expect(parsed.validateUrl).toBeNull();
  });

  test("lets request body override start URL, timeout, and validate URL", () => {
    process.env.BUILDINGCONNECTED_LOGIN_START_URL =
      "https://app.buildingconnected.com/";
    process.env.BUILDINGCONNECTED_AUTH_MANUAL_TIMEOUT_MS = "1200000";

    const parsed = normalizeBuildingConnectedAuthStartRequest({
      manualAuthTimeoutMs: 300_000,
      startUrl: " https://app.buildingconnected.com/goto/request-url ",
      validateUrl: " https://app.buildingconnected.com/goto/validate-url ",
    });

    expect(parsed.startUrl).toBe(
      "https://app.buildingconnected.com/goto/request-url"
    );
    expect(parsed.manualAuthTimeoutMs).toBe(300_000);
    expect(parsed.validateUrl).toBe(
      "https://app.buildingconnected.com/goto/validate-url"
    );
  });

  test("falls back to hard defaults when env/body timeout values are invalid", () => {
    process.env.BUILDINGCONNECTED_AUTH_MANUAL_TIMEOUT_MS = "0";

    const parsed = normalizeBuildingConnectedAuthStartRequest({
      manualAuthTimeoutMs: -1,
    });

    expect(parsed.manualAuthTimeoutMs).toBe(1_200_000);
  });
});

describe("normalizeBuildingConnectedClipboardPasteRequest", () => {
  test("returns clipboard text when provided", () => {
    const parsed = normalizeBuildingConnectedClipboardPasteRequest({
      text: "  abc123  ",
    });
    expect(parsed).toBe("  abc123  ");
  });

  test("returns empty string when payload is invalid", () => {
    expect(normalizeBuildingConnectedClipboardPasteRequest({})).toBe("");
    expect(normalizeBuildingConnectedClipboardPasteRequest(null)).toBe("");
    expect(normalizeBuildingConnectedClipboardPasteRequest({ text: 123 })).toBe(
      ""
    );
  });
});

describe("parseBuildingConnectedVncResolution", () => {
  test("parses valid width/height format", () => {
    expect(parseBuildingConnectedVncResolution("1600x900")).toEqual({
      height: 900,
      width: 1600,
    });
  });

  test("falls back when format is invalid", () => {
    expect(parseBuildingConnectedVncResolution("bad")).toEqual({
      height: 1080,
      width: 1920,
    });
    expect(parseBuildingConnectedVncResolution(undefined)).toEqual({
      height: 1080,
      width: 1920,
    });
  });
});
