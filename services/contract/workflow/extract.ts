/**
 * Citation-Based Extraction
 *
 * Extract structured data from contract documents with source citations.
 * Every extracted value must have a quote from the source document.
 *
 * Key principle: If it's not in the documents, it doesn't go in the output.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import {
  type Citation,
  type ContractExtractionOutput,
  ContractExtractionOutputSchema,
  type DocumentType,
  validateAllCitations,
} from "../schemas";
import type { CollectedDocument } from "./collect";

// ============================================================================
// Regex Patterns (module-level for performance)
// ============================================================================

const RE_PDF_EXTENSION = /\.pdf$/i;

// ============================================
// Types
// ============================================

export interface ExtractionInput {
  /** Project folder containing PDFs */
  projectFolder: string;
  /** Documents to extract from */
  documents: CollectedDocument[];
}

export interface ExtractionResult {
  /** Extracted data with citations */
  output: ContractExtractionOutput;
  /** OCR text by document type and page */
  ocrText: Map<DocumentType, string[]>;
  /** Validation result */
  validation: {
    valid: boolean;
    invalidCitations: Array<{ field: string; citation: Citation }>;
  };
  /** Extraction errors */
  errors: string[];
}

export interface OCRResult {
  /** Document type */
  documentType: DocumentType;
  /** Path to original PDF */
  pdfPath: string;
  /** Path to OCR markdown output */
  ocrPath: string;
  /** Full OCR text */
  fullText: string;
  /** Text by page (0-indexed) */
  pages: string[];
}

// ============================================
// OCR Functions
// ============================================

// Gemini model for fallback OCR
const GEMINI_OCR_MODEL = "gemini-3-flash-preview";

// OCR extraction prompt for Gemini
const GEMINI_OCR_PROMPT = `Extract all text from this PDF document. 

IMPORTANT:
- Preserve the document structure exactly as it appears
- Keep all tables in markdown table format
- Preserve all numbers, amounts, and formatting exactly
- Output as markdown with page markers like '--- Page 1 ---' at the start of each page
- Do NOT summarize or interpret - extract verbatim text only
- Include ALL text, headers, footers, and fine print`;

/**
 * Sleep helper for retry delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (rate limit or server error).
 */
function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("rate limit") ||
    message.includes("Rate limit")
  );
}

/**
 * Run Mistral OCR on a PDF file (internal implementation).
 * Uses the mistral-mcp CLI.
 */
function runMistralOCR(pdfPath: string): Promise<string> {
  const ocrPath = pdfPath.replace(RE_PDF_EXTENSION, ".md");

  // Run mistral-mcp ocr command
  return new Promise((resolve, reject) => {
    const mistralPath = join(import.meta.dir, "../../mistral");

    const proc = spawn("uv", ["run", "mistral-mcp", "ocr", pdfPath], {
      cwd: mistralPath,
      env: { ...process.env },
    });

    let _stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      _stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        // Read the generated markdown file
        if (existsSync(ocrPath)) {
          resolve(readFileSync(ocrPath, "utf-8"));
        } else {
          reject(
            new Error(`OCR completed but output file not found: ${ocrPath}`)
          );
        }
      } else {
        reject(new Error(`OCR failed (code ${code}): ${stderr}`));
      }
    });

    proc.on("error", (error) => {
      reject(new Error(`Failed to run OCR: ${error.message}`));
    });
  });
}

/**
 * Run Gemini OCR on a PDF file (fallback).
 * Uses the @google/genai SDK with gemini-3-flash-preview.
 */
