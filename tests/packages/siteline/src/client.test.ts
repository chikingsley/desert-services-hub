import { afterEach, describe, expect, test } from "bun:test";
import {
  getGraphQLOperationType,
  isReadOnlyGraphQLQuery,
  SitelineClient,
  SitelineError,
} from "@siteline/client";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("SitelineClient", () => {
  test("classifies GraphQL operation types for safety checks", () => {
    expect(getGraphQLOperationType("query x { currentCompany { id } }")).toBe(
      "query"
    );
    expect(getGraphQLOperationType("mutation x { doThing }")).toBe("mutation");
    expect(getGraphQLOperationType("{ currentCompany { id } }")).toBe(
      "selection-set"
    );
    expect(getGraphQLOperationType("")).toBe("unknown");
  });

  test("read-only predicate rejects mutation and subscription operations", () => {
    expect(isReadOnlyGraphQLQuery("query x { currentCompany { id } }")).toBe(
      true
    );
    expect(isReadOnlyGraphQLQuery("{ currentCompany { id } }")).toBe(true);
    expect(isReadOnlyGraphQLQuery("mutation x { dangerousThing }")).toBe(false);
    expect(isReadOnlyGraphQLQuery("subscription x { updates }")).toBe(false);
  });

  test("queryReadOnly blocks mutations before network calls", async () => {
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      return Promise.reject(
        new Error("fetch should not be called for mutation")
      );
    }) as unknown as typeof fetch;

    const client = new SitelineClient({
      apiKey: "test-key",
      apiUrl: "https://example.invalid/graphql",
    });

    try {
      await client.queryReadOnly("mutation x { dangerousThing }");
      throw new Error("Expected read-only guard to reject mutation");
    } catch (error) {
      expect(error).toBeInstanceOf(SitelineError);
      const sitelineError = error as SitelineError;
      expect(sitelineError.message).toContain("read-only");
    }

    expect(called).toBe(false);
  });

  test("retries once on HTTP 429 and then succeeds", async () => {
    let callCount = 0;
    globalThis.fetch = (() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ errors: [{ message: "429" }] }), {
            headers: {
              "content-type": "application/json",
              "retry-after": "0",
            },
            status: 429,
          })
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              currentCompany: {
                id: "508d0a10-1630-48ae-be4c-d61c94c8c740",
                name: "Desert Services",
              },
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          }
        )
      );
    }) as unknown as typeof fetch;

    const client = new SitelineClient({
      apiKey: "test-key",
      apiUrl: "https://example.invalid/graphql",
      maxRetries: 1,
    });

    const result = await client.currentCompany();
    expect(result.currentCompany.name).toBe("Desert Services");
    expect(callCount).toBe(2);
  });
});
