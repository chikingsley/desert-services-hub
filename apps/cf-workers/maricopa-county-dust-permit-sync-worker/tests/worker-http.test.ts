import { describe, expect, test } from "vitest";

import worker from "../src/index";

const readJson = <T>(response: Response): Promise<T> =>
  response.json() as Promise<T>;

describe("worker fetch", () => {
  test("GET /api/health returns service metadata", async () => {
    const response = await worker.fetch(
      new Request("http://local/api/health"),
      {} as Env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await readJson<{ ok: boolean; service: string }>(response);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("maricopa-county-dust-permit-sync-worker");
  });

  test("GET /api/sync rejects non-POST requests", async () => {
    const response = await worker.fetch(
      new Request("http://local/api/sync"),
      {} as Env
    );

    expect(response.status).toBe(405);

    const body = await readJson<{ error: string; success: boolean }>(response);
    expect(body.error).toBe("Method not allowed");
    expect(body.success).toBe(false);
  });

  test("GET /api/aqdata/permit-pdf requires permitId", async () => {
    const response = await worker.fetch(
      new Request("http://local/api/aqdata/permit-pdf"),
      {} as Env
    );

    expect(response.status).toBe(400);

    const body = await readJson<{ error: string; success: boolean }>(response);
    expect(body.error).toBe("permitId is required");
    expect(body.success).toBe(false);
  });

  test("unknown paths return 404", async () => {
    const response = await worker.fetch(
      new Request("http://local/does-not-exist"),
      {} as Env
    );

    expect(response.status).toBe(404);
  });
});
