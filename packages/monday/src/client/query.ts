/**
 * Query execution for Monday.com API.
 */
import type { GraphQLResponse } from "@monday/types/schema";

const API_URL = "https://api.monday.com/v2";
const API_VERSION = "2026-01";
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

function getApiKey(): string {
  const key = process.env.MONDAY_API_KEY;
  if (!key) {
    throw new Error("MONDAY_API_KEY environment variable is required");
  }
  return key;
}

const RETRYABLE_ERROR_MARKERS = [
  "timeout",
  "internal server",
  "rate limit",
  "429",
  "503",
  "504",
] as const;

const RETRYABLE_NETWORK_ERROR_MARKERS = [
  ...RETRYABLE_ERROR_MARKERS,
  "network",
  "fetch failed",
  "econnreset",
] as const;

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function buildRequestOptions(graphqlQuery: string): RequestInit {
  return {
    body: JSON.stringify({ query: graphqlQuery }),
    headers: {
      "Content-Type": "application/json",
      Authorization: getApiKey(),
      "API-Version": API_VERSION,
    },
    method: "POST",
  };
}

function isRetryableError(
  message: string,
  markers: readonly string[]
): boolean {
  const normalized = message.toLowerCase();
  return markers.some((marker) => normalized.includes(marker));
}

async function parseGraphQLResponse<T>(
  response: Response
): Promise<GraphQLResponse<T>> {
  try {
    return (await response.json()) as GraphQLResponse<T>;
  } catch (error) {
    throw new Error(
      `Monday API returned invalid JSON (status ${response.status})`,
      {
        cause: error,
      }
    );
  }
}

/**
 * Execute a GraphQL query against Monday.com API with retry logic.
 */
export async function query<T>(graphqlQuery: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_URL, buildRequestOptions(graphqlQuery));
      const result = await parseGraphQLResponse<T>(response);

      const firstError = result.errors?.[0];
      if (firstError) {
        const isRetryable = isRetryableError(
          firstError.message,
          RETRYABLE_ERROR_MARKERS
        );

        if (isRetryable && attempt < MAX_RETRIES) {
          lastError = new Error(`Monday API error: ${firstError.message}`);
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }

        throw new Error(`Monday API error: ${firstError.message}`);
      }

      if (!result.data) {
        throw new Error("Monday API returned no data");
      }

      return result.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRetryable = isRetryableError(
        lastError.message,
        RETRYABLE_NETWORK_ERROR_MARKERS
      );
      if (isRetryable && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("Query failed after retries");
}
