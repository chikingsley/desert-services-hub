/**
 * Scrape API Handlers
 *
 * HTTP handlers for scraping permits and generating PDFs.
 * Detail scrape routes through aqdata-worker; PDF still uses shared browser session.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  ALL_STATUSES,
  extractPermitData,
  setStatusFilters,
} from "@/portal/scrape";
import type { PermitData } from "@/portal/types";
import {
  getOrCreateBrowserSession,
  getSessionPageAndContext,
} from "@/portal/utils/browser";
import {
  clickDustApplicationLinkById,
  navigateToDustSearch,
  navigateToMyDustApps,
  waitForDustApplicationDetailPage,
} from "@/portal/utils/helpers";
import { login } from "@/portal/utils/login";
import { searchPermits } from "@/portal/utils/search";

const log = (msg: string) => process.stderr.write(`${msg}\n`);
const DEFAULT_AQDATA_WORKER_URL =
  process.env.DOCKER_CONTAINER === "true"
    ? "http://aqdata-worker:47823"
    : "http://localhost:47823";
const DEFAULT_AQDATA_TIMEOUT_MS = 180_000;
const MIN_AQDATA_TIMEOUT_MS = 5000;
const MAX_AQDATA_TIMEOUT_MS = 300_000;
const TRAILING_SLASHES_REGEX = /\/+$/;

// ============================================
// Schemas
// ============================================

export const scrapePdfSchema = z.object({
  outputDir: z
    .string()
    .optional()
    .describe("Directory to save PDF (default: tests/output/pdfs)"),
  permitId: z.string().describe("Permit ID to scrape (e.g., D0056297)"),
});

export type ScrapePdfInput = z.infer<typeof scrapePdfSchema>;

export interface ScrapePdfResult {
  data?: PermitData;
  error?: string;
  pdfPath?: string;
  permitId: string;
  success: boolean;
}

interface AQDataStructuredDetail {
  applicantCompany: {
    address1: string;
    address2: string;
    city: string;
    companyName: string;
    email: string;
    entityType: string;
    phone: string;
    state: string;
    zip: string;
  };
  applicantOwner: {
    address1: string;
    address2: string;
    city: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    state: string;
    zip: string;
  };
  contact: {
    email: string;
    name: string;
    phone: string;
  };
  header: {
    applicationId: string;
    companyName: string;
    createdDate: string;
    expirationDate: string;
    issueDate: string;
    projectName: string;
    status: string;
  };
  isOwnerDeveloper: boolean | null;
  primaryContact: {
    companyName: string;
    email: string;
    fax: string;
    firstName: string;
    lastName: string;
    mobile: string;
    onSitePhone: string;
    title: string;
  };
  project: {
    description: string;
    endDate: string;
    name: string;
    startDate: string;
  };
  propertyOwnerDeveloper: {
    address1: string;
    address2: string;
    city: string;
    contactEmail: string;
    contactFirstName: string;
    contactLastName: string;
    contactPhone: string;
    entityType: string;
    fax: string;
    name: string;
    phone: string;
    state: string;
    zip: string;
  } | null;
  siteLocation: {
    accessPoints: PermitData["accessPoints"];
    disturbedArea: string;
    locations: PermitData["locations"];
  };
  trackoutDevices: {
    gravelPad: boolean;
    grizzlyRumbleGrate: boolean;
    other: boolean;
    pavedArea: boolean;
    wheelWash: boolean;
  };
  trackoutE1Answer: boolean | null;
  waterMethods: {
    hose: boolean;
    other: boolean;
    waterBuffalo: boolean;
    waterPull: boolean;
    waterTruck: boolean;
  };
}

interface AQDataScrapePayload {
  detail?: {
    structured?: AQDataStructuredDetail;
  };
  error?: string;
  ignored?: boolean;
  qa?: unknown;
  success: boolean;
  summary?: unknown;
}

// ============================================
// Helpers
// ============================================

function jsonError(error: string, status = 400): Response {
  return Response.json(
    { error, success: false, timestamp: new Date().toISOString() },
    { status }
  );
}

function jsonSuccess(data: Record<string, unknown>): Response {
  return Response.json({
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

function getAqdataWorkerUrl(): string {
  const configured = process.env.AQDATA_WORKER_URL?.trim();
  const baseUrl = configured || DEFAULT_AQDATA_WORKER_URL;
  return baseUrl.replace(TRAILING_SLASHES_REGEX, "");
}

function getAqdataTimeoutMs(): number {
  const configured = Number.parseInt(
    process.env.AQDATA_SCRAPE_TIMEOUT_MS ?? "",
    10
  );
  if (!Number.isFinite(configured)) {
    return DEFAULT_AQDATA_TIMEOUT_MS;
  }
  return Math.min(
    MAX_AQDATA_TIMEOUT_MS,
    Math.max(MIN_AQDATA_TIMEOUT_MS, configured)
  );
}

function inferAqdataErrorStatus(
  status: number,
  error: string | undefined
): number {
  if (status >= 400) {
    return status;
  }
  const message = (error || "").toLowerCase();
  if (message.includes("not found") || message.includes("not returned")) {
    return 404;
  }
  return 500;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function parseAqdataPayload(raw: unknown): AQDataScrapePayload {
  const record = asRecord(raw);
  if (!record) {
    return {
      error: "Invalid AQData response payload",
      success: false,
    };
  }

  const detail = asRecord(record.detail);
  const structured = detail
    ? (detail.structured as AQDataStructuredDetail)
    : undefined;

  return {
    detail: detail
      ? {
          structured,
        }
      : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
    ignored: record.ignored === true,
    qa: record.qa,
    success: record.success === true,
    summary: record.summary,
  };
}

function mapStructuredDetailToPermitData(
  permitId: string,
  structured: AQDataStructuredDetail
): PermitData {
  const header = structured.header;
  const applicantCompany = structured.applicantCompany;
  const propertyOwner = structured.propertyOwnerDeveloper;
  const projectName = header.projectName || structured.project.name;

  return {
    accessPoints: structured.siteLocation.accessPoints,
    applicantCompany: {
      address1: applicantCompany.address1,
      address2: applicantCompany.address2,
      city: applicantCompany.city,
      email: applicantCompany.email,
      entityType: applicantCompany.entityType,
      name: applicantCompany.companyName,
      phone: applicantCompany.phone,
      state: applicantCompany.state,
      zip: applicantCompany.zip,
    },
    applicantOwner: {
      address1: structured.applicantOwner.address1,
      address2: structured.applicantOwner.address2,
      city: structured.applicantOwner.city,
      email: structured.applicantOwner.email,
      firstName: structured.applicantOwner.firstName,
      lastName: structured.applicantOwner.lastName,
      phone: structured.applicantOwner.phone,
      state: structured.applicantOwner.state,
      zip: structured.applicantOwner.zip,
    },
    applicationId: header.applicationId || permitId,
    companyName: header.companyName,
    contact: {
      email: structured.contact.email,
      name: structured.contact.name,
      phone: structured.contact.phone,
    },
    createdDate: header.createdDate,
    disturbedArea: structured.siteLocation.disturbedArea,
    expirationDate: header.expirationDate,
    isOwnerDeveloper: structured.isOwnerDeveloper,
    issueDate: header.issueDate,
    locations: structured.siteLocation.locations,
    primaryContact: {
      companyName: structured.primaryContact.companyName,
      email: structured.primaryContact.email,
      fax: structured.primaryContact.fax,
      firstName: structured.primaryContact.firstName,
      lastName: structured.primaryContact.lastName,
      mobile: structured.primaryContact.mobile,
      onSitePhone: structured.primaryContact.onSitePhone,
      title: structured.primaryContact.title,
    },
    project: {
      description: structured.project.description,
      endDate: structured.project.endDate,
      name: structured.project.name,
      startDate: structured.project.startDate,
    },
    projectName,
    propertyOwnerDeveloper: propertyOwner
      ? {
          address1: propertyOwner.address1,
          address2: propertyOwner.address2,
          city: propertyOwner.city,
          contactEmail: propertyOwner.contactEmail,
          contactFirstName: propertyOwner.contactFirstName,
          contactLastName: propertyOwner.contactLastName,
          contactPhone: propertyOwner.contactPhone,
          entityType: propertyOwner.entityType,
          fax: propertyOwner.fax,
          name: propertyOwner.name,
          phone: propertyOwner.phone,
          state: propertyOwner.state,
          zip: propertyOwner.zip,
        }
      : null,
    status: header.status,
    trackoutDevices: {
      gravelPad: structured.trackoutDevices.gravelPad,
      grizzlyRumbleGrate: structured.trackoutDevices.grizzlyRumbleGrate,
      other: structured.trackoutDevices.other,
      pavedArea: structured.trackoutDevices.pavedArea,
      wheelWash: structured.trackoutDevices.wheelWash,
    },
    trackoutE1Answer: structured.trackoutE1Answer,
    waterMethods: {
      hose: structured.waterMethods.hose,
      other: structured.waterMethods.other,
      waterBuffalo: structured.waterMethods.waterBuffalo,
      waterPull: structured.waterMethods.waterPull,
      waterTruck: structured.waterMethods.waterTruck,
    },
  };
}

async function fetchAqdataPermit(
  permitId: string
): Promise<{ payload: AQDataScrapePayload; status: number }> {
  const timeoutMs = getAqdataTimeoutMs();
  const workerUrl = getAqdataWorkerUrl();
  const endpoint = `${workerUrl}/api/scrape/${encodeURIComponent(permitId)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    const text = await response.text();
    let rawPayload: unknown = text;
    try {
      rawPayload = JSON.parse(text);
    } catch {
      // keep raw text for error diagnostics
    }

    const payload = parseAqdataPayload(rawPayload);
    return { payload, status: response.status };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`AQData scrape request timed out after ${timeoutMs}ms`);
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`AQData scrape request failed: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureBrowserSession(): Promise<
  | {
      success: true;
      page: NonNullable<ReturnType<typeof getSessionPageAndContext>>;
    }
  | { success: false; error: string }
> {
  const session = await getOrCreateBrowserSession();
  const ctx = getSessionPageAndContext();

  if (!ctx) {
    return { error: "No browser session available", success: false };
  }

  if (!session.isLoggedIn) {
    log("   ✗ Not logged in - attempting re-login...");
    const loggedIn = await login(ctx.page);
    if (!loggedIn) {
      return { error: "Failed to login to portal", success: false };
    }
    session.isLoggedIn = true;
  }

  return { page: ctx, success: true };
}

/**
 * Navigate to the search page, set all status filters, type the permit ID,
 * submit ONCE, open the detail page, and extract structured data.
 */
