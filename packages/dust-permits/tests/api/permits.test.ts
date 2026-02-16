/**
 * Permits API Tests
 *
 * Tests permits API handlers directly.
 * Run with: bun test tests/api/permits.test.ts
 */

import { beforeAll, describe, expect, it } from "bun:test";
import type * as PermitsApi from "@/api/permits";

let api: typeof PermitsApi;

beforeAll(async () => {
  api = await import("@/api/permits");
});

describe("handleListPermits", () => {
  it("returns array of permits", async () => {
    const response = api.handleListPermits();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns JSON content type", () => {
    const response = api.handleListPermits();
    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });
});

describe("handleGetPermit", () => {
  it("returns 404 for non-existent permit", async () => {
    const response = api.handleGetPermit("NONEXISTENT123");
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it("returns permit data for valid ID if permits exist", async () => {
    const listResponse = api.handleListPermits();
    const permits = await listResponse.json();

    if (permits.length > 0) {
      const permitId = permits[0]?.current?.id;
      if (!permitId) {
        return;
      }
      const response = api.handleGetPermit(permitId);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.current.id).toBe(permitId);
    }
  });
});
