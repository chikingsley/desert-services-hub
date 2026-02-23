/**
 * Microsoft Graph API helper functions
 */
import config from "@outlook/config";
import type { GraphApiQueryParams, HttpMethod } from "@outlook/types";
import { simulateGraphAPIResponse } from "@outlook/utils/mock-data";

/**
 * Build a query string from OData parameters, with special handling for $filter
 */
function buildQueryString(queryParams: GraphApiQueryParams): string {
  if (Object.keys(queryParams).length === 0) {
    return "";
  }

  const filter = queryParams.$filter;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && key !== "$filter") {
      params.append(key, String(value));
    }
  }

  let queryString = params.toString();

  if (filter) {
    const filterPart = `$filter=${encodeURIComponent(filter)}`;
    queryString = queryString ? `${queryString}&${filterPart}` : filterPart;
  }

  return queryString ? `?${queryString}` : "";
}

/**
 * Build a full request URL from path and query parameters
 */
function buildRequestUrl(
  path: string,
  queryParams: GraphApiQueryParams
): string {
  // Full URL from pagination nextLink
  if (path.startsWith("http://") || path.startsWith("https://")) {
    console.error(`Using full URL from nextLink: ${path}`);
    return path;
  }

  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const queryString = buildQueryString(queryParams);
  if (queryString) {
    console.error(`Query string: ${queryString}`);
  }

  const finalUrl = `${config.GRAPH_API_ENDPOINT}${encodedPath}${queryString}`;
  console.error(`Full URL: ${finalUrl}`);
  return finalUrl;
}

/**
 * Makes a request to the Microsoft Graph API
 */
export async function callGraphAPI<T = unknown>(
  accessToken: string,
  method: HttpMethod,
  path: string,
  data: unknown = null,
  queryParams: GraphApiQueryParams = {}
): Promise<T> {
  if (config.USE_TEST_MODE && accessToken.startsWith("test_access_token_")) {
    console.error(`TEST MODE: Simulating ${method} ${path} API call`);
    return simulateGraphAPIResponse(method, path, data, queryParams) as T;
  }

  console.error(`Making real API call: ${method} ${path}`);

  const finalUrl = buildRequestUrl(path, queryParams);
  const hasBody =
    data && (method === "POST" || method === "PATCH" || method === "PUT");

  const response = await fetch(finalUrl, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: hasBody ? JSON.stringify(data) : undefined,
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `API call failed with status ${response.status}: ${responseText}`
    );
  }

  const responseText = await response.text();
  const jsonData = responseText || "{}";

  try {
    return JSON.parse(jsonData) as T;
  } catch (error) {
    const parseError = error as Error;
    throw new Error(`Error parsing API response: ${parseError.message}`);
  }
}

/**
 * Response type for paginated results
 */
interface PaginatedResponse<T> {
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
  value: T[];
}

/**
 * Calls Graph API with pagination support to retrieve all results up to maxCount
 */
export async function callGraphAPIPaginated<T>(
  accessToken: string,
  method: HttpMethod,
  path: string,
  queryParams: GraphApiQueryParams = {},
  maxCount = 0
): Promise<PaginatedResponse<T>> {
  if (method !== "GET") {
    throw new Error("Pagination only supports GET requests");
  }

  const allItems: T[] = [];
  let nextLink: string | undefined;
  let currentUrl = path;
  let currentParams = queryParams;

  do {
    const response = await callGraphAPI<PaginatedResponse<T>>(
      accessToken,
      method,
      currentUrl,
      null,
      currentParams
    );

    if (response.value && Array.isArray(response.value)) {
      allItems.push(...response.value);
      console.error(
        `Pagination: Retrieved ${response.value.length} items, total so far: ${allItems.length}`
      );
    }

    if (maxCount > 0 && allItems.length >= maxCount) {
      console.error(`Pagination: Reached max count of ${maxCount}, stopping`);
      break;
    }

    nextLink = response["@odata.nextLink"];

    if (nextLink) {
      currentUrl = nextLink;
      currentParams = {};
      console.error(
        `Pagination: Following nextLink, ${allItems.length} items so far`
      );
    }
  } while (nextLink);

  const finalItems = maxCount > 0 ? allItems.slice(0, maxCount) : allItems;

  console.error(
    `Pagination complete: Retrieved ${finalItems.length} total items`
  );

  return {
    value: finalItems,
    "@odata.count": finalItems.length,
  };
}