async function navigateAndExtract(
  page: import("playwright").Page,
  permitId: string
): Promise<
  | { success: true; data: PermitData }
  | { success: false; error: string; status: number }
> {
  // Navigate to search page
  await navigateToMyDustApps(page);
  await navigateToDustSearch(page);

  // Set all status filters (no submit yet)
  await setStatusFilters(page, ALL_STATUSES);

  // Type permit ID and submit — single form submission
  const searchResult = await searchPermits(page, { permitId });
  if (!(searchResult.success && searchResult.permitIds.includes(permitId))) {
    return {
      success: false,
      error: `Permit ${permitId} not found`,
      status: 404,
    };
  }

  // Click to open detail page
  const clicked = await clickDustApplicationLinkById(page, permitId);
  if (!clicked) {
    return {
      success: false,
      error: `Could not open permit ${permitId}`,
      status: 500,
    };
  }

  // Wait for detail page
  const loaded = await waitForDustApplicationDetailPage(page, {
    midwayFallbackAppNum: permitId,
    timeout: 30_000,
  });
  if (!loaded) {
    return { success: false, error: "Detail page did not load", status: 500 };
  }

  // Extract permit data
  log("   Extracting permit data...");
  const data = await extractPermitData(page);
  log(`   ✓ Extracted: ${data.applicationId} - ${data.projectName}`);

  return { success: true, data };
}

