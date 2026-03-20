/**
 * Document Extraction Service Client
 *
 * Typed fetch() client for the FastAPI pdf-analysis service.
 *
 * Extraction tiers (all include LLM classification):
 *   nativeExtract   — kreuzberg text layer + LLM classify  (default)
 *   ocrExtract      — PaddleOCR + LLM classify
 *   fullExtract     — kreuzberg + OCR + LLM reconcile + classify
 *
 * Specialist extractors:
 *   extractEstimate — line items, totals, header (no LLM)
 *   extractNoi      — ADEQ NOI fields via regex (no LLM)
 *   extractContract — parties, value, scope via LLM
 */

const PDF_ANALYSIS_URL = (
  process.env.PDF_ANALYSIS_URL ?? "http://localhost:4848"
).replace(/\/$/, "");
const DEFAULT_PDF_ANALYSIS_TIMEOUT_MS = 60_000;

function readPositiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return parsed;
  }

  return fallback;
}

const PDF_ANALYSIS_TIMEOUT_MS = readPositiveIntEnv(
  "PDF_ANALYSIS_TIMEOUT_MS",
  DEFAULT_PDF_ANALYSIS_TIMEOUT_MS
);

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = PDF_ANALYSIS_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`pdf-analysis request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface ExtractionResult {
  document_type: string;
  extracted: Record<string, unknown>;
  extraction_method: string;
  filename: string;
  metadata: Record<string, unknown>;
  model: string;
  page_count: number;
  processing_time_ms: number;
  summary: string;
  text: string;
}

export interface TextExtractionResult {
  extraction_method: string;
  filename: string;
  metadata: Record<string, unknown>;
  page_count: number;
  processing_time_ms: number;
  text: string;
}

export interface EstimateHeader {
  date: string;
  estimate_number: string;
  estimator: string;
  gc_address: string | null;
  gc_name: string;
  job_address: string | null;
  job_name: string;
  revision: string | null;
}

export interface EstimateLineItem {
  description: string;
  item: string;
  qty: number;
  section: string | null;
  taxable: boolean;
  total: number;
  unit: string;
  unit_price: number;
}

export interface EstimateResult {
  additional_services: Array<{ item: string; description: string }>;
  flags: string[];
  grand_total: number;
  header: EstimateHeader;
  line_items: EstimateLineItem[];
  page_count: number;
  parse_warnings: string[];
  processing_time_ms: number;
  section_subtotals: Array<{ section: string; subtotal: number }>;
  source_file: string;
  tax: { rate: number; amount: number } | null;
}

export interface NOIOutfall {
  latitude: number;
  longitude: number;
  name: string;
}

export interface NOIResult {
  acres_disturbed: number | null;
  applicant_address1: string | null;
  applicant_address2: string | null;
  applicant_city: string | null;
  applicant_name: string;
  applicant_state: string | null;
  applicant_zip: string | null;
  extraction_meta: {
    source: string;
    confidence: string;
    missing_fields: string[];
    warnings: string[];
  };
  filename: string;
  flags: string[];
  latitude: number | null;
  longitude: number | null;
  ltf_number: string | null;
  outfalls: NOIOutfall[];
  permit_id: string | null;
  processing_time_ms: number;
  site_address: string | null;
  site_name: string;
  swppp_contact_email: string | null;
  swppp_contact_first_name: string | null;
  swppp_contact_last_name: string | null;
  swppp_contact_phone: string | null;
}

export interface ContractResult {
  completion_date: string | null;
  contract_value: number | null;
  contractor: string | null;
  effective_date: string | null;
  estimate_reference: string | null;
  filename: string;
  model: string;
  payment_terms: string | null;
  processing_time_ms: number;
  project_address: string | null;
  project_name: string | null;
  requirements: string[];
  retainage_pct: number | null;
  scope: string | null;
  start_date: string | null;
  subcontractor: string | null;
}

async function post<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetchWithTimeout(`${PDF_ANALYSIS_URL}${endpoint}`, {
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

async function postMultipart<T>(
  endpoint: string,
  buffer: Buffer,
  filename: string,
  fields?: Record<string, string>
): Promise<T> {
  const form = new FormData();
  const bytes = new Uint8Array(buffer);
  form.append("file", new Blob([bytes]), filename);

  for (const [key, value] of Object.entries(fields ?? {})) {
    form.append(key, value);
  }

  const response = await fetchWithTimeout(`${PDF_ANALYSIS_URL}${endpoint}`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `pdf-analysis ${endpoint} failed (${response.status}): ${text}`
    );
  }

  return (await response.json()) as T;
}

export function nativeExtract(
  filePath: string,
  provider = "auto"
): Promise<ExtractionResult> {
  return post<ExtractionResult>("/native-text-extraction", {
    path: filePath,
    provider,
  });
}

export function nativeExtractMultipart(
  buffer: Buffer,
  filename: string,
  provider = "auto"
): Promise<ExtractionResult> {
  return postMultipart<ExtractionResult>(
    "/native-text-extraction/upload",
    buffer,
    filename,
    { provider }
  );
}

export function extractTextMultipart(
  buffer: Buffer,
  filename: string,
  mode: "native" | "ocr" = "native"
): Promise<TextExtractionResult> {
  return postMultipart<TextExtractionResult>(
    "/text-extraction/upload",
    buffer,
    filename,
    { mode }
  );
}

export function ocrExtractMultipart(
  buffer: Buffer,
  filename: string,
  provider = "local"
): Promise<ExtractionResult> {
  return postMultipart<ExtractionResult>(
    "/ocr-extraction/upload",
    buffer,
    filename,
    { provider }
  );
}

export function fullExtractMultipart(
  buffer: Buffer,
  filename: string,
  options?: { ocrProvider?: string; reconcileModel?: string }
): Promise<ExtractionResult> {
  return postMultipart<ExtractionResult>(
    "/full-extraction/upload",
    buffer,
    filename,
    {
      ocr_provider: options?.ocrProvider ?? "local",
      reconcile_model: options?.reconcileModel ?? "zai-coding-plan/glm-4.7",
    }
  );
}

export function ocrExtract(
  filePath: string,
  provider = "local"
): Promise<ExtractionResult> {
  return post<ExtractionResult>("/ocr-extraction", {
    path: filePath,
    provider,
  });
}

export function fullExtract(
  filePath: string,
  options?: { ocrProvider?: string; reconcileModel?: string }
): Promise<ExtractionResult> {
  return post<ExtractionResult>("/full-extraction", {
    path: filePath,
    ocr_provider: options?.ocrProvider ?? "local",
    reconcile_model: options?.reconcileModel ?? "zai-coding-plan/glm-4.7",
  });
}

export function extractEstimate(filePath: string): Promise<EstimateResult> {
  return post<EstimateResult>("/estimate", { path: filePath });
}

export function extractEstimateMultipart(
  buffer: Buffer,
  filename: string
): Promise<EstimateResult> {
  return postMultipart<EstimateResult>("/estimate/upload", buffer, filename);
}

export function extractNoi(filePath: string): Promise<NOIResult> {
  return post<NOIResult>("/noi", { path: filePath });
}

export function extractNoiMultipart(
  buffer: Buffer,
  filename: string
): Promise<NOIResult> {
  return postMultipart<NOIResult>("/noi/upload", buffer, filename);
}

export function extractContract(
  filePath: string,
  provider = "local"
): Promise<ContractResult> {
  return post<ContractResult>("/contract", { path: filePath, provider });
}

export function extractContractMultipart(
  buffer: Buffer,
  filename: string,
  provider = "local"
): Promise<ContractResult> {
  return postMultipart<ContractResult>("/contract/upload", buffer, filename, {
    provider,
  });
}

export interface ChatResult {
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  model: string;
  processing_time_ms?: number;
}

export function chat(prompt: string, provider = "local"): Promise<ChatResult> {
  return post<ChatResult>("/chat", { prompt, provider });
}

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetchWithTimeout(`${PDF_ANALYSIS_URL}/health`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`pdf-analysis health check failed: ${response.status}`);
  }
  return (await response.json()) as { status: string };
}
