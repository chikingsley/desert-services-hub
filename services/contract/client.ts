/**
 * Contract Document Processing Client
 *
 * Extracts structured data from construction contract PDFs using:
 * - Jina AI for PDF text extraction
 * - Gemini for structured data parsing
 */

import { GoogleGenAI } from "@google/genai";
import { PDFDocument } from "pdf-lib";
import type {
  ComprehensiveRequirements,
  ContractDetails,
  ContractDocType,
  ContractExtractionOptions,
  ContractFolderOptions,
  ContractPackage,
  ExhibitInfo,
  PartyInfo,
  ProjectInfo,
} from "./types";

export type { ComprehensiveRequirements } from "./types";

const JINA_API_KEY = process.env.JINA_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const FILENAME_PATTERNS: [RegExp, ContractDocType, number][] = [
  [/subcontract|agreement/i, "SUBCONTRACT", 0.9],
  [/exhibit\s*a|scope.*work|sow/i, "EXHIBIT_A", 0.9],
  [/exhibit\s*b|schedule.*values|pricing/i, "EXHIBIT_B", 0.9],
  [/exhibit\s*c|schedule|timeline/i, "EXHIBIT_C", 0.85],
  [/exhibit\s*d|insurance/i, "EXHIBIT_D", 0.85],
  [/exhibit\s*e|safety/i, "EXHIBIT_E", 0.85],
  [/exhibit\s*[f-z]/i, "EXHIBIT_F", 0.8],
  [/admin.*memo|memo/i, "ADMIN_MEMO", 0.85],
  [/change.*order|co\s*\d+/i, "CHANGE_ORDER", 0.9],
  [/proposal|bid|quote/i, "PROPOSAL", 0.85],
  [/\bfe\b|front.*end|aia|consensusdocs/i, "FE_FORM", 0.8],
];

const STAGE_2_DOC_TYPES = ["SUBCONTRACT", "ADMIN_MEMO", "FE_FORM"];

const CONTRACT_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    docType: {
      type: "STRING" as const,
      enum: [
        "SUBCONTRACT",
        "EXHIBIT_A",
        "EXHIBIT_B",
        "EXHIBIT_C",
        "EXHIBIT_D",
        "EXHIBIT_E",
        "EXHIBIT_F",
        "ADMIN_MEMO",
        "CHANGE_ORDER",
        "PROPOSAL",
        "FE_FORM",
        "OTHER",
      ],
    },
    contractor: {
      type: "OBJECT" as const,
      properties: {
        name: { type: "STRING" as const },
        address: { type: "STRING" as const },
        city: { type: "STRING" as const },
        state: { type: "STRING" as const },
        zip: { type: "STRING" as const },
        phone: { type: "STRING" as const },
        email: { type: "STRING" as const },
        rocLicense: { type: "STRING" as const },
        representative: { type: "STRING" as const },
        title: { type: "STRING" as const },
      },
    },
    subcontractor: {
      type: "OBJECT" as const,
      properties: {
        name: { type: "STRING" as const },
        address: { type: "STRING" as const },
        city: { type: "STRING" as const },
        state: { type: "STRING" as const },
        zip: { type: "STRING" as const },
        phone: { type: "STRING" as const },
        email: { type: "STRING" as const },
        rocLicense: { type: "STRING" as const },
        representative: { type: "STRING" as const },
        title: { type: "STRING" as const },
      },
    },
    owner: {
      type: "OBJECT" as const,
      properties: {
        name: { type: "STRING" as const },
        address: { type: "STRING" as const },
        representative: { type: "STRING" as const },
      },
    },
    project: {
      type: "OBJECT" as const,
      properties: {
        name: { type: "STRING" as const },
        address: { type: "STRING" as const },
        city: { type: "STRING" as const },
        state: { type: "STRING" as const },
        zip: { type: "STRING" as const },
        number: { type: "STRING" as const },
        description: { type: "STRING" as const },
      },
    },
    amounts: {
      type: "OBJECT" as const,
      properties: {
        originalAmount: { type: "NUMBER" as const },
        retainage: { type: "NUMBER" as const },
      },
    },
    dates: {
      type: "OBJECT" as const,
      properties: {
        effectiveDate: { type: "STRING" as const },
        executionDate: { type: "STRING" as const },
        startDate: { type: "STRING" as const },
        completionDate: { type: "STRING" as const },
        duration: { type: "STRING" as const },
      },
    },
    insurance: {
      type: "OBJECT" as const,
      properties: {
        generalLiability: { type: "NUMBER" as const },
        autoLiability: { type: "NUMBER" as const },
        workersComp: { type: "BOOLEAN" as const },
        umbrellaExcess: { type: "NUMBER" as const },
        additionalInsured: { type: "BOOLEAN" as const },
      },
    },
    scopeOfWork: { type: "STRING" as const },
    exclusions: {
      type: "ARRAY" as const,
      items: { type: "STRING" as const },
    },
    exhibits: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          letter: { type: "STRING" as const },
          title: { type: "STRING" as const },
          description: { type: "STRING" as const },
        },
      },
    },
    contractNumber: { type: "STRING" as const },
    purchaseOrderNumber: { type: "STRING" as const },
  },
};

