import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PermitClient, PermitWorkerError } from "@permits/client";

// ============================================================================
// Mock server — lightweight Bun.serve that simulates permit-worker responses
// ============================================================================

let mockServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
  mockServer = Bun.serve({
    port: 0, // OS-assigned
    routes: {
      "/health": {
        GET() {
          return Response.json({
            status: "healthy",
            timestamp: new Date().toISOString(),
            uptime: 123.45,
          });
        },
      },
      "/api/browser/status": {
        GET() {
          return Response.json({
            active: true,
            busy: false,
            currentOperation: null,
            currentUrl: "https://aqi.maricopa.gov",
            isLoggedIn: true,
            keepAliveEnabled: true,
            keepAliveIntervalMs: 60_000,
            lastActivityAt: new Date().toISOString(),
            lastError: null,
            lastKeepAliveAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            portalReady: true,
            startedAt: new Date().toISOString(),
            timestamp: new Date().toISOString(),
            viewportHeight: 1080,
            viewportWidth: 1920,
          });
        },
      },
      "/api/browser/start": {
        POST() {
          return Response.json({
            success: true,
            isLoggedIn: true,
            portalReady: true,
            timestamp: new Date().toISOString(),
          });
        },
      },
      "/api/browser/stop": {
        POST() {
          return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
          });
        },
      },
      "/api/permits": {
        GET() {
          return Response.json([
            {
              permitNumber: "D0061391",
              company: "Stevens Leinweber",
              projectName: "Lexington 420",
              current: {
                id: "D0061391",
                applicationNumber: "D0061391",
                version: 1,
                versionType: "new",
                projectName: "Lexington 420",
                company: "Stevens Leinweber",
                requestStatus: "complete",
                permitStatus: "Active",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              history: [],
            },
          ]);
        },
      },
      "/api/permits/:id": {
        GET(req) {
          const id = req.params.id;
          if (id === "D0000000") {
            return Response.json(
              { success: false, error: "Permit D0000000 not found" },
              { status: 404 }
            );
          }
          return Response.json({
            permitNumber: id,
            company: "Test Co",
            projectName: "Test Project",
            current: {
              id,
              applicationNumber: id,
              version: 1,
              versionType: "new",
              projectName: "Test Project",
              company: "Test Co",
              requestStatus: "complete",
              permitStatus: "Active",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            history: [],
          });
        },
      },
      "/api/scrape/pdf": {
        async POST(req) {
          const body = (await req.json()) as { permitId?: string };
          if (!body.permitId) {
            return Response.json(
              { success: false, error: "permitId is required" },
              { status: 400 }
            );
          }
          return Response.json({
            success: true,
            permitId: body.permitId,
            pdfBase64: "dGVzdA==",
            data: { applicationId: body.permitId, projectName: "Test" },
            timestamp: new Date().toISOString(),
          });
        },
      },
      "/api/scrape/:id": {
        GET(req) {
          return Response.json({
            success: true,
            permitId: req.params.id,
            data: { applicationId: req.params.id, projectName: "Test" },
            timestamp: new Date().toISOString(),
          });
        },
      },
      "/api/sync": {
        POST() {
          return Response.json({
            success: true,
            companyPermits: { newRecords: 5, totalInDb: 100 },
            marketingPermits: { newRecords: 2, totalInDb: 50 },
            timestamp: new Date().toISOString(),
          });
        },
      },
      "/api/sync/company": {
        POST() {
          return Response.json({
            success: true,
            companyPermits: { newRecords: 3, totalInDb: 100 },
            timestamp: new Date().toISOString(),
          });
        },
      },
      "/api/invoices/pdf": {
        async POST(req) {
          const body = (await req.json()) as { invoiceNumber?: string };
          return Response.json({
            success: true,
            invoiceNumber: body.invoiceNumber,
            pdfBase64: "aW52b2ljZQ==",
            timestamp: new Date().toISOString(),
          });
        },
      },
    },
  });
  baseUrl = `http://localhost:${mockServer.port}`;
});

afterAll(() => {
  mockServer.stop();
});

// ============================================================================
// Construction
// ============================================================================

describe("PermitClient construction", () => {
  test("uses explicit baseUrl", () => {
    const client = new PermitClient({ baseUrl: "http://custom:9999" });
    expect(client).toBeDefined();
  });

  test("strips trailing slash from baseUrl", async () => {
    const client = new PermitClient({ baseUrl: `${baseUrl}/` });
    const result = await client.health();
    expect(result.status).toBe("healthy");
  });

  test("defaults timeoutMs to 60000", () => {
    const client = new PermitClient({ baseUrl });
    expect(client).toBeDefined();
  });
});

// ============================================================================
// Health
// ============================================================================

describe("health", () => {
  test("returns health response", async () => {
    const client = new PermitClient({ baseUrl });
    const result = await client.health();
    expect(result.status).toBe("healthy");
    expect(result.uptime).toBeGreaterThan(0);
    expect(result.timestamp).toBeTruthy();
  });
});

// ============================================================================
// Browser endpoints
// ============================================================================

