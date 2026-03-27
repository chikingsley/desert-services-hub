import { describe, expect, test } from "vitest";

import worker from "../src/index";

describe("worker fetch", () => {
  test("GET /api/health returns JSON ok", async () => {
    const res = await worker.fetch(
      new Request("http://local/api/health"),
      {} as Env,
      {} as ExecutionContext
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { ok?: boolean; service?: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("maricopa-county-dust-permit-portal-worker");
  });

  test("unknown path returns 404", async () => {
    const res = await worker.fetch(
      new Request("http://local/missing"),
      {} as Env,
      {} as ExecutionContext
    );
    expect(res.status).toBe(404);
  });
});
