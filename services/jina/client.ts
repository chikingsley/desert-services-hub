/**
 * Jina AI API Client
 *
 * Comprehensive client for Jina AI services:
 * - Reader: Extract content from URLs
 * - Search: Web search
 * - Embeddings: Text embeddings for RAG
 * - Reranker: Improve search relevance
 * - Classifier: Zero-shot classification
 * - Segmenter: Tokenization and chunking
 *
 * Rate Limits (standard tier):
 * - Embeddings/Reranker: 500 RPM, 1M TPM
 * - Reader (r.jina.ai): 200 RPM
 * - Search (s.jina.ai): 40 RPM
 * - Classifier: 20 RPM
 * - Segmenter: 200 RPM
 */
import type {
  JinaClassifyOptions,
  JinaClassifyResponse,
  JinaEmbeddingsOptions,
  JinaEmbeddingsResponse,
  JinaReadOptions,
  JinaReadResponse,
  JinaRerankOptions,
  JinaRerankResponse,
  JinaSearchOptions,
  JinaSearchResult,
  JinaSegmentOptions,
  JinaSegmentResponse,
  Tokenizer,
} from "./types";

const URL_REGEX = /\]\((https?:\/\/[^)]+)\)/;

function getApiKey(): string {
  const key = process.env.JINA_API_KEY;
  if (key) {
    return key;
  }
  throw new Error("JINA_API_KEY environment variable is required");
}

function buildAuthHeader(): Record<string, string> {
  return { Authorization: `Bearer ${getApiKey()}` };
}

function buildReadHeaders(
  options: JinaReadOptions,
  baseHeaders: Record<string, string>
): Record<string, string> {
  const headers = { ...baseHeaders };

  const directMappings: [keyof JinaReadOptions, string][] = [
    ["format", "X-Return-Format"],
    ["engine", "X-Engine"],
    ["targetSelector", "X-Target-Selector"],
    ["waitForSelector", "X-Wait-For-Selector"],
    ["removeSelector", "X-Remove-Selector"],
    ["proxyUrl", "X-Proxy-Url"],
    ["proxyCountry", "X-Proxy"],
  ];

  for (const [key, header] of directMappings) {
    const value = options[key];
    if (value !== undefined) {
      headers[header] = String(value);
    }
  }

  const booleanMappings: [keyof JinaReadOptions, string, string][] = [
    ["withGeneratedAlt", "X-With-Generated-Alt", "true"],
    ["withIframe", "X-With-Iframe", "true"],
    ["noCache", "X-No-Cache", "true"],
    ["removeImages", "X-Retain-Images", "none"],
    ["useReaderLM", "X-Respond-With", "readerlm-v2"],
  ];

  for (const [key, header, value] of booleanMappings) {
    if (options[key]) {
      headers[header] = value;
    }
  }

  if (options.withLinks) {
    headers["X-With-Links-Summary"] =
      options.withLinks === "all" ? "all" : "true";
  }
  if (options.withImages) {
    headers["X-With-Images-Summary"] =
      options.withImages === "all" ? "all" : "true";
  }
  if (options.timeout) {
    headers["X-Timeout"] = String(options.timeout);
  }
  if (options.tokenBudget) {
    headers["X-Token-Budget"] = String(options.tokenBudget);
  }

  return headers;
}

