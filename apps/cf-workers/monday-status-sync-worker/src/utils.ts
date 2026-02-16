/**
 * Shared utilities for Monday Status Sync Worker.
 */

import {
  DEFAULT_ESTIMATE_PROJECT_LINK_COL,
  DEFAULT_PROJECT_ESTIMATE_LINK_COL,
  DEFAULT_PROJECTS_BOARD_ID,
} from "./monday-api";
import type { Env, ProjectLinkSyncConfig } from "./types";

// Prefixes to strip when matching project names
const PREFIX_PATTERN =
  /^(TF|PJ|RO|REBID|CFS|INSPECTIONS|LW|MISC|SF|SS)[\s\-_:]+/i;

// Bid Status -> Overall Status mapping
export const BID_TO_OVERALL_STATUS: Record<string, string> = {
  Won: "Won",
  "Pending Won": "Won",
  "Add to Projects": "Won",
  Lost: "Lost",
  "GC Not Awarded": "Lost",
  Duplicates: "Lost",
};

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

export function getProjectLinkSyncConfig(env: Env): ProjectLinkSyncConfig {
  return {
    enabled: parseBoolean(env.ENABLE_PROJECT_LINK_SYNC),
    projectsBoardId: env.PROJECTS_BOARD_ID ?? DEFAULT_PROJECTS_BOARD_ID,
    estimateProjectLinkCol:
      env.ESTIMATE_PROJECT_LINK_COL ?? DEFAULT_ESTIMATE_PROJECT_LINK_COL,
    projectEstimateLinkCol:
      env.PROJECT_ESTIMATE_LINK_COL ?? DEFAULT_PROJECT_ESTIMATE_LINK_COL,
    leadProjectLinkCol: env.LEAD_PROJECT_LINK_COL ?? null,
    estimateProjectNumberCol: env.ESTIMATE_PROJECT_NUMBER_COL ?? null,
    leadProjectNumberCol: env.LEAD_PROJECT_NUMBER_COL ?? null,
    projectProjectNumberCol: env.PROJECT_PROJECT_NUMBER_COL ?? null,
  };
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}
