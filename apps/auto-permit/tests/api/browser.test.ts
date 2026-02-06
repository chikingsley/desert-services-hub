/**
 * Browser API Tests
 *
 * Tests browser API handlers directly.
 * Run with: bun test tests/api/browser.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type * as BrowserApi from "@/api/browser";

let api: typeof BrowserApi;

beforeAll(async () => {
  api = await import("@/api/browser");
});

afterAll(async () => {
  // Ensure we don't leak a shared browser session between tests.
  await api.handleBrowserStop();
});

describe("handleBrowserStatus", () => {
  it("returns browser status", async () => {
    const response = api.handleBrowserStatus();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.timestamp).toBeDefined();
    expect(typeof data.active).toBe("boolean");
    expect(typeof data.isLoggedIn).toBe("boolean");
  });

  it("returns JSON content type", () => {
    const response = api.handleBrowserStatus();
    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });
});

describe("handleBrowserStart", () => {
  it(
    "returns response with success field",
    async () => {
      const response = await api.handleBrowserStart();
      // May succeed or fail depending on environment, but should return valid JSON
      expect(response.headers.get("content-type")).toContain(
        "application/json"
      );

      const data = await response.json();
      expect(typeof data.success).toBe("boolean");
    },
    { timeout: 90_000 }
  );
});

describe("handleBrowserStop", () => {
  it("returns response with success field", async () => {
    const response = await api.handleBrowserStop();
    expect(response.headers.get("content-type")).toContain("application/json");

    const data = await response.json();
    expect(typeof data.success).toBe("boolean");
  });
});