async function runGeminiOCR(pdfPath: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is required for fallback OCR"
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const pdfData = readFileSync(pdfPath);

  const response = await ai.models.generateContent({
    model: GEMINI_OCR_MODEL,
    contents: [
      { text: GEMINI_OCR_PROMPT },
      {
        inlineData: {
          mimeType: "application/pdf",
          data: pdfData.toString("base64"),
        },
      },
    ],
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini OCR returned empty response");
  }

  return text;
}

/**
 * Run OCR on a PDF file with retry logic and Gemini fallback.
 *
 * Strategy:
 * 1. Check if OCR output already exists (cache hit)
 * 2. Try Mistral OCR with 3 retries and exponential backoff
 * 3. If Mistral fails, fall back to Gemini 3.0 Flash Preview
 * 4. Save the result to a .md file for future use
 */
export async function runOCR(pdfPath: string): Promise<string> {
  const ocrPath = pdfPath.replace(RE_PDF_EXTENSION, ".md");

  // Check if OCR already exists (cache hit)
  if (existsSync(ocrPath)) {
    return readFileSync(ocrPath, "utf-8");
  }

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  // Try Mistral OCR with retries
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[OCR] Attempting Mistral OCR (attempt ${attempt + 1}/${MAX_RETRIES})...`
      );
      const result = await runMistralOCR(pdfPath);

      // Save to file for future use
      writeFileSync(ocrPath, result);
      console.log(`[OCR] Mistral OCR succeeded, saved to ${ocrPath}`);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[OCR] Mistral attempt ${attempt + 1} failed: ${lastError.message}`
      );

      if (isRetryableError(error) && attempt < MAX_RETRIES - 1) {
        const delayMs = 1000 * 2 ** attempt; // 1s, 2s, 4s
        console.log(
          `[OCR] Retryable error, waiting ${delayMs}ms before retry...`
        );
        await sleep(delayMs);
      }
    }
  }

  // Mistral failed, try Gemini fallback
  console.log(
    "[OCR] Mistral OCR failed after retries, falling back to Gemini 3.0 Flash Preview..."
  );

  try {
    const result = await runGeminiOCR(pdfPath);

    // Save to file for future use
    writeFileSync(ocrPath, result);
    console.log(`[OCR] Gemini OCR succeeded, saved to ${ocrPath}`);
    return result;
  } catch (geminiError) {
    const geminiMsg =
      geminiError instanceof Error ? geminiError.message : String(geminiError);
    throw new Error(
      `OCR failed: Mistral error: ${lastError?.message || "unknown"}, Gemini error: ${geminiMsg}`
    );
  }
}

/**
 * Parse OCR markdown into pages.
 */
export function parseOCRPages(ocrText: string): string[] {
  // Split by page markers
  const pagePattern = /--- Page (\d+) ---/g;
  const parts = ocrText.split(pagePattern);

  // parts alternates: [pre-text, page1Num, page1Content, page2Num, page2Content, ...]
  const pages: string[] = [];

  for (let i = 1; i < parts.length; i += 2) {
    const pageNum = Number.parseInt(parts[i], 10);
    const content = parts[i + 1]?.trim() || "";

    // Ensure pages array is large enough
    while (pages.length < pageNum) {
      pages.push("");
    }
    pages[pageNum - 1] = content;
  }

  return pages;
}

/**
 * Run OCR on all documents.
 */
export async function runOCROnAll(
  documents: CollectedDocument[]
): Promise<OCRResult[]> {
  const results: OCRResult[] = [];

  for (const doc of documents) {
    if (!doc.path.toLowerCase().endsWith(".pdf")) {
      continue;
    }

    try {
      const fullText = await runOCR(doc.path);
      const pages = parseOCRPages(fullText);

      results.push({
        documentType: doc.type,
        pdfPath: doc.path,
        ocrPath: doc.path.replace(RE_PDF_EXTENSION, ".md"),
        fullText,
        pages,
      });
    } catch (error) {
      console.error(`OCR failed for ${doc.name}: ${error}`);
    }
  }

  return results;
}

// ============================================
// Citation Search
// ============================================

/**
 * Search for a text pattern in OCR pages and return a citation.
 */
export function findCitation(
  pattern: string | RegExp,
  ocrResults: OCRResult[]
): Citation | null {
  for (const result of ocrResults) {
    for (let pageIdx = 0; pageIdx < result.pages.length; pageIdx++) {
      const pageText = result.pages[pageIdx];
      if (!pageText) {
        continue;
      }

      const matches =
        typeof pattern === "string"
          ? pageText.toLowerCase().includes(pattern.toLowerCase())
          : pattern.test(pageText);

      if (matches) {
        // Extract context around match
        let quote: string;
        if (typeof pattern === "string") {
          const idx = pageText.toLowerCase().indexOf(pattern.toLowerCase());
          const start = Math.max(0, idx - 20);
          const end = Math.min(pageText.length, idx + pattern.length + 50);
          quote = pageText.substring(start, end).trim();
        } else {
          const match = pageText.match(pattern);
          if (match) {
            const idx = match.index ?? 0;
            const start = Math.max(0, idx - 20);
            const end = Math.min(pageText.length, idx + match[0].length + 50);
            quote = pageText.substring(start, end).trim();
          } else {
            quote = pageText.substring(0, 100);
          }
        }

        return {
          document: result.documentType,
          page: pageIdx + 1,
          quote,
        };
      }
    }
  }

  return null;
}