const COMPREHENSIVE_REQUIREMENTS_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    site: {
      type: "OBJECT" as const,
      properties: {
        badging: { type: "STRING" as const },
        backgroundCheck: { type: "STRING" as const },
        drugTesting: { type: "STRING" as const },
        safetyOrientation: { type: "STRING" as const },
        ppeRequirements: {
          type: "ARRAY" as const,
          items: { type: "STRING" as const },
        },
        siteAccess: { type: "STRING" as const },
        parking: { type: "STRING" as const },
        security: { type: "STRING" as const },
      },
    },
    operational: {
      type: "OBJECT" as const,
      properties: {
        dailyReports: { type: "STRING" as const },
        progressMeetings: { type: "STRING" as const },
        communication: { type: "STRING" as const },
        submittals: { type: "STRING" as const },
        rfiProcedure: { type: "STRING" as const },
        changeOrderProcedure: { type: "STRING" as const },
        noticeDays: { type: "NUMBER" as const },
      },
    },
    financial: {
      type: "OBJECT" as const,
      properties: {
        paymentTerms: { type: "STRING" as const },
        invoiceRequirements: { type: "STRING" as const },
        lienWaivers: { type: "STRING" as const },
        retainageRelease: { type: "STRING" as const },
        storedMaterials: { type: "BOOLEAN" as const },
      },
    },
    risk: {
      type: "OBJECT" as const,
      properties: {
        liquidatedDamages: { type: "STRING" as const },
        warranty: { type: "STRING" as const },
        indemnification: { type: "STRING" as const },
        insuranceCertTiming: { type: "STRING" as const },
        bondingDetails: { type: "STRING" as const },
      },
    },
    schedule: {
      type: "OBJECT" as const,
      properties: {
        milestoneDates: {
          type: "ARRAY" as const,
          items: { type: "STRING" as const },
        },
        substantialCompletion: { type: "STRING" as const },
        punchList: { type: "STRING" as const },
        finalInspection: { type: "STRING" as const },
      },
    },
    redFlags: { type: "ARRAY" as const, items: { type: "STRING" as const } },
    clarificationsNeeded: {
      type: "ARRAY" as const,
      items: { type: "STRING" as const },
    },
    keyQuotes: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          section: { type: "STRING" as const },
          quote: { type: "STRING" as const },
        },
      },
    },
  },
};

const EXTRACTION_PROMPT = `Extract structured information from this construction contract document.

IMPORTANT:
- Extract ALL party information (contractor, subcontractor, owner) with addresses and contact info
- Extract project name, address, and job number
- Extract contract amount and retainage percentage
- Extract all dates (effective date, start date, completion date)
- Extract scope of work summary
- List any exhibits mentioned
- For insurance, extract required coverage amounts
- ROC license = Arizona Registrar of Contractors license number (format: ROC######)

If this is an exhibit (Exhibit A, B, C, etc.), classify it appropriately:
- EXHIBIT_A = Scope of Work
- EXHIBIT_B = Schedule of Values / Pricing
- EXHIBIT_C = Schedule / Timeline
- EXHIBIT_D = Insurance Requirements
- EXHIBIT_E = Safety Manual
- EXHIBIT_F = Other exhibits

Document text:
`;

