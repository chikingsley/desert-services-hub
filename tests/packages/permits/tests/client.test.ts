import { describe, expect, test } from "bun:test";
import {
  PermitClient,
  PermitWorkerError,
  type RenewAndPayRequest,
} from "@/apps/dust-permits-mcp/client";

const TEST_BASE_URL = "https://web.desertservices.app";

function makeClient(timeoutMs = 60_000): PermitClient {
  return new PermitClient({ baseUrl: TEST_BASE_URL, timeoutMs });
}

describe("PermitClient integration (live permit-worker container)", () => {
  test("browserStatus returns runtime fields via tunnel", async () => {
    const client = makeClient();
    const status = await client.browserStatus();

    expect(typeof status.active).toBe("boolean");
    expect(typeof status.busy).toBe("boolean");
    expect(typeof status.portalReady).toBe("boolean");
    expect(status.timestamp).toBeTruthy();
  });

  test("renewAndPay endpoint rejects invalid payload with PermitWorkerError via tunnel", async () => {
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