async function jinaPost<T>(
  url: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...buildAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jina API error: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// Search API (s.jina.ai)
// ============================================================================

type SearchJsonResult = {
  data: Array<{ title: string; url: string; content: string }>;
};

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

/**
 * Search the web - returns raw markdown
 */
export async function search(
  query: string,
  options: JinaSearchOptions = {}
): Promise<string> {
  const response = await executeSearch(query, options, buildAuthHeader());
  return response.text();
}

/**
 * Search the web - returns JSON
 */
export async function searchJson(
  query: string,
  options: Omit<JinaSearchOptions, "format"> = {}
): Promise<SearchJsonResult> {
  const response = await executeSearch(query, options, {
    ...buildAuthHeader(),
    Accept: "application/json",
  });
  return response.json() as Promise<SearchJsonResult>;
}

/**
 * Parse search results from raw markdown response
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Parsing logic is inherently complex
export function parseSearchResults(rawResponse: string): JinaSearchResult[] {
  const results: JinaSearchResult[] = [];
  const lines = rawResponse.split("\n");
  let currentResult: Partial<JinaSearchResult> | null = null;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (currentResult?.title && currentResult?.url) {
        results.push(currentResult as JinaSearchResult);
      }
      currentResult = { title: line.slice(4).trim() };
    } else if (currentResult) {
      if (line.includes("](http")) {
        const urlMatch = line.match(URL_REGEX);
        if (urlMatch) {
          currentResult.url = urlMatch[1];
        }
      } else if (line.trim() && !line.startsWith("#")) {
        if (currentResult.description) {
          currentResult.content =
            `${currentResult.content ?? ""}\n${line}`.trim();
        } else {
          currentResult.description = line.trim();
        }
      }
    }
  }

  if (currentResult?.title && currentResult?.url) {
    results.push(currentResult as JinaSearchResult);
  }

  return results;
}

// ============================================================================
// Reader API (r.jina.ai)
// ============================================================================

type ReadJsonResult = { data: JinaReadResponse };

async function executeRead(
  targetUrl: string,
  options: JinaReadOptions,
  baseHeaders: Record<string, string>
): Promise<Response> {
  const url = `https://r.jina.ai/${targetUrl}`;
  const headers = buildReadHeaders(options, baseHeaders);
  const response = await fetch(url, { headers });

  if (response.ok) {
    return response;
  }

  throw new Error(
    `Jina read failed: ${response.status} ${response.statusText}`
  );
}

/**
 * Read and extract content from a URL - returns markdown
 */
export async function read(
  targetUrl: string,
  options: JinaReadOptions = {}
): Promise<string> {
  const response = await executeRead(targetUrl, options, buildAuthHeader());
  return response.text();
}

/**
 * Read URL - returns JSON
 */
export async function readJson(
  targetUrl: string,
  options: JinaReadOptions = {}
): Promise<ReadJsonResult> {
  const response = await executeRead(targetUrl, options, {
    ...buildAuthHeader(),
    Accept: "application/json",
  });
  return response.json() as Promise<ReadJsonResult>;
}

// ============================================================================
// Embeddings API
// ============================================================================

/**
 * Generate embeddings for text or images
 */
export async function embed(
  input: string | string[],
  options: JinaEmbeddingsOptions = {}
): Promise<JinaEmbeddingsResponse> {
  const body: Record<string, unknown> = {
    model: options.model ?? "jina-embeddings-v3",
    input: Array.isArray(input) ? input : [input],
  };

  if (options.embeddingType) {
    body.embedding_type = options.embeddingType;
  }
  if (options.task) {
    body.task = options.task;
  }
  if (options.dimensions) {
    body.dimensions = options.dimensions;
  }
  if (options.truncate !== undefined) {
    body.truncate = options.truncate;
  }
  if (options.lateChunking) {
    body.late_chunking = options.lateChunking;
  }
  if (options.returnMultivector) {
    body.return_multivector = options.returnMultivector;
  }

  return await jinaPost<JinaEmbeddingsResponse>(
    "https://api.jina.ai/v1/embeddings",
    body
  );
}

/**
 * Generate embeddings optimized for search queries
 */
export async function embedQuery(
  query: string,
  options: Omit<JinaEmbeddingsOptions, "task"> = {}
): Promise<number[]> {
  const response = await embed(query, { ...options, task: "retrieval.query" });
  return response.data[0]?.embedding ?? [];
}

/**
 * Generate embeddings optimized for documents
 */
export async function embedDocument(
  document: string,
  options: Omit<JinaEmbeddingsOptions, "task"> = {}
): Promise<number[]> {
  const response = await embed(document, {
    ...options,
    task: "retrieval.passage",
  });
  return response.data[0]?.embedding ?? [];
}

/**
 * Generate embeddings for multiple documents
 */
export async function embedDocuments(
  documents: string[],
  options: Omit<JinaEmbeddingsOptions, "task"> = {}
): Promise<number[][]> {
  const response = await embed(documents, {
    ...options,
    task: "retrieval.passage",
  });
  return response.data.map((d) => d.embedding);
}

// ============================================================================
// Reranker API
// ============================================================================

/**
 * Rerank documents by relevance to a query
 */
export async function rerank(
  query: string,
  documents: string[],
  options: JinaRerankOptions = {}
): Promise<JinaRerankResponse> {
  const body: Record<string, unknown> = {
    model: options.model ?? "jina-reranker-v2-base-multilingual",
    query,
    documents,
  };

  if (options.topN) {
    body.top_n = options.topN;
  }
  if (options.returnDocuments !== undefined) {
    body.return_documents = options.returnDocuments;
  }

  return await jinaPost<JinaRerankResponse>(
    "https://api.jina.ai/v1/rerank",
    body
  );
}

/**
 * Rerank and return top N document indices
 */
export async function rerankTopN(
  query: string,
  documents: string[],
  topN: number
): Promise<number[]> {
  const response = await rerank(query, documents, {
    topN,
    returnDocuments: false,
  });
  return response.results.map((r) => r.index);
}

// ============================================================================
// Classifier API
// ============================================================================

/**
 * Zero-shot classification
 */
export async function classify(
  input: string | string[],
  labels: string[],
  options: JinaClassifyOptions = {}
): Promise<JinaClassifyResponse> {
  const body: Record<string, unknown> = {
    model: options.model ?? "jina-embeddings-v3",
    input: Array.isArray(input) ? input : [input],
    labels,
  };

  return await jinaPost<JinaClassifyResponse>(
    "https://api.jina.ai/v1/classify",
    body
  );
}

/**
 * Classify a single text and return the top prediction
 */
export async function classifyOne(
  text: string,
  labels: string[],
  options: JinaClassifyOptions = {}
): Promise<{ label: string; score: number }> {
  const response = await classify(text, labels, options);
  const result = response.data[0];
  return { label: result?.prediction ?? "", score: result?.score ?? 0 };
}

// ============================================================================
// Segmenter API
// ============================================================================

/**
 * Tokenize text and optionally segment into chunks
 */
export async function segment(
  content: string,
  options: JinaSegmentOptions = {}
): Promise<JinaSegmentResponse> {
  const body: Record<string, unknown> = { content };

  if (options.tokenizer) {
    body.tokenizer = options.tokenizer;
  }
  if (options.returnTokens) {
    body.return_tokens = options.returnTokens;
  }
  if (options.returnChunks) {
    body.return_chunks = options.returnChunks;
  }
  if (options.maxChunkLength) {
    body.max_chunk_length = options.maxChunkLength;
  }
  if (options.head) {
    body.head = options.head;
  }
  if (options.tail) {
    body.tail = options.tail;
  }

  return await jinaPost<JinaSegmentResponse>("https://segment.jina.ai/", body);
}

/**
 * Split text into semantic chunks
 */
export async function chunk(
  content: string,
  maxChunkLength = 1000
): Promise<string[]> {
  const response = await segment(content, {
    returnChunks: true,
    maxChunkLength,
  });
  return response.chunks ?? [];
}

/**
 * Count tokens in text
 */
export async function countTokens(
  content: string,
  tokenizer: Tokenizer = "cl100k_base"
): Promise<number> {
  const response = await segment(content, { tokenizer });
  return response.num_tokens;
}
