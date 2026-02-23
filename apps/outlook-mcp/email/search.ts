/**
 * Improved search emails functionality
 */

import { ensureAuthenticated } from "@outlook/auth/ensure";
import config from "@outlook/config";
import { resolveFolderPath } from "@outlook/email/folder-utils";
import { callGraphAPIPaginated } from "@outlook/utils/graph-api";

/**
 * MCP response content item
 */
interface MCPContentItem {
  text: string;
  type: "text";
}

/**
 * MCP response structure
 */
interface MCPResponse {
  content: MCPContentItem[];
  isError?: boolean;
}

/**
 * Arguments for search emails handler
 */
interface SearchEmailsArgs {
  count?: number;
  folder?: string;
  from?: string;
  hasAttachments?: boolean;
  mailbox?: string;
  query?: string;
  subject?: string;
  to?: string;
  unreadOnly?: boolean;
}

/**
 * Search terms structure
 */
interface SearchTerms {
  from: string;
  query: string;
  subject: string;
  to: string;
}

/**
 * Filter terms structure
 */
interface FilterTerms {
  hasAttachments?: boolean;
  unreadOnly?: boolean;
}

/**
 * Query parameters structure
 */
interface QueryParams {
  $filter?: string;
  $orderby?: string;
  $search?: string;
  $select: string;
  $top: number;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Search info structure
 */
interface SearchInfo {
  attemptsCount: number;
  filterTerms: FilterTerms;
  originalTerms: SearchTerms;
  strategies: string[];
}

/**
 * Email address structure from Graph API
 */
interface EmailAddress {
  address: string;
  name: string;
}

/**
 * Email structure from Graph API
 */
interface GraphEmail {
  from?: { emailAddress: EmailAddress };
  id: string;
  isRead: boolean;
  receivedDateTime: string;
  subject: string;
}

/**
 * Graph API search response
 */
interface GraphSearchResponse {
  _searchInfo?: SearchInfo;
  "@odata.count"?: number;
  value: GraphEmail[];
}

/**
 * Search emails handler
 */
export async function handleSearchEmails(
  args: SearchEmailsArgs
): Promise<MCPResponse> {
  const mailbox = args.mailbox;
  if (!mailbox) {
    return {
      content: [{ type: "text", text: "Mailbox address is required." }],
      isError: true,
    };
  }

  const folder = args.folder ?? "inbox";
  const requestedCount = args.count ?? 10;
  const query = args.query ?? "";
  const from = args.from ?? "";
  const to = args.to ?? "";
  const subject = args.subject ?? "";
  const hasAttachments = args.hasAttachments;
  const unreadOnly = args.unreadOnly;

  try {
    const accessToken = await ensureAuthenticated();
    const endpoint = await resolveFolderPath(accessToken, folder, mailbox);
    console.error(`Using endpoint: ${endpoint} for folder: ${folder}`);

    const response = await progressiveSearch(
      endpoint,
      accessToken,
      { query, from, to, subject },
      { hasAttachments, unreadOnly },
      requestedCount
    );

    return formatSearchResults(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === "Authentication required") {
      return {
        content: [
          {
            type: "text",
            text: "Authentication required. Please use the 'authenticate' tool first.",
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        { type: "text", text: `Error searching emails: ${errorMessage}` },
      ],
      isError: true,
    };
  }
}

/**
 * Try combined search with all terms
 */
async function tryCombinedSearch(
  endpoint: string,
  accessToken: string,
  searchTerms: SearchTerms,
  filterTerms: FilterTerms,
  maxCount: number
): Promise<GraphSearchResponse | null> {
  try {
    const params = buildSearchParams(
      searchTerms,
      filterTerms,
      Math.min(50, maxCount)
    );
    console.error("Attempting combined search with params:", params);
    const response = (await callGraphAPIPaginated(
      accessToken,
      "GET",
      endpoint,
      params,
      maxCount
    )) as GraphSearchResponse;
    if (response.value && response.value.length > 0) {
      console.error(
        `Combined search successful: found ${response.value.length} results`
      );
      return response;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Combined search failed: ${errorMessage}`);
  }
  return null;
}

/**
 * Try search with a single term
 */
async function trySingleTermSearch(
  endpoint: string,
  accessToken: string,
  term: keyof SearchTerms,
  value: string,
  maxCount: number
): Promise<GraphSearchResponse | null> {
  try {
    console.error(`Attempting search with only ${term}: "${value}"`);
    const simplifiedParams: QueryParams = {
      $top: Math.min(50, maxCount),
      $select: config.EMAIL_SELECT_FIELDS,
    };
    simplifiedParams.$search =
      term === "query" ? `"${value}"` : `${term}:"${value}"`;

    const response = (await callGraphAPIPaginated(
      accessToken,
      "GET",
      endpoint,
      simplifiedParams,
      maxCount
    )) as GraphSearchResponse;
    if (response.value && response.value.length > 0) {
      console.error(
        `Search with ${term} successful: found ${response.value.length} results`
      );
      return response;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Search with ${term} failed: ${errorMessage}`);
  }
  return null;
}

/**
 * Try search with only boolean filters
 */
async function tryBooleanFilterSearch(
  endpoint: string,
  accessToken: string,
  filterTerms: FilterTerms,
  maxCount: number
): Promise<GraphSearchResponse | null> {
  try {
    console.error("Attempting search with only boolean filters");
    const filterOnlyParams: QueryParams = {
      $top: Math.min(50, maxCount),
      $select: config.EMAIL_SELECT_FIELDS,
      $orderby: "receivedDateTime desc",
    };
    addBooleanFilters(filterOnlyParams, filterTerms);

    const response = (await callGraphAPIPaginated(
      accessToken,
      "GET",
      endpoint,
      filterOnlyParams,
      maxCount
    )) as GraphSearchResponse;
    console.error(
      `Boolean filter search found ${response.value?.length ?? 0} results`
    );
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Boolean filter search failed: ${errorMessage}`);
  }
  return null;
}

/**
 * Execute a search with progressively simpler fallback strategies
 */
async function progressiveSearch(
  endpoint: string,
  accessToken: string,
  searchTerms: SearchTerms,
  filterTerms: FilterTerms,
  maxCount: number
): Promise<GraphSearchResponse> {
  const searchAttempts: string[] = [];

  // 1. Try combined search (most specific)
  searchAttempts.push("combined-search");
  const combined = await tryCombinedSearch(
    endpoint,
    accessToken,
    searchTerms,
    filterTerms,
    maxCount
  );
  if (combined) {
    return combined;
  }

  // 2. Try each search term individually
  const searchPriority: Array<keyof SearchTerms> = [
    "subject",
    "from",
    "to",
    "query",
  ];

  for (const term of searchPriority) {
    if (searchTerms[term]) {
      searchAttempts.push(`single-term-${term}`);
      const result = await trySingleTermSearch(
        endpoint,
        accessToken,
        term,
        searchTerms[term],
        maxCount
      );
      if (result) {
        return result;
      }
    }
  }

  // 3. Try with only boolean filters
  if (filterTerms.hasAttachments === true || filterTerms.unreadOnly === true) {
    searchAttempts.push("boolean-filters-only");
    const filtered = await tryBooleanFilterSearch(
      endpoint,
      accessToken,
      filterTerms,
      maxCount
    );
    if (filtered) {
      return filtered;
    }
  }

  // 4. Final fallback: just get recent emails
  console.error("All search strategies failed, falling back to recent emails");
  searchAttempts.push("recent-emails");

  const response = (await callGraphAPIPaginated(
    accessToken,
    "GET",
    endpoint,
    {
      $top: Math.min(50, maxCount),
      $select: config.EMAIL_SELECT_FIELDS,
      $orderby: "receivedDateTime desc",
    },
    maxCount
  )) as GraphSearchResponse;
  console.error(
    `Fallback to recent emails found ${response.value?.length ?? 0} results`
  );

  response._searchInfo = {
    attemptsCount: searchAttempts.length,
    strategies: searchAttempts,
    originalTerms: searchTerms,
    filterTerms,
  };

  return response;
}

/**
 * Build search parameters from search terms and filter terms
 */
function buildSearchParams(
  searchTerms: SearchTerms,
  filterTerms: FilterTerms,
  count: number
): QueryParams {
  const params: QueryParams = {
    $top: count,
    $select: config.EMAIL_SELECT_FIELDS,
  };

  const kqlTerms: string[] = [];

  if (searchTerms.query) {
    kqlTerms.push(searchTerms.query);
  }
  if (searchTerms.subject) {
    kqlTerms.push(`subject:"${searchTerms.subject}"`);
  }
  if (searchTerms.from) {
    kqlTerms.push(`from:"${searchTerms.from}"`);
  }
  if (searchTerms.to) {
    kqlTerms.push(`to:"${searchTerms.to}"`);
  }

  if (kqlTerms.length > 0) {
    params.$search = kqlTerms.join(" ");
  } else {
    params.$orderby = "receivedDateTime desc";
  }

  if (!params.$search) {
    addBooleanFilters(params, filterTerms);
  }

  return params;
}

/**
 * Add boolean filters to query parameters
 */
function addBooleanFilters(
  params: QueryParams,
  filterTerms: FilterTerms
): void {
  const filterConditions: string[] = [];

  if (filterTerms.hasAttachments === true) {
    filterConditions.push("hasAttachments eq true");
  }

  if (filterTerms.unreadOnly === true) {
    filterConditions.push("isRead eq false");
  }

  if (filterConditions.length > 0) {
    params.$filter = filterConditions.join(" and ");
  }
}

/**
 * Format search results into a readable text format
 */
function formatSearchResults(response: GraphSearchResponse): MCPResponse {
  if (!response.value || response.value.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No emails found matching your search criteria.",
        },
      ],
    };
  }

  const emailList = response.value
    .map((email, index) => {
      const sender = email.from?.emailAddress ?? {
        name: "Unknown",
        address: "unknown",
      };
      const date = new Date(email.receivedDateTime).toLocaleString();
      const readStatus = email.isRead ? "" : "[UNREAD] ";

      return `${index + 1}. ${readStatus}${date} - From: ${sender.name} (${sender.address})\nSubject: ${email.subject}\nID: ${email.id}\n`;
    })
    .join("\n");

  let additionalInfo = "";
  if (response._searchInfo) {
    additionalInfo = `\n(Search used ${response._searchInfo.strategies.at(-1)} strategy)`;
  }

  return {
    content: [
      {
        type: "text",
        text: `Found ${response.value.length} emails matching your search criteria:${additionalInfo}\n\n${emailList}`,
      },
    ],
  };
}

export default handleSearchEmails;
