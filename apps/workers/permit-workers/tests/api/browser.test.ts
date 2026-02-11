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

describe("handleBrowserReady", () => {
  it("returns response with success field", async () => {
    const response = await api.handleBrowserReady();
    expect(response.headers.get("content-type")).toContain("application/json");

    const data = await response.json();
    expect(typeof data.success).toBe("boolean");
  });
});

describe("handleBrowserKeepAlive", () => {
  it("returns response with success field", async () => {
    const response = await api.handleBrowserKeepAlive();
    expect(response.headers.get("content-type")).toContain("application/json");

    const data = await response.json();
    expect(typeof data.success).toBe("boolean");
  });
});

describe("handleBrowserStop", () => {
  it("returns response with success field", async () => {
    const response = await api.handleBrowserStop();
    expect(response.headers.get("content-type")).toContain("application/json");

    const data = await response.json();
    expect(typeof data.success).toBe("boolean");
  });
});

describe("handleBrowserClipboardPaste", () => {
  it("rejects empty clipboard payload", async () => {
    const req = new Request("http://localhost/api/browser/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    const response = await api.handleBrowserClipboardPaste(req);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
  });
});

describe("handleBrowserClipboardCopy", () => {
  it("returns response with success field", async () => {
    const response = await api.handleBrowserClipboardCopy();
    expect(response.headers.get("content-type")).toContain("application/json");

    const data = await response.json();
    expect(typeof data.success).toBe("boolean");
  });
});
