import { isJsonRecord, parseJsonRecord } from "@lib/db/parsers";

const PAGE_MARKER_RE = /<!--\s*PAGE\s+(\d+)\s*-->/gi;
const MULTI_NEWLINE_RE = /\n{3,}/g;

export interface BuildCleanMarkdownInput {
  documentType: string | null;
  extractedText: string | null;
  extractionMethod: string | null;
  extractionProfile?: string | null;
  fileName: string | null;
  generatedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  model: string | null;
  pageCount: number | null;
  source: string | null;
  structuredOutput?: Record<string, unknown> | null;
  summary: string | null;
}

export interface ExtractionArtifacts {
  cleanMarkdown: string | null;
  extractionProfile: string;
  metadata: Record<string, unknown>;
  pageCount: number | null;
  structuredOutput: Record<string, unknown> | null;
  structuredOutputKey: string | null;
  structuredOutputLabel: string;
}

function quoteFrontmatter(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function normalizeBodyText(value: string): string {
  return normalizeLineEndings(value)
    .replaceAll("\t", "  ")
    .replace(MULTI_NEWLINE_RE, "\n\n")
    .trim();
}

function splitIntoPages(
  text: string
): Array<{ content: string; page: number }> {
  const normalized = normalizeLineEndings(text);
  const pages: Array<{ content: string; page: number }> = [];

  let currentPage = 1;
  let cursor = 0;

  for (const match of normalized.matchAll(PAGE_MARKER_RE)) {
    const markerIndex = match.index ?? 0;
    const beforeMarker = normalized.slice(cursor, markerIndex).trim();
    if (beforeMarker) {
      pages.push({
        page: currentPage,
        content: normalizeBodyText(beforeMarker),
      });
    }

    const nextPage = Number.parseInt(match[1] ?? "", 10);
    currentPage =
      Number.isFinite(nextPage) && nextPage > 0 ? nextPage : currentPage + 1;
    cursor = markerIndex + match[0].length;
  }

  const trailing = normalized.slice(cursor).trim();
  if (trailing) {
    pages.push({
      page: currentPage,
      content: normalizeBodyText(trailing),
    });
  }

  if (pages.length === 0) {
    const singlePage = normalizeBodyText(normalized);
    if (!singlePage) {
      return [];
    }
    return [{ page: 1, content: singlePage }];
  }

  return pages;
}

function getNestedString(
  source: Record<string, unknown> | null | undefined,
  ...path: string[]
): string | null {
  let current: unknown = source;
  for (const segment of path) {
    if (!isJsonRecord(current)) {
      return null;
    }
    current = current[segment];
  }

  if (typeof current !== "string") {
    return null;
  }

  const trimmed = current.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getStructuredHintFields(
  structuredOutput: Record<string, unknown> | null
): Record<string, string> {
  if (!structuredOutput) {
    return {};
  }

  const hints: Record<string, string> = {};
  const projectName = getNestedString(structuredOutput, "project", "name");
  const projectAddress = getNestedString(
    structuredOutput,
    "project",
    "address"
  );
  const contractor = getNestedString(structuredOutput, "parties", "contractor");
  const subcontractor = getNestedString(
    structuredOutput,
    "parties",
    "subcontractor"
  );
  const estimateReference = getNestedString(
    structuredOutput,
    "estimate_reference"
  );
  const permitId =
    getNestedString(structuredOutput, "permit_id") ??
    getNestedString(structuredOutput, "ltf_number");

  if (projectName) {
    hints.project_name = projectName;
  }
  if (projectAddress) {
    hints.project_address = projectAddress;
  }
  if (contractor) {
    hints.contractor = contractor;
  }
  if (subcontractor) {
    hints.subcontractor = subcontractor;
  }
  if (estimateReference) {
    hints.estimate_reference = estimateReference;
  }
  if (permitId) {
    hints.permit_id = permitId;
  }

  return hints;
}

export function buildCleanMarkdownArtifact(
  input: BuildCleanMarkdownInput
): string | null {
  const pages = splitIntoPages(input.extractedText ?? "");
  const summary = input.summary?.trim() ?? "";

  if (!(summary || pages.length > 0)) {
    return null;
  }

  const frontmatter = {
    file_name: input.fileName ?? "",
    document_type: input.documentType ?? "unknown",
    source: input.source ?? "unknown",
    extraction_method: input.extractionMethod ?? "unknown",
    extraction_profile: input.extractionProfile ?? "generic",
    page_count: String(input.pageCount ?? pages.length ?? 0),
    model: input.model ?? "",
    generated_at: input.generatedAt ?? new Date().toISOString(),
    ...getStructuredHintFields(input.structuredOutput ?? null),
  };

  const lines = ["---"];
  for (const [key, rawValue] of Object.entries(frontmatter)) {
    const value = rawValue.trim();
    if (!value) {
      continue;
    }
    lines.push(`${key}: ${quoteFrontmatter(value)}`);
  }
  lines.push("---", "");

  if (summary) {
    lines.push("# Summary", "", summary, "");
  }

  if (pages.length === 0) {
    lines.push("# Extracted Text", "", "_No extracted text available._");
    return lines.join("\n").trim();
  }

  lines.push("# Pages", "");
  for (const page of pages) {
    lines.push(`## Page ${page.page}`, "", page.content, "");
  }

  return lines.join("\n").trim();
}

function cloneRecord(
  value: Record<string, unknown> | null
): Record<string, unknown> {
  return value ? JSON.parse(JSON.stringify(value)) : {};
}

function parsePossiblyEncodedRecord(
  value: unknown
): Record<string, unknown> | null {
  const direct = parseJsonRecord(value);
  if (direct) {
    return direct;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (isJsonRecord(parsed)) {
      return parsed;
    }
    if (typeof parsed === "string") {
      return parseJsonRecord(parsed);
    }
  } catch {
    return null;
  }

  return null;
}

function inferStructuredOutputLabel(key: string | null): string {
  switch (key) {
    case "estimate_fields":
      return "Estimate Profile";
    case "noi_fields":
      return "NOI Profile";
    case "contract_fields":
      return "Contract Profile";
    default:
      return "Structured Output";
  }
}

export function buildExtractionMetadata(input: {
  analysisProfile?: string | null;
  providerMetadata?: Record<string, unknown> | null;
  structuredOutputKey?: string | null;
}): Record<string, unknown> {
  const metadata = cloneRecord(input.providerMetadata ?? null);
  metadata.analysis_profile = input.analysisProfile ?? "generic";
  if (input.structuredOutputKey) {
    metadata.structured_output_key = input.structuredOutputKey;
  }
  return metadata;
}

export function mergeStructuredOutput(
  structuredOutput: Record<string, unknown>,
  extraOutputKey: string | null,
  extraOutput: Record<string, unknown> | null
): Record<string, unknown> {
  const merged = cloneRecord(structuredOutput);
  if (extraOutputKey && extraOutput) {
    merged[extraOutputKey] = extraOutput;
  }
  return merged;
}

export function parseExtractionArtifacts(input: {
  cleanMarkdown: string | null;
  extractionMetadata: unknown;
  pageCount: number | null;
  rawExtraction: unknown;
}): ExtractionArtifacts {
  const metadata = cloneRecord(
    parsePossiblyEncodedRecord(input.extractionMetadata)
  );
  const rawExtraction = parsePossiblyEncodedRecord(input.rawExtraction);
  const structuredOutputKey =
    typeof metadata.structured_output_key === "string"
      ? metadata.structured_output_key
      : null;
  const extractionProfile =
    typeof metadata.analysis_profile === "string"
      ? metadata.analysis_profile
      : "generic";

  let structuredOutput = rawExtraction;
  if (
    structuredOutputKey &&
    rawExtraction &&
    isJsonRecord(rawExtraction[structuredOutputKey])
  ) {
    structuredOutput = cloneRecord(
      rawExtraction[structuredOutputKey] as Record<string, unknown>
    );
  }

  return {
    cleanMarkdown: input.cleanMarkdown?.trim() || null,
    extractionProfile,
    metadata,
    pageCount: input.pageCount,
    structuredOutput,
    structuredOutputKey,
    structuredOutputLabel: inferStructuredOutputLabel(structuredOutputKey),
  };
}