const COMPREHENSIVE_EXTRACTION_PROMPT = `You are analyzing a construction subcontract for a SWPPP/erosion control subcontractor.

Extract EVERYTHING a subcontractor needs to know before starting work on this project. Go beyond the basic financial terms.

SITE REQUIREMENTS:
- Badging or credentialing requirements (who needs badges, how to apply)
- Background check requirements
- Drug testing requirements
- Safety orientation/training requirements (OSHA 10, OSHA 30, site-specific)
- PPE requirements beyond standard (hard hats, vests, boots, etc.)
- Site access procedures (gates, hours, check-in, escorts)
- Parking restrictions
- Security clearance requirements

OPERATIONAL REQUIREMENTS:
- Daily reporting requirements (what to report, when due, to whom)
- Progress meeting requirements (frequency, attendance required)
- Communication protocols (who to contact for what)
- Submittal requirements and deadlines
- RFI procedures
- Change order procedures and dollar limits
- Notice requirements (how many days to notify for changes/delays)

FINANCIAL/ADMIN:
- Payment terms (Net 30, Net 45, etc.)
- Invoice requirements (what format, what backup docs needed)
- Lien waiver requirements (conditional/unconditional, when)
- Retainage release conditions
- Can we bill for stored materials?

RISK/LIABILITY:
- Liquidated damages (amount per day, conditions that trigger)
- Warranty requirements (how long, what's covered)
- Indemnification clauses (key terms)
- When are insurance certificates due?
- Bonding requirements details

SCHEDULE:
- Key milestone dates
- Substantial completion date/definition
- Punch list procedures
- Final inspection requirements

RED FLAGS (important - look actively for these):
- Any "if required" or "as directed" language without defined scope
- Broad indemnification language
- Unusually short notice periods
- Liquidated damages that seem high
- Scope that could expand ("maintain" vs "install", "provide" vs "supply")
- Requirements that cost money but aren't typically priced
- Anything unusual compared to standard construction contracts

CLARIFICATIONS NEEDED:
- Items that are ambiguous and need clarification from GC before signing

KEY QUOTES:
- Include verbatim quotes for the most important clauses (with section numbers)

Be thorough. This information will be used to onboard the project team and ensure we don't miss requirements.

Contract text:
`;

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

async function extractPages(
  pdfPath: string,
  maxPages = 10
): Promise<Uint8Array> {
  const file = Bun.file(pdfPath);
  const buffer = await file.arrayBuffer();

  if (file.size < 3 * 1024 * 1024) {
    const pdfDoc = await PDFDocument.load(buffer);
    if (pdfDoc.getPageCount() <= maxPages) {
      return new Uint8Array(buffer);
    }
  }

  const pdfDoc = await PDFDocument.load(buffer);
  const pageCount = pdfDoc.getPageCount();

  if (pageCount <= maxPages) {
    return new Uint8Array(buffer);
  }

  const newPdf = await PDFDocument.create();
  const pagesToCopy = Array.from({ length: maxPages }, (_, i) => i);
  const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
  for (const page of copiedPages) {
    newPdf.addPage(page);
  }
  return await newPdf.save();
}

async function getPdfInfo(
  pdfPath: string
): Promise<{ pageCount: number; fileSizeKb: number; kbPerPage: number }> {
  const file = Bun.file(pdfPath);
  const buffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(buffer);
  const pageCount = pdf.getPageCount();
  const fileSizeKb = file.size / 1024;
  return { pageCount, fileSizeKb, kbPerPage: fileSizeKb / pageCount };
}

async function extractTextWithJina(
  pdfPath: string,
  maxPages = 10
): Promise<string> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is required");
  }

  const pdfBytes = await extractPages(pdfPath, maxPages);
  const base64 = Buffer.from(pdfBytes).toString("base64");
  const fileName = getFileName(pdfPath);

  const response = await fetch("https://r.jina.ai/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${JINA_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      pdf: base64,
      url: `https://local.file/${fileName}`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Jina PDF extraction failed: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as { data?: { content?: string } };
  return data?.data?.content ?? "";
}

function classifyByFilename(filePath: string): {
  docType: ContractDocType;
  confidence: number;
} {
  const fileName = getFileName(filePath).toLowerCase();

  for (const [pattern, docType, confidence] of FILENAME_PATTERNS) {
    if (pattern.test(fileName)) {
      return { docType, confidence };
    }
  }

  return { docType: "OTHER", confidence: 0.3 };
}

function getGeminiClient(): GoogleGenAI {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

async function extractComprehensiveRequirements(
  text: string,
  fileName: string
): Promise<ComprehensiveRequirements> {
  const ai = getGeminiClient();
  const truncatedText = text.slice(0, 100_000);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        text: `${COMPREHENSIVE_EXTRACTION_PROMPT}\n\nFile: ${fileName}\n\n${truncatedText}`,
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: COMPREHENSIVE_REQUIREMENTS_SCHEMA,
    },
  });

  return JSON.parse(response.text ?? "{}");
}