describe("browser", () => {
  test("browserStatus returns status fields", async () => {
    const client = new PermitClient({ baseUrl });
    const status = await client.browserStatus();
    expect(status.active).toBe(true);
    expect(status.isLoggedIn).toBe(true);
    expect(status.portalReady).toBe(true);
    expect(status.viewportWidth).toBe(1920);
  });

  test("browserStart returns success", async () => {
    const client = new PermitClient({ baseUrl });
    const result = await client.browserStart();
    expect(result.success).toBe(true);
    expect(result.isLoggedIn).toBe(true);
  });

  test("browserStop returns success", async () => {
    const client = new PermitClient({ baseUrl });
    const result = await client.browserStop();
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Scrape
// ============================================================================

describe("scrape", () => {
  test("scrapePdf sends permitId and returns PDF data", async () => {
    const client = new PermitClient({ baseUrl });
    const result = await client.scrapePdf({ permitId: "D0061391" });
    expect(result.success).toBe(true);
    expect(result.permitId).toBe("D0061391");
    expect(result.pdfBase64).toBeTruthy();
  });

  test("scrape returns permit data without PDF", async () => {
    const client = new PermitClient({ baseUrl });
    const result = await client.scrape("D0061391");
    expect(result.success).toBe(true);
    expect(result.permitId).toBe("D0061391");
    expect(result.data).toBeDefined();
  });
});

// ============================================================================
// Permits
// ============================================================================

describe("permits", () => {
  test("listPermits returns array", async () => {
    const client = new PermitClient({ baseUrl });
    const permits = await client.listPermits();
    expect(Array.isArray(permits)).toBe(true);
    expect(permits.length).toBeGreaterThan(0);
    expect(permits[0]?.permitNumber).toBe("D0061391");
  });

  test("getPermit returns single permit", async () => {
    const client = new PermitClient({ baseUrl });
    const permit = await client.getPermit("D0061391");
    expect(permit.permitNumber).toBe("D0061391");
    expect(permit.current.permitStatus).toBe("Active");
  });

  test("getPermit throws PermitWorkerError for 404", async () => {
    const client = new PermitClient({ baseUrl });
    try {
      await client.getPermit("D0000000");
      throw new Error("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PermitWorkerError);
      const pwe = error as PermitWorkerError;
      expect(pwe.status).toBe(404);
      expect(pwe.endpoint).toBe("GET /api/permits/D0000000");
      expect(pwe.message).toContain("not found");
    }
  });
});

// ============================================================================
// Sync
// ============================================================================

describe("sync", () => {
  test("sync returns full sync stats", async () => {
    const client = new PermitClient({ baseUrl });
    const result = await client.sync();
    expect(result.success).toBe(true);
    expect(result.companyPermits?.newRecords).toBe(5);
    expect(result.marketingPermits?.newRecords).toBe(2);
  });

  test("syncCompany returns company sync stats", async () => {
    const client = new PermitClient({ baseUrl });
    const result = await client.syncCompany();
    expect(result.success).toBe(true);
    expect(result.companyPermits?.newRecords).toBe(3);
  });
});

// ============================================================================
// Invoices
// ============================================================================

describe("invoices", () => {
  test("invoicePdf returns PDF data", async () => {
    const client = new PermitClient({ baseUrl });
    const result = await client.invoicePdf({ invoiceNumber: "IV087334" });
    expect(result.success).toBe(true);
    expect(result.invoiceNumber).toBe("IV087334");
    expect(result.pdfBase64).toBeTruthy();
  });
});

// ============================================================================
// Error handling
// ============================================================================

describe("error handling", () => {
  test("connection refused throws PermitWorkerError with status 0", async () => {
    const client = new PermitClient({
      baseUrl: "http://localhost:19999",
      timeoutMs: 2000,
    });
    try {
      await client.health();
      throw new Error("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PermitWorkerError);
      const pwe = error as PermitWorkerError;
      expect(pwe.status).toBe(0);
      expect(pwe.endpoint).toBe("GET /health");
    }
  });

  test("timeout throws PermitWorkerError with status 0", async () => {
    // Create a server that never responds
    const slowServer = Bun.serve({
      port: 0,
      async fetch() {
        await Bun.sleep(10_000);
        return new Response("too late");
      },
    });

    const client = new PermitClient({
      baseUrl: `http://localhost:${slowServer.port}`,
      timeoutMs: 100,
    });

    try {
      await client.health();
      throw new Error("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PermitWorkerError);
      const pwe = error as PermitWorkerError;
      expect(pwe.status).toBe(0);
      expect(pwe.message).toContain("timed out");
    } finally {
      slowServer.stop();
    }
  });

  test("PermitWorkerError preserves response body", async () => {
    const client = new PermitClient({ baseUrl });
    try {
      await client.getPermit("D0000000");
    } catch (error) {
      const pwe = error as PermitWorkerError;
      expect(pwe.body).toBeDefined();
      expect((pwe.body as Record<string, unknown>).error).toContain(
        "not found"
      );
    }
  });
});
