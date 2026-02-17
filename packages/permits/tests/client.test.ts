import { describe, expect, test } from "bun:test";
import {
  PermitClient,
  PermitWorkerError,
  type RenewAndPayRequest,
} from "@permits/client";

const TEST_BASE_URL =
  process.env.PERMIT_TEST_BASE_URL?.trim() ||
  process.env.PERMIT_WORKER_URL?.trim() ||
  "http://localhost:47822";

function makeClient(timeoutMs = 60_000): PermitClient {
  return new PermitClient({ baseUrl: TEST_BASE_URL, timeoutMs });
}

describe("PermitClient integration (live permit-worker container)", () => {
  test("health returns container status", async () => {
    const client = makeClient();
    const result = await client.health();

    expect(result.status).toBeTruthy();
    expect(result.timestamp).toBeTruthy();
  });

  test("browserStatus returns runtime fields", async () => {
    const client = makeClient();
    const status = await client.browserStatus();

    expect(typeof status.active).toBe("boolean");
    expect(typeof status.busy).toBe("boolean");
    expect(typeof status.portalReady).toBe("boolean");
    expect(status.timestamp).toBeTruthy();
  });

  test("listPermits returns an array", async () => {
    const client = makeClient();
    const permits = await client.listPermits();

    expect(Array.isArray(permits)).toBe(true);
  });

  test("renewAndPay endpoint rejects invalid payload with PermitWorkerError", async () => {
    const client = makeClient();

    try {
      await client.renewAndPay("D0000000", {} as unknown as RenewAndPayRequest);
      throw new Error("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PermitWorkerError);
      const pwe = error as PermitWorkerError;
      expect(pwe.status).toBe(400);
      expect(pwe.endpoint).toBe("POST /api/permits/D0000000/renew-and-pay");
    }
  });
});
