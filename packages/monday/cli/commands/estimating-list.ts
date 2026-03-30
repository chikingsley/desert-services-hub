/**
 * List and filter Estimating board items (estimates board) from the CLI.
 */
import { getItems } from "@monday/client/items";
import {
  BOARD_IDS,
  ESTIMATING_COLUMNS,
  ESTIMATING_SKIP_GROUPS,
} from "@monday/types/schema";
import { parseLongFlags } from "./args";
import type { CommandHandler } from "./types";

const CONTRACT_STATUS_ID = ESTIMATING_COLUMNS.CONTRACT_STATUS.id;
const BID_STATUS_ID = ESTIMATING_COLUMNS.BID_STATUS.id;
const CONTRACTOR_MIRROR_ID = ESTIMATING_COLUMNS.CONTRACTOR.id;

const DEFAULT_GROUP_EXCLUDES = [
  ...ESTIMATING_SKIP_GROUPS.map((g) => g.toLowerCase()),
  "shell estimates",
];

function isExecutedContract(status: string | undefined): boolean {
  return status?.trim().toLowerCase() === "executed";
}

type ContractMode = "all" | "open" | "executed";

function getContractMode(
  flags: Record<string, string | boolean>,
  contractFilterRaw: string
): ContractMode {
  const cf = contractFilterRaw.trim().toLowerCase();
  const openFlags =
    flags["open-contracts"] === true || flags["pending-contract"] === true;

  if (cf === "executed") {
    return "executed";
  }
  if (cf === "open" || cf === "pending" || cf === "not-executed") {
    return "open";
  }
  if (cf) {
    throw new Error(
      `Unknown --contract "${contractFilterRaw.trim()}"; use open, pending, not-executed, or executed`
    );
  }
  if (openFlags) {
    return "open";
  }
  return "all";
}

function groupExcluded(
  groupTitle: string,
  excludePatterns: string[]
): boolean {
  const g = groupTitle.toLowerCase();
  return excludePatterns.some((p) => g.includes(p));
}

export const estimatingListHandlers: Record<string, CommandHandler> = {
  "estimating-list": async (args) => {
    const flags = parseLongFlags(args.slice(1));
    const q = typeof flags.q === "string" ? flags.q.trim().toLowerCase() : "";
    const contractorQ =
      typeof flags.contractor === "string"
        ? flags.contractor.trim().toLowerCase()
        : "";
    const groupQ =
      typeof flags.group === "string" ? flags.group.trim().toLowerCase() : "";

    const contractFilterRaw =
      typeof flags.contract === "string" ? flags.contract : "";
    const contractMode = getContractMode(flags, contractFilterRaw);

    const includeAllGroups = flags["include-all-groups"] === true;
    const jsonOut = flags.json === true;

    const limitRaw = flags.limit;
    const limit =
      typeof limitRaw === "string"
        ? Number.parseInt(limitRaw, 10)
        : Number.NaN;
    const maxOut = Number.isFinite(limit) && limit > 0 ? limit : 500;

    const items = await getItems(BOARD_IDS.ESTIMATING);
    const excludePatterns = includeAllGroups ? [] : DEFAULT_GROUP_EXCLUDES;

    let rows = items.filter((item) => {
      if (excludePatterns.length > 0 && groupExcluded(item.groupTitle, excludePatterns)) {
        return false;
      }
      if (q && !item.name.toLowerCase().includes(q)) {
        return false;
      }
      const contractor =
        item.columns[CONTRACTOR_MIRROR_ID]?.trim() ?? "";
      if (contractorQ && !contractor.toLowerCase().includes(contractorQ)) {
        return false;
      }
      if (groupQ && !item.groupTitle.toLowerCase().includes(groupQ)) {
        return false;
      }
      const cs = item.columns[CONTRACT_STATUS_ID]?.trim();
      if (contractMode === "open" && isExecutedContract(cs)) {
        return false;
      }
      if (contractMode === "executed" && !isExecutedContract(cs)) {
        return false;
      }
      return true;
    });

    rows = rows.slice(0, maxOut);

    if (jsonOut) {
      console.log(
        JSON.stringify(
          rows.map((item) => ({
            id: item.id,
            name: item.name,
            group: item.groupTitle,
            url: item.url,
            contractStatus: item.columns[CONTRACT_STATUS_ID] ?? null,
            bidStatus: item.columns[BID_STATUS_ID] ?? null,
            contractor: item.columns[CONTRACTOR_MIRROR_ID] ?? null,
          })),
          null,
          2
        )
      );
      return;
    }

    console.log(
      `Showing ${rows.length} estimate(s) (cap --limit ${maxOut}, fetched ${items.length} total).`
    );
    console.log(
      `Columns: contract=${CONTRACT_STATUS_ID} bid=${BID_STATUS_ID} contractor(mirror)=${CONTRACTOR_MIRROR_ID}`
    );
    for (const item of rows) {
      const cs = item.columns[CONTRACT_STATUS_ID] ?? "—";
      const bid = item.columns[BID_STATUS_ID] ?? "—";
      const acct = item.columns[CONTRACTOR_MIRROR_ID] ?? "—";
      console.log(
        `\n${item.name}\n  id ${item.id}  group: ${item.groupTitle}\n  contract: ${cs}  bid: ${bid}\n  contractor: ${acct}\n  ${item.url}`
      );
    }
  },
};