/**
 * Extract a value with its citation.
 */
export function extractWithCitation<T>(
  value: T | null,
  pattern: string | RegExp,
  ocrResults: OCRResult[]
): {
  value: T | null;
  source: Citation | null;
  confidence: "high" | "medium" | "low";
} {
  if (value === null) {
    return { value: null, source: null, confidence: "low" };
  }

  const citation = findCitation(pattern, ocrResults);

  return {
    value,
    source: citation,
    confidence: citation ? "high" : "low",
  };
}

// ============================================
// Extraction Prompts
// ============================================

/**
 * System prompt for extraction that enforces citation requirements.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are a contract data extraction assistant. Your job is to extract structured data from construction contract documents.

CRITICAL RULES:
1. ONLY extract information that is EXPLICITLY stated in the document text provided.
2. If information is not found, use null - NEVER guess or assume.
3. For every value you extract, you MUST provide the exact quote from the document.
4. The quote must be a direct copy of text from the document, not a paraphrase.
5. Include the page number where you found the information.

COMMON PITFALLS TO AVOID:
- Do NOT assume the project name is the owner name unless explicitly stated
- Do NOT invent retention percentages - if not stated, use null
- Do NOT make up billing terms like "Net 30" unless explicitly in the document
- Do NOT infer scope items that aren't listed
- If inspection quantity is not specified, note it as missing - don't guess

WHEN EXTRACTING CONTACTS:
- Only include contacts explicitly listed in the document
- Include role, name, email, and phone as available
- Don't assume roles - use what the document states

WHEN EXTRACTING SCOPE:
- List only items explicitly mentioned in the contract/SOV
- Include quantities and prices as stated
- Note any items that say "if required" or "as needed" as potentially variable`;

/**
 * User prompt template for extraction.
 */
export function createExtractionPrompt(ocrText: string): string {
  return `Extract contract information from the following document text. 

Remember:
- Every value must have an exact quote from the text
- If not found, use null
- Never guess or assume

Document text:
---
${ocrText}
---

Extract the following with citations:
1. Project name and number
2. General contractor name and address
3. Owner (only if explicitly stated, otherwise null)
4. Contract value
5. Contract type (LOI, Subcontract, Work Order, Purchase Order, Amendment)
6. All contacts with roles
7. Billing terms (platform, window, invoice address)
8. Retention percentage (null if not specified)
9. Certified payroll requirements
10. Insurance requirements
11. Notable terms or red flags

For each piece of information, provide:
- The extracted value
- The exact quote from the document
- The page number
- Your confidence (high/medium/low)`;
}

// ============================================
// Main Extraction Function
// ============================================

/**
 * Extract structured data from contract documents.
 *
 * This is a placeholder that creates a template output.
 * In production, this would call an LLM with the extraction prompt.
 */
export async function extractFromDocuments(
  input: ExtractionInput
): Promise<ExtractionResult> {
  const errors: string[] = [];

  // Run OCR on all documents
  const ocrResults = await runOCROnAll(input.documents);

  if (ocrResults.length === 0) {
    errors.push("No documents could be OCR'd");
  }

  // Build OCR text map for validation
  const ocrText = new Map<DocumentType, string[]>();
  for (const result of ocrResults) {
    ocrText.set(result.documentType, result.pages);
  }

  // Create extraction output template
  // In production, this would be filled by LLM extraction
  const now = new Date().toISOString();
  const output: ContractExtractionOutput = {
    extractedAt: now,
    sourceDocuments: input.documents.map((d) => d.name),

    // Project Info - to be filled by LLM
    projectName: {
      value: "",
      source: null,
      confidence: "low",
    },
    projectNumber: {
      value: null,
      source: null,
      confidence: "low",
    },
    poNumber: {
      value: null,
      source: null,
      confidence: "low",
    },
    location: {
      value: null,
      source: null,
      confidence: "low",
    },
    dateRequired: {
      value: null,
      source: null,
      confidence: "low",
    },

    // Parties
    generalContractor: {
      value: {
        name: "",
        address: null,
        phone: null,
        licenses: [],
      },
      source: null,
      confidence: "low",
    },
    owner: {
      value: null,
      source: null,
      confidence: "low",
    },

    // Contacts
    contacts: [],

    // Contract Terms
    contractType: {
      value: "Purchase Order",
      source: null,
      confidence: "low",
    },
    contractValue: {
      value: 0,
      source: null,
      confidence: "low",
    },
    originalEstimateValue: {
      value: null,
      source: null,
      confidence: "low",
    },
    retention: {
      value: null,
      source: null,
      confidence: "low",
    },
    billing: {
      value: null,
      source: null,
      confidence: "low",
    },
    certifiedPayroll: {
      value: null,
      source: null,
      confidence: "low",
    },

    // Insurance
    insurance: {
      value: null,
      source: null,
      confidence: "low",
    },

    // Notable Terms
    notableTerms: [],

    // Missing Fields - to be populated based on what couldn't be found
    missingFields: [],
  };

  // Validate citations against source text
  const validation = validateAllCitations(output, ocrText);

  return {
    output,
    ocrText,
    validation,
    errors,
  };
}

