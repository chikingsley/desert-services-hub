import type { JinaSearchOptions, JinaSearchResult } from "./types";

const URL_REGEX = /\]\((https?:\/\/[^)]+)\)/;

export interface SearchJsonResult {
  data: { title: string; url: string; content: string }[];
}

function buildSearchUrl(query: string, options: JinaSearchOptions): string {
  const params = new URLSearchParams({ q: query });

  if (options.country) {
    params.set("gl", options.country);
  }
  if (options.language) {
    params.set("hl", options.language);
  }
  if (options.num) {
    params.set("num", String(options.num));
  }
  if (options.page) {
    params.set("page", String(options.page));
  }

  return `https://s.jina.ai/?${params}`;
}

function buildSearchHeaders(
  options: JinaSearchOptions,
  baseHeaders: Record<string, string>
): Record<string, string> {
  const headers = { ...baseHeaders };

  if (options.noContent) {
    headers["X-Respond-With"] = "no-content";
  }
  if (options.engine) {
    headers["X-Engine"] = options.engine;
  }
  if (options.site) {
    headers["X-Site"] = options.site;
  }
  if (options.format) {
    headers["X-Return-Format"] = options.format;
  }
  if (options.withFavicon) {
    headers["X-With-Favicon"] = "true";
  }
  if (options.noCache) {
    headers["X-No-Cache"] = "true";
  }
  if (options.timeout) {
    headers["X-Timeout"] = String(options.timeout);
  }

  return headers;
}

async function executeSearch(
  query: string,
  options: JinaSearchOptions,
  baseHeaders: Record<string, string>
): Promise<Response> {
  const url = buildSearchUrl(query, options);
  const headers = buildSearchHeaders(options, baseHeaders);
  const response = await fetch(url, { headers });

  if (response.ok) {
    return response;
  }

  throw new Error(
    `Jina search failed: ${response.status} ${response.statusText}`
  );
}

export async function searchWithHeaders(
  query: string,
  options: JinaSearchOptions,
  baseHeaders: Record<string, string>
): Promise<string> {
  const response = await executeSearch(query, options, baseHeaders);
  return response.text();
}

export async function searchJsonWithHeaders(
  query: string,
  options: Omit<JinaSearchOptions, "format">,
  baseHeaders: Record<string, string>
): Promise<SearchJsonResult> {
  const response = await executeSearch(query, options, {
    ...baseHeaders,
    Accept: "application/json",
  });
  return response.json() as Promise<SearchJsonResult>;
}

function flushParsedSearchResult(
  results: JinaSearchResult[],
  currentResult: Partial<JinaSearchResult> | null
): void {
  if (currentResult?.title && currentResult.url) {
    results.push(currentResult as JinaSearchResult);
  }
}

function parseSearchResultDetailLine(
  line: string,
  currentResult: Partial<JinaSearchResult>
): void {
  if (line.includes("](http")) {
    const urlMatch = line.match(URL_REGEX);
    if (urlMatch?.[1]) {
      currentResult.url = urlMatch[1];
    }
    return;
  }

  if (!(line.trim() && !line.startsWith("#"))) {
    return;
  }

  if (currentResult.description) {
    currentResult.content = `${currentResult.content ?? ""}\n${line}`.trim();
    return;
  }

  currentResult.description = line.trim();
}

export function parseSearchResults(rawResponse: string): JinaSearchResult[] {
  const results: JinaSearchResult[] = [];
  const lines = rawResponse.split("\n");
  let currentResult: Partial<JinaSearchResult> | null = null;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      flushParsedSearchResult(results, currentResult);
      currentResult = { title: line.slice(4).trim() };
      continue;
    }

    if (!currentResult) {
      continue;
    }

    parseSearchResultDetailLine(line, currentResult);
  }

  flushParsedSearchResult(results, currentResult);

  return results;
}
