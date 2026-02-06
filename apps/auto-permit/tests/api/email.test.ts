/**
 * Email API Tests
 *
 * Tests email API handlers directly.
 * Run with: bun test tests/api/email.test.ts
 *
 * Note: These tests don't actually send emails - they test routing and that
 * the handlers respond to requests. Full email testing requires Graph API credentials.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type * as EmailApi from "@/api/email";

let api: typeof EmailApi;

beforeAll(async () => {
  api = await import("@/api/email");
});

afterAll(async () => {
  // Ensure any browser session spun up by side effects is closed.
  const { handleBrowserStop } = await import("@/api/browser");
  await handleBrowserStop();
});

describe("handleListTemplates", () => {
  it("returns templates object", async () => {
    const response = await api.handleListTemplates();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.templates).toBeDefined();
    expect(Array.isArray(data.templates)).toBe(true);
  });

  it("returns JSON content type", async () => {
    const response = await api.handleListTemplates();
    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });

  it("templates are strings (template names)", async () => {
    const response = await api.handleListTemplates();
    const data = await response.json();

    if (data.templates.length > 0) {
      // Templates are returned as string names, not objects
      expect(typeof data.templates[0]).toBe("string");
    }
  });
});

describe("handleSendEmail", () => {
  it("returns 400 for missing required fields", async () => {
    const response = await api.handleSendEmail({} as never);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  it("returns 500 for invalid email (Graph API fails)", async () => {
    // Handler doesn't validate email format - it passes to Graph API which fails
    const response = await api.handleSendEmail({
      to: "not-an-email",
      subject: "Test",
      body: "Test body",
    });
    // Will fail at Graph API level, not validation
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 400 when subject is missing and no body", async () => {
    const response = await api.handleSendEmail({
      to: "test@example.com",
    } as never);
    // Missing body should fail validation
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });
});
