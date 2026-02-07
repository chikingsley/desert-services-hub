/**
 * SWPPP Work Description Parser using Gemini 2.5 Flash Lite
 *
 * Parses natural language work descriptions into structured data for labor estimation.
 * Tested: 8/8 success rate, ~1.1s latency, ~$0.015/1000 entries
 */

import { GoogleGenAI } from "@google/genai";
import { readFile, utils } from "xlsx";

// ============================================================================
// Configuration
// ============================================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const MODEL_NAME = "gemini-2.5-flash-lite";

function getGeminiAI() {
  if (GEMINI_API_KEY === "") {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

// ============================================================================
// Types
// ============================================================================

export const WORK_ACTIONS = [
  "install",
  "relocate",
  "remove",
  "deliver",
  "narrative",
  "other",
] as const;

export type WorkAction = (typeof WORK_ACTIONS)[number];

export const WORK_UNITS = [
  "panels",
  "sock_lf",
  "fence_lf",
  "screening_lf",
  "inlets",
  "signs",
  "gates",
  "other",
] as const;

export type WorkUnit = (typeof WORK_UNITS)[number];

export interface WorkItem {
  action: WorkAction;
  quantity: number | null;
  unit: WorkUnit;
  description: string;
}

export interface ContactInfo {
  name: string;
  phone?: string;
}

export interface ParsedWorkLog {
  workItems: WorkItem[];
  schedulingNotes: string[];
  contactInfo: ContactInfo | null;
}

export type ProjectStatus = "Not started" | "In progress" | "Done";

export type ParsedProject = ParsedWorkLog & {
  jobName: string;
  contractor: string;
  contact: string;
  address: string;
  scheduledDate: string;
  laborMinutes: number;
  laborHours: string;
  status: ProjectStatus;
};

// ============================================================================
// Labor Estimation Rates (from validated model)
// ============================================================================

// V4 Model rates (validated Dec 2024 from ~926 historical entries)
// See README.md for full methodology and confidence intervals
export const LABOR_RATES = {
  baseSetup: 41.4,
  installPanel: 12.7,
  relocatePanel: 10.1,
  removePanel: 4.8,
  installSockPerLF: 0.22,
  relocateSockPerLF: 0.4,
  installFencePerLF: 0.15,
  installInlet: 15.6,
  maintenanceFlat: 32.1,
  deliveryOnly: 45,
  narrative: 30,
} as const;

/**
 * Calculate labor estimate from parsed work items.
 * Returns man-minutes.
 */
export function estimateLabor(items: WorkItem[]): number {
  if (items.length === 0) {
    return 0;
  }

  let total = LABOR_RATES.baseSetup;

  for (const item of items) {
    total += calculateItemLabor(item);
  }

  return Math.round(total * 10) / 10; // Round to 1 decimal
}

/**
 * Determine project status based on data patterns.
 * Matches logic in n8n Calculate Labor node.
 */
export function determineStatus(
  scheduledDate: string | number | null | undefined,
  schedulingNotes: string[],
  workDescription?: string
): ProjectStatus {
  const notesText = (schedulingNotes || []).join(" ").toLowerCase();
  const descText = (workDescription || "").toLowerCase();

  // Contains 'complete' or 'finished' → Done
  if (notesText.includes("complete") || notesText.includes("finished")) {
    return "Done";
  }

  // Has a scheduled date → In progress
  if (scheduledDate && scheduledDate !== "" && scheduledDate !== 0) {
    return "In progress";
  }

  // Contains 'ready now' → In progress
  if (notesText.includes("ready now") || descText.includes("ready now")) {
    return "In progress";
  }

  return "Not started";
}

/**
 * Format work items into a human-readable summary.
 */
export function formatWorkItems(items: WorkItem[]): string {
  if (items.length === 0) {
    return "";
  }
  return items
    .map((item) => {
      const qty = item.quantity ? `${item.quantity} ` : "";
      const unit = item.unit ? item.unit.replace("_", " ") : "";
      return `${item.action} ${qty}${unit}`.trim();
    })
    .join(", ");
}

/** Labor rate lookup: [unit][action] -> rate per unit (or flat rate) */
const LABOR_RATE_TABLE: Record<string, Record<string, number>> = {
  panels: {
    install: LABOR_RATES.installPanel,
    relocate: LABOR_RATES.relocatePanel,
    remove: LABOR_RATES.removePanel,
  },
  sock_lf: { install: LABOR_RATES.installSockPerLF },
  fence_lf: { install: LABOR_RATES.installFencePerLF },
  inlets: { install: LABOR_RATES.installInlet },
};

/** Flat rates by action (no quantity multiplier) */
const FLAT_RATE_ACTIONS: Record<string, number> = {
  deliver: LABOR_RATES.deliveryOnly,
  narrative: LABOR_RATES.narrative,
};

function calculateItemLabor(item: WorkItem): number {
  // Check flat rate actions first
  const flatRate = FLAT_RATE_ACTIONS[item.action];
  if (flatRate !== undefined) {
    return flatRate;
  }

  // Look up rate by unit + action
  const unitRates = LABOR_RATE_TABLE[item.unit];
  const rate = unitRates?.[item.action];
  if (rate === undefined) {
    return 0;
  }

  const qty = item.quantity ?? 1;
  return qty * rate;
}

// ============================================================================
// Parser
// ============================================================================

function buildParsePrompt(text: string): string {
  return `Parse this SWPPP work description into structured data.

Work description: "${text}"

Extract:
1. workItems: Each distinct task with:
   - action: "install", "relocate", "remove", "deliver", "narrative", or "other"
   - quantity: number or null if not specified
   - unit: "panels", "sock_lf", "fence_lf", "screening_lf", "inlets", "signs", "gates", or "other"
   - description: brief description of the work item

2. schedulingNotes: Any notes about timing, readiness, or conditions (e.g., "Ready now", "See Steve when you arrive")

3. contactInfo: Site contact name and phone if mentioned

Return valid JSON with: { workItems, schedulingNotes, contactInfo }`;
}

export async function parseWorkDescription(
  text: string
): Promise<ParsedWorkLog> {
  const ai = getGeminiAI();
  const prompt = buildParsePrompt(text);
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
    },
  });
  const responseText = response.text ?? "";

  try {
    let parsed = JSON.parse(responseText);

    // Handle array wrapper (Gemini sometimes returns [{}] instead of {})
    if (Array.isArray(parsed)) {
      parsed = parsed[0];
    }

    // Normalize field names (snake_case vs camelCase)
    return {
      workItems: parsed.workItems || parsed.work_items || [],
      schedulingNotes: normalizeSchedulingNotes(parsed),
      contactInfo: normalizeContactInfo(parsed),
    };
  } catch (_e) {
    console.error("Failed to parse response:", responseText);
    throw new Error("Invalid JSON response from Gemini");
  }
}