/**
 * Save extraction output to a JSON file.
 */
export function saveExtractionOutput(
  projectFolder: string,
  output: ContractExtractionOutput
): string {
  const outputPath = join(projectFolder, "extraction.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  return outputPath;
}

/**
 * Load extraction output from a JSON file.
 */
export function loadExtractionOutput(
  projectFolder: string
): ContractExtractionOutput | null {
  const outputPath = join(projectFolder, "extraction.json");

  if (!existsSync(outputPath)) {
    return null;
  }

  const content = readFileSync(outputPath, "utf-8");
  const parsed = JSON.parse(content);

  // Validate against schema
  const result = ContractExtractionOutputSchema.safeParse(parsed);

  if (!result.success) {
    console.error("Invalid extraction output:", result.error);
    return null;
  }

  return result.data;
}

// ============================================
// Format Helpers
// ============================================

/**
 * Format extraction output as markdown (notes.md style).
 */
export function formatExtractionMarkdown(
  output: ContractExtractionOutput
): string {
  const lines: string[] = [];

  lines.push(
    `# ${output.projectName.value || "Unknown Project"} - Extraction Notes`
  );
  lines.push("");
  lines.push(`**Extracted:** ${output.extractedAt}`);
  lines.push(`**Source Documents:** ${output.sourceDocuments.join(", ")}`);
  lines.push("");

  // Key Contacts
  if (output.contacts.length > 0) {
    lines.push("## Key Contacts");
    lines.push("");
    lines.push("| Role | Name | Email | Phone |");
    lines.push("|------|------|-------|-------|");
    for (const c of output.contacts) {
      lines.push(
        `| ${c.contact.role} | ${c.contact.name} | ${c.contact.email || ""} | ${c.contact.phone || ""} |`
      );
    }
    lines.push("");
  }

  // Project Info
  lines.push("## Project Info");
  lines.push("");
  lines.push(`- **Project Name:** ${output.projectName.value || "?"}`);
  if (output.projectNumber.value) {
    lines.push(`- **Project Number:** ${output.projectNumber.value}`);
  }
  if (output.poNumber.value) {
    lines.push(`- **PO #:** ${output.poNumber.value}`);
  }
  if (output.location.value) {
    lines.push(`- **Location:** ${output.location.value}`);
  }
  if (output.dateRequired.value) {
    lines.push(`- **Date Required:** ${output.dateRequired.value}`);
  }
  lines.push("");

  // Parties
  lines.push("## Parties");
  lines.push("");
  lines.push("### General Contractor");
  lines.push(`- **Name:** ${output.generalContractor.value.name || "?"}`);
  if (output.generalContractor.value.address) {
    lines.push(`- **Address:** ${output.generalContractor.value.address}`);
  }
  lines.push("");

  if (output.owner.value) {
    lines.push("### Owner");
    lines.push(`- **Name:** ${output.owner.value.name}`);
    lines.push("");
  } else {
    lines.push("### Owner");
    lines.push("- Not specified in documents");
    lines.push("");
  }

  // Contract Terms
  lines.push("## Contract Terms");
  lines.push("");
  lines.push(`- **Contract Type:** ${output.contractType.value}`);
  lines.push(
    `- **Contract Value:** $${output.contractValue.value.toLocaleString()}`
  );
  if (output.originalEstimateValue.value) {
    lines.push(
      `- **Original Estimate:** $${output.originalEstimateValue.value.toLocaleString()}`
    );
  }
  if (output.retention.value !== null) {
    lines.push(`- **Retention:** ${output.retention.value}%`);
  } else {
    lines.push("- **Retention:** Not specified");
  }
  lines.push("");

  // Billing
  if (output.billing.value) {
    lines.push("### Billing");
    if (output.billing.value.platform) {
      lines.push(`- Platform: ${output.billing.value.platform}`);
    }
    if (output.billing.value.window) {
      lines.push(`- Window: ${output.billing.value.window}`);
    }
    if (output.billing.value.invoiceTo) {
      lines.push(`- Invoices to: ${output.billing.value.invoiceTo}`);
    }
    if (output.billing.value.paymentTerms) {
      lines.push(`- Payment Terms: ${output.billing.value.paymentTerms}`);
    }
    lines.push("");
  }

  // Certified Payroll
  if (output.certifiedPayroll.value) {
    lines.push("### Certified Payroll");
    lines.push(
      `- Required: ${output.certifiedPayroll.value.required ? "Yes" : "No"}`
    );
    if (output.certifiedPayroll.value.type) {
      lines.push(`- Type: ${output.certifiedPayroll.value.type}`);
    }
    lines.push("");
  }

  // Insurance
  if (output.insurance.value) {
    lines.push("## Insurance Requirements");
    lines.push("");
    const ins = output.insurance.value;
    if (ins.generalLiability) {
      lines.push(
        `- GL: $${ins.generalLiability.perOccurrence?.toLocaleString() || "?"} / $${ins.generalLiability.aggregate?.toLocaleString() || "?"}`
      );
    }
    if (ins.autoLiability) {
      lines.push(`- Auto: $${ins.autoLiability.toLocaleString()}`);
    }
    if (ins.workersComp) {
      lines.push(`- Workers Comp: $${ins.workersComp.toLocaleString()}`);
    }
    if (ins.umbrella) {
      lines.push(
        `- Umbrella: $${ins.umbrella.perOccurrence?.toLocaleString() || "?"} / $${ins.umbrella.aggregate?.toLocaleString() || "?"}`
      );
    }
    if (ins.additionalInsured.length > 0) {
      lines.push(`- Additional Insured: ${ins.additionalInsured.join(", ")}`);
    }
    lines.push("");
  }

  // Notable Terms
  if (output.notableTerms.length > 0) {
    lines.push("## Notable Terms");
    lines.push("");
    for (const term of output.notableTerms) {
      const flag = term.redFlag ? "⚠️ " : "";
      lines.push(`- ${flag}${term.term}`);
      lines.push(
        `  - Source: Page ${term.source.page}, "${term.source.quote}"`
      );
    }
    lines.push("");
  }

  // Missing Fields
  if (output.missingFields.length > 0) {
    lines.push("## Missing Information");
    lines.push("");
    for (const field of output.missingFields) {
      lines.push(
        `- [${field.importance}] ${field.field}: ${field.note || "Not found in documents"}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  switch (command) {
    case "ocr": {
      const pdfPath = args[1];
      if (!pdfPath) {
        console.error("Usage: extract.ts ocr <pdf-path>");
        process.exit(1);
      }

      console.log(`Running OCR on: ${pdfPath}`);
      const text = await runOCR(pdfPath);
      console.log(`OCR complete. Output: ${pdfPath.replace(/\.pdf$/i, ".md")}`);
      console.log(`Pages: ${parseOCRPages(text).length}`);
      break;
    }

    case "extract": {
      const folder = args[1];
      if (!folder) {
        console.error("Usage: extract.ts extract <project-folder>");
        process.exit(1);
      }

      // This is a placeholder - in production would do full extraction
      console.log(`Extraction for folder: ${folder}`);
      console.log("Note: Full LLM extraction not implemented in CLI");
      console.log("Use programmatically with extractFromDocuments()");
      break;
    }

    default:
      console.log(`
Extraction Commands:

  bun services/contract/workflow/extract.ts ocr <pdf-path>
    Run OCR on a single PDF

  bun services/contract/workflow/extract.ts extract <project-folder>
    Extract data from all PDFs in a project folder
      `);
  }
}
