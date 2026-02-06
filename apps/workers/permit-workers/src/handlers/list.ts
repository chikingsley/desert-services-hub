/**
 * List Permits Handler
 *
 * Core logic for listing permits from the database.
 */

import { z } from "zod";
import {
  getActivePermits,
  getExpiringPermits,
  getPermit,
  getPermitsByCompany,
  type Permit,
} from "@/db/company-permits";

/**
 * Schema for list permits operation (AI-tool compatible)
 */
export const listSchema = z.object({
  status: z
    .enum(["active", "expiring", "all"])
    .optional()
    .describe(
      "Filter by status: active (default), expiring (within 30 days), or all"
    ),
  companyId: z
    .string()
    .optional()
    .describe("Filter by company ID (e.g., CMP005052)"),
  permitId: z
    .string()
    .optional()
    .describe("Get a single permit by ID (e.g., D0063581)"),
  expiringDays: z
    .number()
    .optional()
    .describe("Days until expiration for 'expiring' filter (default: 30)"),
});

export type ListInput = z.infer<typeof listSchema>;

export interface ListResult {
  success: boolean;
  permits: Permit[];
  count: number;
  filter?: string;
  error?: string;
}

/**
 * List permits from the database.
 *
 * @param input - List parameters
 * @returns Result with permits array
 */
export function listPermits(input: ListInput = {}): ListResult {
  const { status = "active", companyId, permitId, expiringDays = 30 } = input;

  try {
    // Single permit lookup
    if (permitId) {
      const permit = getPermit(permitId);
      if (!permit) {
        return {
          success: false,
          permits: [],
          count: 0,
          error: `Permit ${permitId} not found`,
        };
      }
      return {
        success: true,
        permits: [permit],
        count: 1,
        filter: `id=${permitId}`,
      };
    }

    // Filter by company
    if (companyId) {
      const permits = getPermitsByCompany(companyId);
      return {
        success: true,
        permits,
        count: permits.length,
        filter: `companyId=${companyId}`,
      };
    }

    // Filter by status
    let permits: Permit[];
    let filter: string;

    switch (status) {
      case "expiring":
        permits = getExpiringPermits(expiringDays);
        filter = `expiring within ${expiringDays} days`;
        break;
      case "all":
        // For "all", we just get active permits (no closed/superseded filter in DB)
        permits = getActivePermits();
        filter = "all active";
        break;
      default:
        permits = getActivePermits();
        filter = "active";
        break;
    }

    return {
      success: true,
      permits,
      count: permits.length,
      filter,
    };
  } catch (error) {
    return {
      success: false,
      permits: [],
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
