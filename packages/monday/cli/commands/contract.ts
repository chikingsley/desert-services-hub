import { db } from "@lib/db/client";
import { getItemRich } from "@monday/client/rich";
import { ESTIMATING_COLUMNS } from "@monday/types/schema";
import type { CommandHandler } from "./types";

const CONTRACT_STATUS_COLUMN_ID = ESTIMATING_COLUMNS.CONTRACT_STATUS.id;
const MONDAY_BID_STATUS_COLUMN_ID = ESTIMATING_COLUMNS.BID_STATUS.id;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const DIGITS_ONLY_RE = /^\d+$/;

interface ProjectCandidateRow {
  contract_status: string | null;
  id: number;
  monday_item_id: string | null;
  name: string;
  project_number: string | null;
  updated_at: string | null;
}

interface EstimateLinkRow {
  bid_status: string | null;
  created_at: string | null;
  estimate_id: number;
  estimate_name: string;
  estimate_number: string | null;
  is_canonical: boolean;
  monday_item_id: string | null;
  source: string;
}

function parseLimitArg(args: string[]): number {
  const idx = args.indexOf("--limit");
  if (idx === -1) {
    return DEFAULT_LIMIT;
  }

  const raw = args[idx + 1];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Usage: contract-check <project-query> [--limit <1-20>]");
  }

  return Math.min(parsed, MAX_LIMIT);
}

function getQueryArg(args: string[]): string {
  const query = args[1]?.trim();
  if (!query) {
    throw new Error("Usage: contract-check <project-query> [--limit <1-20>]");
  }
  return query;
}

function pickTargetEstimate(links: EstimateLinkRow[]): EstimateLinkRow | null {
  if (links.length === 0) {
    return null;
  }

  const canonicalWithMonday = links.find(
    (row) => row.is_canonical && row.monday_item_id
  );
  if (canonicalWithMonday) {
    return canonicalWithMonday;
  }

  const canonical = links.find((row) => row.is_canonical);
  if (canonical) {
    return canonical;
  }

  const withMonday = links.find((row) => row.monday_item_id);
  if (withMonday) {
    return withMonday;
  }

  return links[0] ?? null;
}

function formatDisplay(value: string | null | undefined): string {
  return value?.trim() || "—";
}

async function getProjectCandidates(
  query: string,
  limit: number
): Promise<ProjectCandidateRow[]> {
  return await db
    .query<ProjectCandidateRow, [string, number]>(
      `SELECT
         id,
         name,
         project_number,
         monday_item_id,
         contract_status,
         updated_at::text
       FROM projects
       WHERE name ILIKE '%' || $1 || '%'
          OR COALESCE(project_number, '') ILIKE '%' || $1 || '%'
       ORDER BY updated_at DESC NULLS LAST
       LIMIT $2`
    )
    .all(query, limit);
}

async function getEstimateLinks(projectId: number): Promise<EstimateLinkRow[]> {
  return await db
    .query<EstimateLinkRow, [number]>(
      `SELECT
         pe.estimate_id,
         pe.is_canonical,
         pe.source,
         pe.created_at::text,
         e.name AS estimate_name,
         e.estimate_number,
         e.monday_item_id,
         e.bid_status
       FROM project_estimates pe
       JOIN estimates e ON e.id = pe.estimate_id
       WHERE pe.project_id = $1
       ORDER BY
         pe.is_canonical DESC NULLS LAST,
         pe.canonicalized_at DESC NULLS LAST,
         pe.created_at DESC NULLS LAST`
    )
    .all(projectId);
}

async function getMondayContractStatus(mondayItemId: string | null): Promise<{
  bidStatus: string | null;
  contractStatus: string | null;
  error: string | null;
}> {
  if (!mondayItemId) {
    return {
      bidStatus: null,
      contractStatus: null,
      error: "no monday item id",
    };
  }
  if (!DIGITS_ONLY_RE.test(mondayItemId)) {
    return {
      bidStatus: null,
      contractStatus: null,
      error: "monday item id is not numeric",
    };
  }

  try {
    const item = await getItemRich(mondayItemId);
    if (!item) {
      return {
        bidStatus: null,
        contractStatus: null,
        error: "item not found on monday",
      };
    }

    return {
      bidStatus: item.columns[MONDAY_BID_STATUS_COLUMN_ID] ?? null,
      contractStatus: item.columns[CONTRACT_STATUS_COLUMN_ID] ?? null,
      error: null,
    };
  } catch (error) {
    return {
      bidStatus: null,
      contractStatus: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isExecuted(status: string | null): boolean {
  return status?.trim().toLowerCase() === "executed";
}

export const contractHandlers: Record<string, CommandHandler> = {
  "contract-check": async (args) => {
    const query = getQueryArg(args);
    const limit = parseLimitArg(args);

    const projects = await getProjectCandidates(query, limit);
    if (projects.length === 0) {
      console.log(`No projects matched "${query}"`);
      return;
    }

    console.log(`Matched ${projects.length} project(s) for "${query}":`);
    for (const project of projects) {
      const links = await getEstimateLinks(project.id);
      const estimate = pickTargetEstimate(links);
      const monday = await getMondayContractStatus(
        estimate?.monday_item_id ?? null
      );
      const localStatus = project.contract_status ?? "Pending";
      const mondayContractStatus = monday.contractStatus;

      console.log(`\nProject ${project.id}: ${project.name}`);
      console.log(`  Local contract_status: ${formatDisplay(localStatus)}`);
      console.log(
        `  Canonical/target estimate: ${estimate ? `${estimate.estimate_id} (${formatDisplay(estimate.estimate_number)})` : "—"}`
      );
      if (estimate) {
        console.log(
          `  Estimate bid status (local): ${formatDisplay(estimate.bid_status)}`
        );
        console.log(`  Estimate source: ${estimate.source}`);
      }
      console.log(
        `  Monday item id: ${formatDisplay(estimate?.monday_item_id ?? null)}`
      );
      console.log(
        `  Monday contract status (${CONTRACT_STATUS_COLUMN_ID}): ${formatDisplay(mondayContractStatus)}`
      );
      console.log(
        `  Monday bid status (${MONDAY_BID_STATUS_COLUMN_ID}): ${formatDisplay(monday.bidStatus)}`
      );
      console.log(
        `  Executed in Monday: ${isExecuted(mondayContractStatus) ? "YES" : "NO"}`
      );

      if (monday.error) {
        console.log(`  Gap: ${monday.error}`);
      }

      if (isExecuted(mondayContractStatus) && localStatus !== "Executed") {
        console.log(
          `  Gap: local contract_status is ${formatDisplay(localStatus)} but Monday says Executed`
        );
      }

      if (!isExecuted(mondayContractStatus) && estimate?.monday_item_id) {
        console.log(
          `  To mark executed: bun packages/monday/cli/cli.ts update estimating ${estimate.monday_item_id} '{"${CONTRACT_STATUS_COLUMN_ID}":{"label":"Executed"}}'`
        );
      }
    }
  },
};
