import { describe, expect, test } from "bun:test";
import { dbPoolMax, getDbPoolOptions, resolveDbPoolMax } from "@lib/db/client";

describe("resolveDbPoolMax", () => {
  test("uses test-safe default when NODE_ENV=test and DB_POOL_MAX is unset", () => {
    expect(resolveDbPoolMax({ NODE_ENV: "test" })).toBe(1);
  });

  test("uses non-test default when NODE_ENV is not test and DB_POOL_MAX is unset", () => {
    expect(resolveDbPoolMax({ NODE_ENV: "development" })).toBe(2);
    expect(resolveDbPoolMax({ NODE_ENV: "production" })).toBe(2);
  });

  test("uses DB_POOL_MAX override when valid", () => {
    expect(resolveDbPoolMax({ NODE_ENV: "test", DB_POOL_MAX: "4" })).toBe(4);
    expect(resolveDbPoolMax({ NODE_ENV: "test", DB_POOL_MAX: " 2 " })).toBe(2);
  });

  test("ignores invalid DB_POOL_MAX values", () => {
    expect(resolveDbPoolMax({ NODE_ENV: "test", DB_POOL_MAX: "0" })).toBe(1);
    expect(resolveDbPoolMax({ NODE_ENV: "test", DB_POOL_MAX: "-3" })).toBe(1);
    expect(resolveDbPoolMax({ NODE_ENV: "test", DB_POOL_MAX: "abc" })).toBe(1);
  });
});

describe("db pool options", () => {
  test("pool options stay aligned with resolved max and prepared statements disabled", () => {
    const options = getDbPoolOptions();
    expect(options).toEqual({ max: dbPoolMax, prepare: false });
  });
});
