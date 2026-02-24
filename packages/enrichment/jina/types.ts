/**
 * Jina AI Service Types
 */

// Embedding types
export type EmbeddingType = "float" | "base64" | "binary" | "ubinary";

export type EmbeddingModel =
  | "jina-embeddings-v4"
  | "jina-embeddings-v3"
  | "jina-clip-v2"
  | "jina-code-embeddings-0.5b"
  | "jina-code-embeddings-1.5b";

export type EmbeddingTask =
  | "retrieval.query"
  | "retrieval.passage"
  | "text-matching"
  | "code.query"
  | "code.passage";

// Search types
export interface JinaSearchOptions {
  country?: string;
  engine?: "browser" | "direct";
  format?: "markdown" | "html" | "text" | "screenshot" | "pageshot";
  language?: string;
  noCache?: boolean;
  noContent?: boolean;
  num?: number;
  page?: number;
  site?: string;
  timeout?: number;
  withFavicon?: boolean;
}

export interface JinaSearchResult {
  content?: string;
  description?: string;
  title: string;
  url: string;
}

// Reader types
export interface JinaReadOptions {
  engine?: "browser" | "direct" | "cf-browser-rendering";
  format?: "markdown" | "html" | "text" | "screenshot" | "pageshot";
  noCache?: boolean;
  proxyCountry?: string;
  proxyUrl?: string;
  removeImages?: boolean;
  removeSelector?: string;
  targetSelector?: string;
  timeout?: number;
  tokenBudget?: number;
  useReaderLM?: boolean;
  waitForSelector?: string;
  withGeneratedAlt?: boolean;
  withIframe?: boolean;
  withImages?: boolean | "all";
  withLinks?: boolean | "all";
}

export interface JinaReadResponse {
  content: string;
  images?: Record<string, string>;
  links?: Record<string, string>;
  title: string;
  url: string;
}

// Embeddings types
export interface JinaEmbeddingsOptions {
  dimensions?: number;
  embeddingType?: EmbeddingType;
  lateChunking?: boolean;
  model?: EmbeddingModel;
  returnMultivector?: boolean;
  task?: EmbeddingTask;
  truncate?: boolean;
}

export interface JinaEmbeddingsResponse {
  data: {
    index: number;
    embedding: number[];
  }[];
  usage: {
    total_tokens: number;
  };
}

// Reranker types
export type RerankerModel =
  | "jina-reranker-v3"
  | "jina-reranker-m0"
  | "jina-reranker-v2-base-multilingual"
  | "jina-colbert-v2"
  | "jina-colbert-v1-en"
  | "jina-reranker-v1-base-en"
  | "jina-reranker-v1-turbo-en"
  | "jina-reranker-v1-tiny-en";

export interface JinaRerankOptions {
  maxDocLength?: number;
  model?: RerankerModel;
  returnDocuments?: boolean;
  returnEmbeddings?: boolean;
  topN?: number;
  truncation?: boolean;
}

export interface JinaRerankResult {
  document?: string | { text: string } | null;
  embedding?: number[];
  index: number;
  relevance_score: number;
}

export interface JinaRerankResponse {
  model: string;
  object: "list";
  results: JinaRerankResult[];
  usage: { total_tokens: number };
}

// Classifier types
export type ClassifierModel =
  | "jina-clip-v2"
  | "jina-embeddings-v4"
  | "jina-embeddings-v3";

export interface JinaClassifyOptions {
  model?: ClassifierModel;
}

export interface JinaClassifyResult {
  index: number;
  prediction: string;
  predictions: { label: string; score: number }[];
  score: number;
}

export interface JinaClassifyResponse {
  data: JinaClassifyResult[];
}

// Segmenter types
export type Tokenizer =
  | "cl100k_base"
  | "o200k_base"
  | "p50k_base"
  | "r50k_base"
  | "p50k_edit"
  | "gpt2";

export interface JinaSegmentOptions {
  head?: number;
  maxChunkLength?: number;
  returnChunks?: boolean;
  returnTokens?: boolean;
  tail?: number;
  tokenizer?: Tokenizer;
}

export interface JinaSegmentResponse {
  chunks?: string[];
  num_chunks?: number;
  num_tokens: number;
  tokenizer: string;
  tokens?: number[];
}