// ============================================
// Handlers
// ============================================

/**
 * POST /api/scrape/pdf - Scrape permit data and generate PDF
 */
export async function handleScrapePdf(body: unknown): Promise<Response> {
  log("\n📄 SCRAPE + PDF request");

  const parsed = scrapePdfSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const { permitId, outputDir } = parsed.data;
  log(`   Permit: ${permitId}`);

  try {
    const sessionResult = await ensureBrowserSession();
    if (!sessionResult.success) {
      return jsonError(sessionResult.error, 500);
    }

    const { page } = sessionResult.page;

    const result = await navigateAndExtract(page, permitId);
    if (!result.success) {
      return jsonError(result.error, result.status);
    }

    // Generate PDF
    const pdfDir = outputDir || join(process.cwd(), "tests", "output", "pdfs");
    if (!existsSync(pdfDir)) {
      mkdirSync(pdfDir, { recursive: true });
    }
    const pdfPath = join(pdfDir, `${permitId}.pdf`);

    const parentDir = dirname(pdfPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    log(`   Generating PDF to ${pdfPath}...`);
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "0.5in",
        bottom: "0.5in",
        left: "0.5in",
        right: "0.5in",
      },
      printBackground: true,
    });

    await Bun.write(pdfPath, pdfBuffer);
    log(`   ✓ PDF generated: ${pdfPath}`);

    return jsonSuccess({
      data: result.data,
      pdfBase64: Buffer.from(pdfBuffer).toString("base64"),
      pdfPath,
      permitId,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Error: ${errorMsg}`);
    return jsonError(errorMsg, 500);
  }
}

/**
 * GET /api/scrape/:id - Scrape permit data only (no PDF)
 */
export async function handleScrapePermit(id: string): Promise<Response> {
  log(`\n🔍 SCRAPE permit request: ${id}`);

  try {
    const { payload, status } = await fetchAqdataPermit(id);
    if (!payload.success) {
      if (payload.ignored) {
        return Response.json(
          {
            error: payload.error || `AQData scrape ignored for ${id}`,
            ignored: true,
            success: false,
            timestamp: new Date().toISOString(),
          },
          { status: inferAqdataErrorStatus(status, payload.error) }
        );
      }
      return jsonError(
        payload.error || `AQData scrape failed for ${id}`,
        inferAqdataErrorStatus(status, payload.error)
      );
    }

    const structured = payload.detail?.structured;
    if (!structured) {
      return jsonError(
        `AQData scrape succeeded but structured detail was missing for ${id}`,
        502
      );
    }

    const data = mapStructuredDetailToPermitData(id, structured);

    return jsonSuccess({
      data,
      ignored: false,
      permitId: id,
      qa: payload.qa,
      source: "aqdata",
      summary: payload.summary,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Error: ${errorMsg}`);
    return jsonError(errorMsg, 500);
  }
}
