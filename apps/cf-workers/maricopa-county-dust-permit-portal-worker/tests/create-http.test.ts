import { describe, expect, test } from "vitest";

import { handleMaricopaCreatePost } from "../src/create";

const readJsonBody = (res: Response): Promise<Record<string, unknown>> =>
  res.json() as Promise<Record<string, unknown>>;

describe("handleMaricopaCreatePost (validation only, no browser)", () => {
  test("rejects non-POST with 405", async () => {
    const res = await handleMaricopaCreatePost(
      new Request("http://local/api/create", { method: "GET" }),
      {
        BROWSER: {},
        DUST_PERMIT_PASSWORD: "p",
        DUST_PERMIT_USERNAME: "u",
      }
    );
    expect(res.status).toBe(405);
    const body = await readJsonBody(res);
    expect(body.error).toBe("Method not allowed");
  });

  test("returns 500 when BROWSER binding is missing", async () => {
    const res = await handleMaricopaCreatePost(
      new Request("http://local/api/create", {
        body: JSON.stringify({ flow: "new-company" }),
        method: "POST",
      }),
      {
        DUST_PERMIT_PASSWORD: "p",
        DUST_PERMIT_USERNAME: "u",
      }
    );
    expect(res.status).toBe(500);
    const body = await readJsonBody(res);
    expect(body.error).toBe("BROWSER binding is not configured");
  });

  test("returns 400 when portal credentials are missing", async () => {
    const res = await handleMaricopaCreatePost(
      new Request("http://local/api/create", {
        body: JSON.stringify({ flow: "new-company" }),
        method: "POST",
      }),
      { BROWSER: {} }
    );
    expect(res.status).toBe(400);
    const body = await readJsonBody(res);
    expect(String(body.error)).toContain("DUST_PERMIT_USERNAME");
  });

  test("returns 400 when username/password are only whitespace", async () => {
    const res = await handleMaricopaCreatePost(
      new Request("http://local/api/create", {
        body: JSON.stringify({ flow: "new-company" }),
        method: "POST",
      }),
      {
        BROWSER: {},
        DUST_PERMIT_PASSWORD: "   ",
        DUST_PERMIT_USERNAME: "  ",
      }
    );
    expect(res.status).toBe(400);
  });
});
