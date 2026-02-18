/**
 * PDF Analysis Service Client
 *
 * Typed fetch() client for the FastAPI pdf-analysis service.
 */

const PDF_ANALYSIS_URL = (
  process.env.PDF_ANALYSIS_URL ?? "http://localhost:4848"
).replace(/\/$/, "");

// -- Types --

export interface EstimateHeader {
  estimate_number: string;
  date: string;
  gc_name: string;
  gc_address: string | null;
  job_name: string;
  job_address: string | null;
  estimator: string;
  revision: string | null;
}

export interface EstimateLineItem {
  item: string;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  total: number;
  taxable: boolean;
  section: string | null;
}

export interface EstimateResult {
  header: EstimateHeader;
  line_items: EstimateLineItem[];
  additional_services: Array<{ item: string; description: string }>;
  section_subtotals: Array<{ section: string; subtotal: number }>;
  tax: { rate: number; amount: number } | null;
  grand_total: number;
  page_count: number;
  source_file: string;
  parse_warnings: string[];
  processing_time_ms: number;
}

export interface ClassifyResult {
  document_type: string;
  confidence: number;
  indicators: string[];
  page_count: number;
  filename: string;
  first_page_snippet: string;
}

export interface IngestResult {
  filename: string;
  document_type: string;
  summary: string;
  extracted: Record<string, unknown>;
  page_count: number;
  text_method: string;
  model: string;
  processing_time_ms: number;
}

export interface OcrResult {
  provider: string;
  text: string;
  pages: number[];
  processing_time_ms: number;
  model: string;
  confidence: number | null;
  metadata: Record<string, unknown>;
}

export interface ParseResult {
  filename: string;
  reconciled_markdown: string;
  page_count: number;
  processing_time_ms: number;
  ocr_model: string;
  reconcile_model: string;
  metadata: Record<string, unknown>;
}

// -- Client --

async function post<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${PDF_ANALYSIS_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `pdf-analysis ${endpoint} failed (${response.status}): ${text}`
    );
  }

  return (await response.json()) as T;
}

export function ocrPdf(
  pdfPath: string,
  options?: { provider?: string; pages?: string }
): Promise<OcrResult> {
  return post<OcrResult>("/ocr", {
    path: pdfPath,
    provider: options?.provider ?? "auto",
    pages: options?.pages ?? null,
  });
}

export function extractEstimate(pdfPath: string): Promise<EstimateResult> {
  return post<EstimateResult>("/estimate", { path: pdfPath });
}

export function classifyPdf(pdfPath: string): Promise<ClassifyResult[]> {
  return post<ClassifyResult[]>("/classify", { path: pdfPath });
}

export function classifyText(
  text: string,
  filename = "",
  provider = "auto"
): Promise<ClassifyResult> {
  return post<ClassifyResult>("/classify-text", { text, filename, provider });
}

export function ingestPdf(
  pdfPath: string,
  provider = "auto"
): Promise<IngestResult[]> {
  return post<IngestResult[]>("/ingest", { path: pdfPath, provider });
}

export function parsePdf(
  pdfPath: string,
  options?: { ocrProvider?: string; reconcileModel?: string }
): Promise<ParseResult[]> {
  return post<ParseResult[]>("/parse", {
    path: pdfPath,
    ocr_provider: options?.ocrProvider ?? "local",
    reconcile_model: options?.reconcileModel ?? "zai-coding-plan/glm-4.7",
  });
}

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${PDF_ANALYSIS_URL}/health`);
  if (!response.ok) {
    throw new Error(`pdf-analysis health check failed: ${response.status}`);
  }
  return (await response.json()) as { status: string };
}