async function parseContractWithGemini(
  text: string,
  fileName: string
): Promise<Partial<ContractDetails>> {
  const ai = getGeminiClient();
  const truncatedText = text.slice(0, 50_000);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        text: `${EXTRACTION_PROMPT}\n\nFile: ${fileName}\n\n${truncatedText}`,
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: CONTRACT_SCHEMA,
    },
  });

  return JSON.parse(response.text ?? "{}");
}

async function parseContractWithVision(
  pdfPath: string,
  maxPages = 5
): Promise<Partial<ContractDetails>> {
  const ai = getGeminiClient();
  const pdfBytes = await extractPages(pdfPath, maxPages);
  const base64 = Buffer.from(pdfBytes).toString("base64");
  const fileName = getFileName(pdfPath);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64,
            },
          },
          {
            text: `${EXTRACTION_PROMPT}\n\nFile: ${fileName}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: CONTRACT_SCHEMA,
    },
  });

  return JSON.parse(response.text ?? "{}");
}

function calculateConfidence(
  extractedDocType: ContractDocType | undefined,
  filenameClass: { docType: ContractDocType; confidence: number }
): number {
  if (extractedDocType === filenameClass.docType) {
    return Math.max(filenameClass.confidence, 0.9);
  }
  if (extractedDocType) {
    return 0.85;
  }
  return filenameClass.confidence;
}

async function runStage2Extraction(
  result: ContractDetails,
  rawText: string,
  fileName: string
): Promise<void> {
  console.log("    Extracting comprehensive requirements...");
  try {
    result.requirements = await extractComprehensiveRequirements(
      rawText,
      fileName
    );
    const redFlagCount = result.requirements.redFlags?.length ?? 0;
    console.log(`    Stage 2 complete: ${redFlagCount} red flags found`);
  } catch (error) {
    console.error(`    Stage 2 extraction failed: ${error}`);
  }
}

export async function extractContractDetails(
  pdfPath: string,
  options: ContractExtractionOptions = {}
): Promise<ContractDetails> {
  const start = Date.now();
  const fileName = getFileName(pdfPath);
  const maxPages = options.maxPages ?? 10;

  const pdfInfo = await getPdfInfo(pdfPath);
  const isLikelyDrawing = pdfInfo.kbPerPage > 300;
  const filenameClass = classifyByFilename(pdfPath);

  let extractedData: Partial<ContractDetails>;
  let extractionMethod: "jina" | "gemini-vision";
  let rawText: string | undefined;

  if (options.forceVision || isLikelyDrawing) {
    extractionMethod = "gemini-vision";
    extractedData = await parseContractWithVision(pdfPath, maxPages);
  } else {
    extractionMethod = "jina";
    rawText = await extractTextWithJina(pdfPath, maxPages);

    if (rawText.length < 200) {
      extractionMethod = "gemini-vision";
      extractedData = await parseContractWithVision(pdfPath, maxPages);
    } else {
      extractedData = await parseContractWithGemini(rawText, fileName);
    }
  }

  const docType = extractedData.docType ?? filenameClass.docType;
  const confidence = calculateConfidence(extractedData.docType, filenameClass);

  const result: ContractDetails = {
    docType,
    confidence,
    contractor: extractedData.contractor,
    subcontractor: extractedData.subcontractor,
    owner: extractedData.owner,
    project: extractedData.project,
    amounts: extractedData.amounts,
    dates: extractedData.dates,
    insurance: extractedData.insurance,
    scopeOfWork: extractedData.scopeOfWork,
    exclusions: extractedData.exclusions,
    exhibits: extractedData.exhibits,
    contractNumber: extractedData.contractNumber,
    purchaseOrderNumber: extractedData.purchaseOrderNumber,
    extractionMethod,
    processingTimeMs: Date.now() - start,
  };

  const shouldRunStage2 =
    STAGE_2_DOC_TYPES.includes(docType) && rawText && rawText.length > 500;
  if (shouldRunStage2 && rawText) {
    await runStage2Extraction(result, rawText, fileName);
  }

  if (options.includeRawText && rawText) {
    result.rawText = rawText;
  }

  return result;
}

type ConsolidatedInfo = {
  contractor?: PartyInfo;
  subcontractor?: PartyInfo;
  owner?: PartyInfo;
  project?: ProjectInfo;
  amounts?: ContractDetails["amounts"];
  dates?: ContractDetails["dates"];
  insurance?: ContractDetails["insurance"];
  scopeOfWork?: string;
  exhibits?: ExhibitInfo[];
  requirements?: ComprehensiveRequirements;
};

function sortDocsByPriority(docs: ContractDetails[]): ContractDetails[] {
  const priority: ContractDocType[] = [
    "SUBCONTRACT",
    "EXHIBIT_A",
    "FE_FORM",
    "PROPOSAL",
  ];

  return [...docs].sort((a, b) => {
    const aIdx = priority.indexOf(a.docType);
    const bIdx = priority.indexOf(b.docType);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });
}

function consolidateBasicInfo(
  sorted: ContractDetails[],
  result: ConsolidatedInfo
): void {
  for (const doc of sorted) {
    result.contractor ??= doc.contractor;
    result.subcontractor ??= doc.subcontractor;
    result.owner ??= doc.owner;
    result.project ??= doc.project;
    result.amounts ??= doc.amounts?.originalAmount ? doc.amounts : undefined;
    result.dates ??= doc.dates;
    result.insurance ??= doc.insurance;
    result.scopeOfWork ??= doc.scopeOfWork;
  }
}

function dedupeExhibits(exhibits: ExhibitInfo[]): ExhibitInfo[] {
  const seen = new Set<string>();
  return exhibits.filter((e) => {
    if (seen.has(e.letter)) {
      return false;
    }
    seen.add(e.letter);
    return true;
  });
}

function consolidateExhibits(
  docs: ContractDetails[],
  result: ConsolidatedInfo
): void {
  const allExhibits: ExhibitInfo[] = [];
  for (const doc of docs) {
    if (doc.exhibits) {
      allExhibits.push(...doc.exhibits);
    }
  }

  if (allExhibits.length > 0) {
    result.exhibits = dedupeExhibits(allExhibits);
  }
}

function consolidateRequirements(
  sorted: ContractDetails[],
  result: ConsolidatedInfo
): void {
  const allRedFlags: string[] = [];
  const allClarifications: string[] = [];

  for (const doc of sorted) {
    if (doc.requirements) {
      result.requirements ??= doc.requirements;
      if (doc.requirements.redFlags) {
        allRedFlags.push(...doc.requirements.redFlags);
      }
      if (doc.requirements.clarificationsNeeded) {
        allClarifications.push(...doc.requirements.clarificationsNeeded);
      }
    }
  }

  if (result.requirements && allRedFlags.length > 0) {
    result.requirements.redFlags = [...new Set(allRedFlags)];
  }
  if (result.requirements && allClarifications.length > 0) {
    result.requirements.clarificationsNeeded = [...new Set(allClarifications)];
  }
}

function consolidateContractInfo(docs: ContractDetails[]): ConsolidatedInfo {
  const sorted = sortDocsByPriority(docs);
  const result: ConsolidatedInfo = {};

  consolidateBasicInfo(sorted, result);
  consolidateExhibits(docs, result);
  consolidateRequirements(sorted, result);

  return result;
}

function printList(header: string, items: string[]): void {
  console.log(`\n${header} (${items.length}):`);
  for (const item of items) {
    console.log(`    - ${item}`);
  }
}

function printRequirementsSummary(
  requirements: ComprehensiveRequirements
): void {
  console.log("\nREQUIREMENTS ANALYSIS");
  console.log("=".repeat(60));

  if (requirements.redFlags?.length) {
    printList("RED FLAGS", requirements.redFlags);
  }

  if (requirements.clarificationsNeeded?.length) {
    printList("CLARIFICATIONS NEEDED", requirements.clarificationsNeeded);
  }

  if (requirements.site?.badging) {
    console.log("\nSITE REQUIREMENTS:");
    console.log(`    Badging: ${requirements.site.badging}`);
  }

  if (requirements.financial?.paymentTerms) {
    console.log("\nFINANCIAL:");
    console.log(`    Payment: ${requirements.financial.paymentTerms}`);
  }

  if (requirements.risk?.liquidatedDamages) {
    console.log("\nRISK:");
    console.log(`    LD: ${requirements.risk.liquidatedDamages}`);
  }
}

function printFolderSummary(
  result: ContractPackage,
  exhibits: ContractDetails[],
  consolidated: ConsolidatedInfo
): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("CONTRACT PACKAGE SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Contractor:    ${consolidated.contractor?.name ?? "N/A"}`);
  console.log(`  Subcontractor: ${consolidated.subcontractor?.name ?? "N/A"}`);
  console.log(`  Project:       ${consolidated.project?.name ?? "N/A"}`);

  const amountStr = consolidated.amounts?.originalAmount
    ? `$${consolidated.amounts.originalAmount.toLocaleString()}`
    : "N/A";
  console.log(`  Amount:        ${amountStr}`);
  console.log(`  Documents:     ${result.documents.length}`);
  console.log(`  Exhibits:      ${exhibits.length}`);
  console.log(`  Total Time:    ${result.totalTimeMs}ms`);

  if (consolidated.requirements) {
    printRequirementsSummary(consolidated.requirements);
  }
}

