/**
 * Permits API Helpers
 *
 * Shared schemas, transforms, and utilities for permit API handlers.
 */

import {
  getActivePermits,
  getPermitById,
} from "@lib/db/repositories/dust-permit";
import type { Permit as DbPermit } from "@lib/db/types";
import { z } from "zod";
import type { FormData } from "@/form-data";
import type { Permit as DashboardPermit } from "@/lib/types";
import {
  ensureBrowserSessionReady,
  getSessionPageAndContext,
} from "@/portal/utils/browser";

export const log = (msg: string) => process.stderr.write(`${msg}\n`);

// ============================================
// API schemas (inlined from removed handler modules)
// ============================================

export const apiCreateSchema = z.object({
  companyName: z.string().optional().describe("Company name for the permit"),
  copyFromApp: z
    .string()
    .optional()
    .describe("Permit ID to copy from (for renew flow)"),
  flow: z
    .enum(["new-company", "existing-company", "renew"])
    .describe("Creation flow type"),
  formDataPath: z
    .string()
    .optional()
    .describe("Path to form data JSON overrides"),
});

export const apiReviseSchema = z.object({
  notes: z.string().optional().describe("Additional notes"),
  revisionType: z.string().describe("Type of revision"),
});

export const renewBodySchema = z.object({
  companyName: z.string().describe("Company name for renewal"),
});

export const renewAndPayBodySchema = z.object({
  companyName: z.string().describe("Company name for renewal"),
  expedited: z.boolean().optional().default(false),
});

export const closeBodySchema = z.object({
  reason: z.string().optional().describe("Reason for closing"),
});

// ============================================
// Transforms
// ============================================

function transformPermitForDashboard(dbPermit: DbPermit): DashboardPermit {
  const permitNumber = dbPermit.id;
  const company = dbPermit.companyName || "Unknown";
  const projectName = dbPermit.projectName || "Unnamed Project";
  const address = dbPermit.address
    ? `${dbPermit.address}${dbPermit.city ? `, ${dbPermit.city}` : ""}`
    : undefined;

  return {
    address,
    company,
    current: {
      id: dbPermit.id,
      applicationNumber: dbPermit.id,
      permitNumber: dbPermit.id,
      version: 1,
      versionType: "new",
      projectName,
      company,
      address,
      requestStatus: "complete",
      permitStatus:
        (dbPermit.status as DashboardPermit["current"]["permitStatus"]) ||
        "Draft",
      submittedAt: dbPermit.submittedDate || undefined,
      effectiveAt: dbPermit.effectiveDate || undefined,
      expiresAt: dbPermit.expirationDate || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    history: [],
    permitNumber,
    projectName,
  };
}

// ============================================
// Browser session helper
// ============================================

export async function ensureBrowserSession(): Promise<
  | {
      success: true;
      page: NonNullable<ReturnType<typeof getSessionPageAndContext>>;
    }
  | { success: false; error: string }
> {
  const session = await ensureBrowserSessionReady();
  const ctx = getSessionPageAndContext();

  if (!ctx) {
    return { error: "No browser session available", success: false };
  }

  if (!(session.isLoggedIn && session.portalReady)) {
    return { error: "Failed to login to portal", success: false };
  }

  return { page: ctx, success: true };
}

// ============================================
// Response helpers
// ============================================

export function jsonError(error: string, status = 400): Response {
  return Response.json(
    { error, success: false, timestamp: new Date().toISOString() },
    { status }
  );
}

export function jsonSuccess(data: Record<string, unknown>): Response {
  return Response.json({
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// Validation helpers
// ============================================

export async function validateCreateMapPreflight(
  formData: FormData
): Promise<{ valid: true } | { valid: false; error: string }> {
  const { latitude, longitude, acresDisturbed } = formData.site;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { valid: true };
  }

  try {
    const { buildPermitMapDataFromSiteCoordinates } = await import(
      "@/lib/site-drawing"
    );
    await buildPermitMapDataFromSiteCoordinates(
      {
        acresDisturbed,
        latitude,
        longitude,
      },
      { includeAccessPoint: false }
    );
  } catch (error) {
    return {
      error: `Map preflight failed for site ${latitude.toFixed(6)},${longitude.toFixed(6)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      valid: false,
    };
  }

  return { valid: true };
}

// ============================================
// DB query wrappers (re-exported for handlers)
// ============================================

export async function listPermitsForDashboard(): Promise<DashboardPermit[]> {
  const dbPermits = await getActivePermits();
  return dbPermits.map(transformPermitForDashboard);
}

export async function getPermitForDashboard(
  id: string
): Promise<DashboardPermit | null> {
  const permit = await getPermitById(id);
  return permit ? transformPermitForDashboard(permit) : null;
}
