/**
 * Document Extraction Service Client
 *
 * Typed fetch() client for the FastAPI pdf-analysis service.
 *
 * Extraction tiers (all include LLM classification):
 *   nativeExtract   — kreuzberg text layer + LLM classify  (default)
 *   ocrExtract      — GLM-OCR vision + LLM classify
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

// ---------------------------------------------------------------------------
// Shared extraction response (returned by all three extraction tiers)
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  filename: string;
  document_type: string;
  summary: string;
  extracted: Record<string, unknown>;
  text: string;
  page_count: number;
  extraction_method: string;
  model: string;
  processing_time_ms: number;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Specialist response types
// ---------------------------------------------------------------------------

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
  flags: string[];
  processing_time_ms: number;
}

export interface NOIOutfall {
  name: string;
  latitude: number;
  longitude: number;
}

export interface NOIResult {
  filename: string;
  applicant_name: string;
  applicant_address1: string | null;
  applicant_address2: string | null;
  applicant_city: string | null;
  applicant_state: string | null;
  applicant_zip: string | null;
  site_name: string;
  site_address: string | null;
  latitude: number | null;
  longitude: number | null;
  acres_disturbed: number | null;
  outfalls: NOIOutfall[];
  swppp_contact_first_name: string | null;
  swppp_contact_last_name: string | null;
  swppp_contact_email: string | null;
  swppp_contact_phone: string | null;
  permit_id: string | null;
  ltf_number: string | null;
  extraction_meta: {
    source: string;
    confidence: string;
    missing_fields: string[];
    warnings: string[];
  };
  flags: string[];
  processing_time_ms: number;
}

export interface ContractResult {
  filename: string;
  contractor: string | null;
  subcontractor: string | null;
  contract_value: number | null;
  retainage_pct: number | null;
  payment_terms: string | null;
  scope: string | null;
  project_name: string | null;
  project_address: string | null;
  effective_date: string | null;
  start_date: string | null;
  completion_date: string | null;
  requirements: string[];
  estimate_reference: string | null;
  model: string;
  processing_time_ms: number;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Extraction tiers
// ---------------------------------------------------------------------------

/** Kreuzberg text layer + LLM classify. Default for most documents. */
export function nativeExtract(
  filePath: string,
  provider = "auto"
): Promise<ExtractionResult> {
  return post<ExtractionResult>("/native-text-extraction", {
    path: filePath,
    provider,
  });
}

/** GLM-OCR vision + LLM classify. For scanned/image docs or explicit OCR pass. */
export function ocrExtract(
  filePath: string,
  provider = "local"
): Promise<ExtractionResult> {
  return post<ExtractionResult>("/ocr-extraction", {
    path: filePath,
    provider,
  });
}

/** Kreuzberg + OCR + LLM reconcile + classify. Best quality, most expensive. */
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

// ---------------------------------------------------------------------------
// Specialist extractors
// ---------------------------------------------------------------------------

/** Desert Services estimate: line items, totals, header. No LLM. */
export function extractEstimate(filePath: string): Promise<EstimateResult> {
  return post<EstimateResult>("/estimate", { path: filePath });
}

/** ADEQ NOI certificate: site, applicant, coordinates, outfalls. No LLM. */
export function extractNoi(filePath: string): Promise<NOIResult> {
  return post<NOIResult>("/noi", { path: filePath });
}

/** Subcontract/PO/work order: parties, value, scope, terms. Uses LLM. */
export function extractContract(
  filePath: string,
  provider = "auto"
): Promise<ContractResult> {
  return post<ContractResult>("/contract", { path: filePath, provider });
}

// ---------------------------------------------------------------------------
// Generic LLM gateway
// ---------------------------------------------------------------------------

export interface ChatResult {
  data: Record<string, unknown>;
  model: string;
  metadata: Record<string, unknown>;
}

/**
 * Send any prompt to the LLM gateway. Provider order: local (granite4) → gemini.
 * Pass provider="gemini" or "local" to pin a specific backend.
 */
export function chat(prompt: string, provider = "auto"): Promise<ChatResult> {
  return post<ChatResult>("/chat", { prompt, provider });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${PDF_ANALYSIS_URL}/health`);
  if (!response.ok) {
    throw new Error(`pdf-analysis health check failed: ${response.status}`);
  }
  return (await response.json()) as { status: string };
}