async function processSinglePdf(
  pdfPath: string,
  documents: ContractDetails[],
  options: ContractFolderOptions,
  startTime: number
): Promise<void> {
  const fileName = getFileName(pdfPath);
  console.log(`  Processing: ${fileName}`);

  try {
    const details = await extractContractDetails(pdfPath, options);
    documents.push(details);

    const amountStr = details.amounts?.originalAmount
      ? `$${details.amounts.originalAmount.toLocaleString()}`
      : "N/A";
    console.log(
      `    ${details.docType} | ${amountStr} | ${details.processingTimeMs}ms`
    );
  } catch (error) {
    console.error(`    Failed: ${error}`);
    documents.push({
      docType: "OTHER",
      confidence: 0,
      extractionMethod: "jina",
      processingTimeMs: Date.now() - startTime,
    });
  }
}

export async function processContractFolder(
  folderPath: string,
  options: ContractFolderOptions = {}
): Promise<ContractPackage> {
  const start = Date.now();

  const glob = new Bun.Glob("**/*.pdf");
  const pdfPaths: string[] = [];

  for await (const path of glob.scan(folderPath)) {
    const fullPath = `${folderPath}/${path}`;
    const shouldExclude = options.exclude?.some((pattern) =>
      fullPath.includes(pattern)
    );
    if (!shouldExclude) {
      pdfPaths.push(fullPath);
    }
  }

  console.log(`\nProcessing ${pdfPaths.length} contract documents...\n`);

  const documents: ContractDetails[] = [];

  for (const pdfPath of pdfPaths) {
    await processSinglePdf(pdfPath, documents, options, start);
  }

  const consolidated = consolidateContractInfo(documents);
  const mainContract = documents.find((d) => d.docType === "SUBCONTRACT");
  const exhibits = documents.filter((d) => d.docType.startsWith("EXHIBIT_"));

  const result: ContractPackage = {
    folderPath,
    processedAt: new Date().toISOString(),
    totalTimeMs: Date.now() - start,
    ...consolidated,
    documents,
    summary: {
      totalDocs: documents.length,
      mainContract: mainContract
        ? getFileName(pdfPaths[documents.indexOf(mainContract)] ?? "")
        : undefined,
      exhibitCount: exhibits.length,
      totalAmount: consolidated.amounts?.originalAmount,
      hasInsuranceInfo: !!consolidated.insurance,
      hasScopeInfo: !!consolidated.scopeOfWork,
      hasScheduleInfo: !!consolidated.dates?.completionDate,
      hasRequirementsInfo: !!consolidated.requirements,
    },
  };

  printFolderSummary(result, exhibits, consolidated);

  return result;
}

if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Contract Document Processor

Usage:
  bun services/contract/client.ts <path> [options]

Arguments:
  path      Path to a PDF file or folder containing contract PDFs

Options:
  --vision  Force Gemini vision mode (for image-heavy PDFs)
  --raw     Include raw extracted text in output

Examples:
  bun services/contract/client.ts "./35S Contract Files"
  bun services/contract/client.ts "./contract.pdf" --vision
`);
    process.exit(0);
  }

  const targetPath = args[0];
  if (!targetPath) {
    process.exit(1);
  }

  const forceVision = args.includes("--vision");
  const includeRawText = args.includes("--raw");

  const file = Bun.file(targetPath);

  if (await file.exists()) {
    const result = await extractContractDetails(targetPath, {
      forceVision,
      includeRawText,
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    const result = await processContractFolder(targetPath, {
      forceVision,
      includeRawText,
    });
    console.log("\nFull Package Data:");
    console.log(JSON.stringify(result, null, 2));
  }
}