function normalizeSchedulingNotes(parsed: Record<string, unknown>): string[] {
  const notes = parsed.schedulingNotes || parsed.scheduling_notes;
  if (Array.isArray(notes)) {
    return notes;
  }
  if (typeof notes === "string") {
    return notes
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeContactInfo(
  parsed: Record<string, unknown>
): ContactInfo | null {
  const info = parsed.contactInfo || parsed.contact_info;
  if (typeof info === "string") {
    return { name: info };
  }
  if (info && typeof info === "object") {
    return info as ContactInfo;
  }
  return null;
}

// ============================================================================
// Test Runner (CLI only)
// ============================================================================

type TestRow = Record<string, unknown>;

const DEFAULT_EXCEL_PATH = "./SWPPP Master 11-7-24.xlsx";
const DEFAULT_SHEET_NAME = "Confirmed Schedule";

function loadTestEntries(excelPath: string, sheetName: string): TestRow[] {
  const workbook = readFile(excelPath);
  const sheet = workbook.Sheets[sheetName];
  if (sheet === undefined) {
    throw new Error(`Sheet ${sheetName} not found`);
  }
  const data = utils.sheet_to_json(sheet) as TestRow[];

  return data
    .filter((row) => {
      const desc = String(row["Job Description"] || "");
      return desc.length > 50;
    })
    .slice(0, 8);
}

function logParsedResult(parsed: ParsedWorkLog): void {
  if (parsed.workItems.length === 0) {
    console.log("    No work items extracted");
    return;
  }

  console.log("    Work Items:");
  for (const item of parsed.workItems) {
    const qty = item.quantity ? `${item.quantity} ${item.unit}` : item.unit;
    console.log(`      - ${item.action}: ${qty}`);
  }

  if (parsed.schedulingNotes.length > 0) {
    console.log(`    Notes: ${parsed.schedulingNotes.slice(0, 2).join("; ")}`);
  }
  if (parsed.contactInfo) {
    const phone = parsed.contactInfo.phone ?? "";
    console.log(`    Contact: ${parsed.contactInfo.name} ${phone}`);
  }

  const laborMins = estimateLabor(parsed.workItems);
  if (laborMins > 0) {
    const hours = (laborMins / 60).toFixed(1);
    console.log(`    Est. Labor: ${laborMins} min (${hours} hrs) [calculated]`);
  }
}

interface TestResult {
  success: boolean;
  elapsed: number;
}

async function testEntry(row: TestRow, index: number): Promise<TestResult> {
  const jobName = String(row["JOB NAME"] || "Unknown");
  const description = String(row["Job Description"] || "");

  console.log(`\n[${index + 1}] ${jobName}`);
  console.log(`    Input: ${description.slice(0, 120)}...`);

  const startTime = Date.now();
  try {
    const parsed = await parseWorkDescription(description);
    const elapsed = Date.now() - startTime;
    console.log(`    Time: ${elapsed}ms`);
    logParsedResult(parsed);
    return { success: true, elapsed };
  } catch (error) {
    console.log(`    ERROR: ${error}`);
    return { success: false, elapsed: 0 };
  }
}

async function main(): Promise<void> {
  const testEntries = loadTestEntries(DEFAULT_EXCEL_PATH, DEFAULT_SHEET_NAME);
  console.log(
    `=== Testing Gemini ${MODEL_NAME} on ${DEFAULT_SHEET_NAME} ===\n`
  );

  let totalTime = 0;
  let successCount = 0;

  for (const [i, row] of testEntries.entries()) {
    const result = await testEntry(row, i);
    if (result.success) {
      successCount += 1;
      totalTime += result.elapsed;
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Success: ${successCount}/${testEntries.length}`);
  if (successCount > 0) {
    console.log(`Avg latency: ${Math.round(totalTime / successCount)}ms`);
  }
}

// Only run main() when executed directly (not when imported)
if (import.meta.main) {
  main().catch(console.error);
}
