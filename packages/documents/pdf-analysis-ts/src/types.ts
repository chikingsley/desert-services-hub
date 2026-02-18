export type OutputFormat = "text" | "json" | "markdown";

export interface TextExtractionResult {
  content: string;
  pageCount: number;
  pagesWithText: number;
  hasText: boolean;
  extractor: string;
}

export interface OcrResult {
  provider: string;
  model: string;
  content: string;
  pageCount: number;
}

export interface ParsePipelineOptions {
  minTextLength?: number;
}

export interface ParsePipelineResult {
  content: string;
  method: "text-layer" | "ocr-fallback";
  pageCount: number;
  steps: string[];
}

export interface OcrProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  ocrPdf(filePath: string): Promise<OcrResult>;
}

export interface Outfall {
  name: string;
  latitude: number;
  longitude: number;
}

export interface NoiExtraction {
  applicantName: string;
  applicantAddress1: string | null;
  applicantAddress2: string | null;
  applicantCity: string | null;
  applicantState: string | null;
  applicantZip: string | null;
  siteName: string;
  siteAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  acresDisturbed: number | null;
  outfalls: Outfall[];
  swpppContactFirstName: string | null;
  swpppContactLastName: string | null;
  swpppContactEmail: string | null;
  swpppContactPhone: string | null;
  permitId: string | null;
  ltfNumber: string | null;
  _extraction: {
    source: "noi";
    confidence: "high" | "medium";
    missingFields: string[];
    warnings: string[];
  };
}

export type EstimateSection =
  | "required"
  | "phase1"
  | "phase2"
  | "additional_services"
  | "misc";

export interface EstimateHeader {
  estimateNumber: string;
  revision: string | null;
  date: string;
  gcName: string;
  gcAddress: string;
  jobName: string;
  jobAddress: string;
  estimator: string;
}

export interface EstimateLineItem {
  item: string;
  description: string;
  qty: number;
  unit: string | null;
  unitPrice: number;
  total: number;
  taxable: boolean;
  section: EstimateSection;
}

export interface Estimate {
  header: EstimateHeader;
  lineItems: EstimateLineItem[];
  grandTotal: number;
  pageCount: number;
  sourceFile: string;
  parseWarnings: string[];
}
