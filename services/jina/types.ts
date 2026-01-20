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
export type JinaSearchOptions = {
  noContent?: boolean;
  engine?: "browser" | "direct";
  site?: string;
  country?: string;
  language?: string;
  num?: number;
  page?: number;
  format?: "markdown" | "html" | "text" | "screenshot" | "pageshot";
  withFavicon?: boolean;
  noCache?: boolean;
  timeout?: number;
};

export type JinaSearchResult = {
  title: string;
  url: string;
  description?: string;
  content?: string;
};

// Reader types
export type JinaReadOptions = {
  format?: "markdown" | "html" | "text" | "screenshot" | "pageshot";
  engine?: "browser" | "direct" | "cf-browser-rendering";
  targetSelector?: string;
  waitForSelector?: string;
  removeSelector?: string;
  withLinks?: boolean | "all";
  withImages?: boolean | "all";
  withGeneratedAlt?: boolean;
  withIframe?: boolean;
  noCache?: boolean;
  timeout?: number;
  tokenBudget?: number;
  removeImages?: boolean;
  useReaderLM?: boolean;
  proxyUrl?: string;
  proxyCountry?: string;
};

export type JinaReadResponse = {
  title: string;
  content: string;
  url: string;
  links?: Record<string, string>;
  images?: Record<string, string>;
};

// Embeddings types
export type JinaEmbeddingsOptions = {
  model?: EmbeddingModel;
  embeddingType?: EmbeddingType;
  task?: EmbeddingTask;
  dimensions?: number;
  truncate?: boolean;
  lateChunking?: boolean;
  returnMultivector?: boolean;
};

export type JinaEmbeddingsResponse = {
  data: Array<{
    index: number;
    embedding: number[];
  }>;
  usage: {
    total_tokens: number;
  };
};

// Reranker types
export type RerankerModel =
  | "jina-reranker-m0"
  | "jina-reranker-v2-base-multilingual"
  | "jina-colbert-v2";

export type JinaRerankOptions = {
  model?: RerankerModel;
  topN?: number;
  returnDocuments?: boolean;
};

export type JinaRerankResult = {
  index: number;
  relevance_score: number;
  document?: { text: string };
};

export type JinaRerankResponse = {
  model: string;
  results: JinaRerankResult[];
};

// Classifier types
export type ClassifierModel =
  | "jina-clip-v2"
  | "jina-embeddings-v4"
  | "jina-embeddings-v3";

export type JinaClassifyOptions = {
  model?: ClassifierModel;
};

export type JinaClassifyResult = {
  index: number;
  prediction: string;
  score: number;
  predictions: Array<{ label: string; score: number }>;
};

export type JinaClassifyResponse = {
  data: JinaClassifyResult[];
};

// Segmenter types
export type Tokenizer =
  | "cl100k_base"
  | "o200k_base"
  | "p50k_base"
  | "r50k_base"
  | "p50k_edit"
  | "gpt2";

export type JinaSegmentOptions = {
  tokenizer?: Tokenizer;
  returnTokens?: boolean;
  returnChunks?: boolean;
  maxChunkLength?: number;
  head?: number;
  tail?: number;
};

export type JinaSegmentResponse = {
  num_tokens: number;
  tokenizer: string;
  num_chunks?: number;
  tokens?: number[];
  chunks?: string[];
};
