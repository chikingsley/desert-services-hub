/**
 * List Permits Handler
 *
 * Core logic for listing permits from the database.
 */

import {
  getActivePermits,
  getExpiringPermits,
  getPermitById,
  getPermitsByPortalCompany,
} from "@lib/db/repositories/dust-permit";
import type { Permit } from "@lib/db/types";
import { z } from "zod";

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
 */
export async function listPermits(input: ListInput = {}): Promise<ListResult> {
  const { status = "active", companyId, permitId, expiringDays = 30 } = input;

  try {
    // Single permit lookup
    if (permitId) {
      const permit = await getPermitById(permitId);
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
      const permits = await getPermitsByPortalCompany(companyId);
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
        permits = await getExpiringPermits(expiringDays);
        filter = `expiring within ${expiringDays} days`;
        break;
      case "all":
        permits = await getActivePermits();
        filter = "all active";
        break;
      default:
        permits = await getActivePermits();
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
