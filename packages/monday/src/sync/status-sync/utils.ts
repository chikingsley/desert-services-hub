/**
 * Shared utilities for Monday status sync jobs.
 */

import { BOARD_IDS, ESTIMATING_COLUMNS } from "@monday/types/schema";
import type { ProjectLinkSyncConfig } from "./types";

/** Prefixes to strip when matching project names for GC cleanup. */
const PREFIX_PATTERN =
  /^(TF|PJ|RO|REBID|CFS|INSPECTIONS|LW|MISC|SF|SS)[\s\-_:]+/i;

/** Bid Status → Overall Status mapping for leads sync. */
export const BID_TO_OVERALL_STATUS: Record<string, string> = {
  Won: "Won",
  "Pending Won": "Won",
  "Add to Projects": "Won",
  Lost: "Lost",
  "GC Not Awarded": "Lost",
  Duplicates: "Lost",
};

export const GC_NOT_AWARDED = "GC Not Awarded";

export function getBaseName(name: string): string {
  return name.replace(PREFIX_PATTERN, "").trim().toUpperCase();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function appendUniqueId(ids: string[], id: string): string[] {
  return [...new Set([...ids, id])];
}

export function normalizeProjectNumber(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getProjectLinkSyncConfig(): ProjectLinkSyncConfig {
  return {
    enabled: parseBoolean(process.env.ENABLE_PROJECT_LINK_SYNC, true),
    projectsBoardId: process.env.PROJECTS_BOARD_ID ?? BOARD_IDS.PROJECTS,
    estimateProjectLinkCol:
      process.env.ESTIMATE_PROJECT_LINK_COL ?? ESTIMATING_COLUMNS.PROJECTS.id,
    projectEstimateLinkCol:
      process.env.PROJECT_ESTIMATE_LINK_COL ?? "board_relation_mktgn7cb",
    leadProjectLinkCol: process.env.LEAD_PROJECT_LINK_COL ?? null,
    estimateProjectNumberCol: process.env.ESTIMATE_PROJECT_NUMBER_COL ?? null,
    leadProjectNumberCol: process.env.LEAD_PROJECT_NUMBER_COL ?? null,
    projectProjectNumberCol: process.env.PROJECT_PROJECT_NUMBER_COL ?? null,
  };
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}
