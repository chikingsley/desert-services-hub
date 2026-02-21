/**
 * Health Check API Tests
 *
 * Tests health handler directly.
 * Run with: bun test tests/api/health.test.ts
 */

import { beforeAll, describe, expect, it } from "bun:test";
import type * as PermitsApi from "@/api/permits";

let api: typeof PermitsApi;

beforeAll(async () => {
  api = await import("@/api/permits");
});

describe("Health Check Endpoint", () => {
  it("returns healthy status", async () => {
    const response = api.handleHealthCheck();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe("healthy");
    expect(data.timestamp).toBeDefined();
    expect(typeof data.uptime).toBe("number");
  });

  it("returns JSON content type", () => {
    const response = api.handleHealthCheck();
    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });
});
